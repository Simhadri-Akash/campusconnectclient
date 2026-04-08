const express = require('express');
const router = express.Router();

// Import controller functions
const authController = require('../controllers/authController');

// Import validation middleware
const {
  validateUserRegistration,
  validateUserLogin,
  validateEmailVerification,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateGoogleAuth
} = require('../middleware/validationMiddleware');

// Import rate limiting for sensitive routes
const rateLimit = require('express-rate-limit');

// stricter rate limiting for sensitive auth operations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    errorCode: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authLimiter, validateUserRegistration, authController.register);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify user email with OTP or magic link
 * @access  Public
 */
router.post('/verify-email', authLimiter, validateEmailVerification, authController.verifyEmail);

/**
 * @route   POST /api/auth/login
 * @desc    Login user with email and password
 * @access  Public
 */
router.post('/login', authLimiter, validateUserLogin, authController.login);

/**
 * @route   POST /api/auth/google
 * @desc    Authenticate with Google OAuth
 * @access  Public
 */
router.post('/google', authLimiter, validateGoogleAuth, authController.googleAuth);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset
 * @access  Public
 */
router.post('/forgot-password', authLimiter, validatePasswordResetRequest, authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Complete password reset with token
 * @access  Public
 */
router.post('/reset-password', authLimiter, validatePasswordReset, authController.resetPassword);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and clear session
 * @access  Private
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh-token', authController.refreshToken);

// Export router
module.exports = router;