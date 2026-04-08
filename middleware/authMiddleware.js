const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Token extraction from request
const extractTokenFromRequest = (req) => {
  let token = null;

  // Try to get token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Fallback to cookie if no header token
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  return token;
};

// Main authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
        code: 'TOKEN_MISSING'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is not expired
    if (decoded.exp < Date.now() / 1000) {
      return res.status(401).json({
        success: false,
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Find user by ID
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user's email is verified
    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        error: 'Please verify your email address',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user._id;
    req.userType = user.userType;

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error during authentication',
      code: 'AUTH_ERROR'
    });
  }
};

// Optional authentication middleware - doesn't return error if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Support both "id" and "userId" fields depending on how JWT was signed
      const userId = decoded.userId || decoded.id;
      const user = await User.findById(userId).select('-passwordHash');

      if (user && user.emailVerified) {
        req.user = user;
        req.userId = user._id;
        req.userType = user.userType;
        req.isAuthenticated = true;
      } else {
        req.isAuthenticated = false;
      }
    } else {
      req.isAuthenticated = false;
    }

    next();
  } catch (error) {
    // Don't return error for optional auth, just set as not authenticated
    req.isAuthenticated = false;
    next();
  }
};

// Admin role verification middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  next();
};

// Staff or admin role verification middleware
const requireStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!['staff', 'admin'].includes(req.user.userType)) {
    return res.status(403).json({
      success: false,
      error: 'Staff or admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  next();
};

// Resource ownership verification middleware
const requireOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Admin can access any resource
    if (req.user.userType === 'admin') {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.params.userId || req.body[resourceField] || req.resource?.[resourceField];

    if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only access your own resources',
        code: 'ACCESS_DENIED'
      });
    }

    next();
  };
};

// Refresh token verification middleware
const verifyRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token is required',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    req.userId = user._id;

    next();
  } catch (error) {
    console.error('Refresh token verification error:', error.message);

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        code: 'REFRESH_TOKEN_INVALID'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error during refresh token verification',
      code: 'REFRESH_ERROR'
    });
  }
};

// Generate JWT tokens
const generateTokens = (userId, email, userType) => {
  const payload = {
    userId,
    email,
    userType
  };

  // Access token (15 minutes)
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m'
  });

  // Refresh token (7 days)
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });

  return {
    accessToken,
    refreshToken
  };
};

// Set authentication cookies
const setAuthCookies = (res, accessToken, refreshToken) => {
  // Access token cookie (httpOnly, secure, 15 minutes)
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/'
  });

  // Refresh token cookie (httpOnly, secure, 7 days)
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
};

// Clear authentication cookies
const clearAuthCookies = (res) => {
  res.clearCookie('token', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
};
// Dynamic role-based middleware (recommended)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};
module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireStaff,
  requireOwnership,
  verifyRefreshToken,
  generateTokens,
  setAuthCookies,
  clearAuthCookies,
  requireRole
};