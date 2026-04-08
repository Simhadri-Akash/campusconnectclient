const crypto = require("crypto");
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const {
  generateTokens,
  setAuthCookies,
  clearAuthCookies
} = require('../middleware/authMiddleware');
const {
  asyncHandler,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../middleware/errorHandler');
const {
  generateVerificationToken,
  generatePasswordResetToken,
  sendEmailVerificationOTP,
  sendPasswordResetEmail,
  sendWelcomeEmail
} = require('../utils/emailService');

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

// Register new user
const register = asyncHandler(async (req, res) => {
  console.log("REGISTER BODY:", req.body); // 🔥 ADD THIS
  const {
    email,
    username,
    password,
    name,
    collegeName,
    userType = 'student',
    state,
    city,
  } = req.body;

  // 🔐 SECURITY: Block admin registration
  if (userType === 'admin') {
    throw new ValidationError('Admin registration is not allowed');
  }

  // Allow only student and staff
  if (!['student', 'staff'].includes(userType)) {
    throw new ValidationError('Invalid user type');
  }

  // Check if user exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    if (existingUser.email === email) {
      throw new ConflictError('Email already registered');
    }
    if (existingUser.username === username) {
      throw new ConflictError('Username not available');
    }
  }

  // Generate OTP
  const verificationToken = generateVerificationToken();
  const verificationTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);
// 🔥 Role control
let finalUserType = 'student';

// Only allow staff from frontend
if (userType === 'staff') {
  finalUserType = 'staff';
}

// ❌ Never allow admin from register
  // Create user
  const user = new User({
    email,
    username,
    passwordHash: password,
    name,
    collegeName,
    userType: finalUserType,
    state,
    city,
    verificationToken,
    verificationTokenExpiry,
    emailVerified: false
  });

  await user.save();

  // Send OTP
  await sendEmailVerificationOTP(user, verificationToken);

  res.status(201).json({
    success: true,
    message: 'Registration successful. OTP sent.',
    data: {
      user: {
        id: user._id,
        email: user.email,
        username: user.username
      }
    }
  });
});

// Verify email
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, verificationToken } = req.body;

  // Find user by email and verification token
  const user = await User.findOne({
    email,
    verificationToken,
    verificationTokenExpiry: { $gt: new Date() }
  });

  if (!user) {
    throw new AuthenticationError('Invalid or expired verification code');
  }

  // Mark email as verified
  user.emailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  user.lastLogin = new Date();

  await user.save();

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(
    user._id,
    user.email,
    user.userType
  );

  // Set auth cookies
  setAuthCookies(res, accessToken, refreshToken);

  // Send welcome email
  try {
    await sendWelcomeEmail(user);
  } catch (emailError) {
    console.error('Welcome email failed:', emailError);
    // Don't fail the request if welcome email fails
  }

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
    data: {
      token: accessToken,
      refreshToken,
      user: user.getPublicProfile()
    }
  });
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    throw new AuthenticationError('Email not registered');
  }

  // Prevent normal login for Google users
  if (user.googleId && !user.passwordHash) {
    throw new AuthenticationError(
      'This account was created with Google. Please login using Google.'
    );
  }

  // Check if email is verified
  if (!user.emailVerified) {
    let verificationToken = user.verificationToken;

    // Generate new token if missing
    if (!verificationToken) {
      verificationToken = crypto.randomBytes(20).toString('hex');
      user.verificationToken = verificationToken;
      user.verificationTokenExpiry =
        Date.now() + 24 * 60 * 60 * 1000; // 24 hrs

      // 🔥 IMPORTANT: skip validation here
      await user.save({ validateBeforeSave: false });
    }

    await sendEmailVerificationOTP(user, verificationToken);

    return res.status(403).json({
      error:
        'Your email is not verified. A new verification link has been sent.'
    });
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AuthenticationError('Incorrect password');
  }

  // Update last login
  user.lastLogin = new Date();

  // 🔥 Skip validation again
  await user.save({ validateBeforeSave: false });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(
    user._id,
    user.email,
    user.userType
  );

  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      token: accessToken,
      refreshToken,
      user: user.getPublicProfile()
    }
  });
});

// Google OAuth authentication
const googleAuth = asyncHandler(async (req, res) => {
  const { googleToken } = req.body;

  // Verify Google token
  const ticket = await googleClient.verifyIdToken({
    idToken: googleToken,
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID
  });

  const payload = ticket.getPayload();
  const { email, name, picture: profilePicture } = payload;

  // Check if user exists
  let user = await User.findOne({ email });

  if (user) {
    // If user exists but doesn't have Google ID, update it
    if (!user.googleId) {
      user.googleId = payload.sub;
      await user.save();
    }
  } else {
    // Create new user for Google authentication
    const username = email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 9);

    user = new User({
      email,
      username,
      name,
      profilePicture,
      googleId: payload.sub,
      collegeName: 'Not specified', // User will need to update this
      userType: 'student',
      emailVerified: true, // Google users are pre-verified
      lastLogin: new Date()
    });

    await user.save();

    // Send welcome email to Google users
    try {
      await sendWelcomeEmail(user);
    } catch (emailError) {
      console.error('Welcome email failed:', emailError);
    }
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(
    user._id,
    user.email,
    user.userType
  );

  // Set auth cookies
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Google authentication successful',
    data: {
      token: accessToken,
      refreshToken,
      user: user.getPublicProfile(),
      isNewUser: !user.joinedEvents || user.joinedEvents.length === 0
    }
  });
});

// Forgot password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    // Always return success to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email'
    });
  }

  // Generate reset token
  const resetToken = generatePasswordResetToken();
  const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Update user with reset token
  user.passwordResetToken = resetToken;
  user.passwordResetExpiry = resetExpiry;
  await user.save();

  // Send password reset email
  try {
    await sendPasswordResetEmail(user, resetToken);
  } catch (emailError) {
    // Remove reset token if email fails
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();
    throw new Error('Failed to send password reset email');
  }

  res.status(200).json({
    success: true,
    message: 'Password reset link sent to your email'
  });
});

// Reset password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  // Find user by reset token
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpiry: { $gt: Date.now() }
  });

  if (!user) {
    throw new AuthenticationError('Invalid or expired reset link');
  }

  // Update password
  user.passwordHash = newPassword; // Will be hashed by pre-save middleware
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.lastLogin = new Date();

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successful. You can now login.'
  });
});

// Logout user
const logout = asyncHandler(async (req, res) => {
  // Clear auth cookies
  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Refresh access token
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required');
  }

  // Verify refresh token and get user
  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.userId);

  if (!user || !user.emailVerified) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user._id,
    user.email,
    user.userType
  );

  // Set new auth cookies
  setAuthCookies(res, accessToken, newRefreshToken);

  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      token: accessToken,
      refreshToken: newRefreshToken
    }
  });
});

module.exports = {
  register,
  verifyEmail,
  login,
  googleAuth,
  forgotPassword,
  resetPassword,
  logout,
  refreshToken
};