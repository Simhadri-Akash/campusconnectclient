const { validationResult, body, param, query } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// User registration validation
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('username')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-50 characters long and contain only letters, numbers, and underscores'),

  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters long and contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),

  body('name')
    .isLength({ min: 2, max: 100 })
    .trim()
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name must be 2-100 characters long and contain only letters and spaces'),

  body('collegeName')
    .isLength({ min: 2, max: 200 })
    .trim()
    .notEmpty()
    .withMessage('College name is required'),

  body('userType')
    .isIn(['student', 'staff'])
    .withMessage('User type must be student or staff'),
    
  body('state')
    .optional()
    .isLength({ max: 100 })
    .trim(),

  body('city')
    .optional()
    .isLength({ max: 100 })
    .trim(),

  
  handleValidationErrors
];

// User login validation
const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

// Email verification validation
const validateEmailVerification = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('verificationToken')
    .isLength({ min: 4, max: 6 })
    .withMessage('Verification token must be 4-6 characters long'),

  handleValidationErrors
];

// Password reset request validation
const validatePasswordResetRequest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  handleValidationErrors
];

// Password reset validation
const validatePasswordReset = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),

  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters long and contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),

  handleValidationErrors
];

// User profile update validation
const validateUserProfileUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name must be 2-100 characters long and contain only letters and spaces'),

  body('bio')
    .optional()
    .isLength({ max: 500 })
    .trim()
    .withMessage('Bio cannot exceed 500 characters'),

  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array'),

  body('interests.*')
    .optional()
    .isLength({ min: 1, max: 30 })
    .trim()
    .withMessage('Each interest must be 1-30 characters long'),

  body('state')
    .optional()
    .isLength({ max: 100 })
    .trim()
    .withMessage('State cannot exceed 100 characters'),

  body('city')
    .optional()
    .isLength({ max: 100 })
    .trim()
    .withMessage('City cannot exceed 100 characters'),

  handleValidationErrors
];

// Event creation validation
const validateEventCreation = [
  body('title')
    .isLength({ min: 5, max: 200 })
    .trim(),

  body('description')
    .isLength({ min: 10, max: 2000 })
    .trim(),

  body('category')
    .isIn(['tech', 'sports', 'cultural', 'workshop', 'academic', 'social', 'volunteer', 'career']),

  body('startDate')
    .isISO8601()
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Start date must be future');
      }
      return true;
    }),

  body('endDate')
    .isISO8601()
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start');
      }
      return true;
    }),

  body('location').notEmpty(),

  body('slotLimit').isInt({ min: 1 }),

  // 🔥 Academic credit validation
  body('creditType')
    .optional()
    .isIn([
      'experimental elective',
      'universal elective',
      'core',
      'group1',
      'group2',
      'group3'
    ]),

  // 🔥 Paid event validation
  body('isPaid').optional().isBoolean(),

  body('price')
    .optional()
    .isInt({ min: 0 }),

  body('paymentUrl')
    .optional()
    .custom((value, { req }) => {
      const isPaidEvent = req.body.isPaid === true || Number(req.body.price) > 0;

      if (isPaidEvent && !value) {
        throw new Error('Payment URL is required for paid events');
      }

      if (value) {
        try {
          new URL(value);
        } catch (error) {
          throw new Error('Payment URL must be a valid URL');
        }
      }

      return true;
    }),

  body('paymentInstructions')
    .optional()
    .isLength({ max: 500 })
    .trim()
    .withMessage('Payment instructions cannot exceed 500 characters'),

  // 🔥 Team event validation
  body('isTeamEvent').optional().isBoolean(),

  body('teamSize')
    .optional()
    .custom((value, { req }) => {
      if (req.body.isTeamEvent && (!value || value < 2)) {
        throw new Error('Team size must be >= 2');
      }
      return true;
    }),

  handleValidationErrors
];

// Club creation validation
const validateClubCreation = [
  body('name')
    .isLength({ min: 3, max: 100 })
    .trim()
    .withMessage('Club name must be 3-100 characters long'),

  body('description')
    .isLength({ min: 20, max: 2000 })
    .trim()
    .withMessage('Description must be 20-2000 characters long'),

  body('category')
    .isIn(['tech', 'sports', 'cultural', 'academic', 'arts', 'social', 'volunteer', 'professional'])
    .withMessage('Invalid category'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('meetingLocation')
    .optional()
    .isLength({ max: 300 })
    .trim()
    .withMessage('Meeting location cannot exceed 300 characters'),

  body('meetingSchedule')
    .optional()
    .isLength({ max: 200 })
    .trim()
    .withMessage('Meeting schedule cannot exceed 200 characters'),

  body('contactEmail')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  handleValidationErrors
];

// Event registration validation
const validateEventRegistration = [
  body('couponCode')
    .optional()
    .isLength({ min: 1, max: 50 })
    .trim()
    .withMessage('Coupon code must be 1-50 characters long'),

  handleValidationErrors
];

// Razorpay payment verification validation
const validatePaymentVerification = [
  body('razorpayOrderId')
    .notEmpty()
    .withMessage('Razorpay order ID is required'),

  body('razorpayPaymentId')
    .notEmpty()
    .withMessage('Razorpay payment ID is required'),

  body('razorpaySignature')
    .notEmpty()
    .withMessage('Razorpay signature is required'),

  body('eventId')
    .isMongoId()
    .withMessage('Invalid event ID'),

  handleValidationErrors
];

const validateExternalPaymentConfirmation = [
  body('eventId')
    .isMongoId()
    .withMessage('Invalid event ID'),

  body('paymentReference')
    .isLength({ min: 4, max: 120 })
    .trim()
    .withMessage('Payment reference must be 4-120 characters long'),

  handleValidationErrors
];

const validateAttendanceUpdate = [
  body('attendedUserIds')
    .isArray()
    .withMessage('attendedUserIds must be an array'),

  body('attendedUserIds.*')
    .isMongoId()
    .withMessage('Each attended user ID must be a valid Mongo ID'),

  handleValidationErrors
];

// MongoDB ID validation
const validateMongoId = (field = 'id') => [
  param(field)
    .isMongoId()
    .withMessage(`Invalid ${field}`),

  handleValidationErrors
];

// Query parameter validation for pagination
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

// Event search validation
const validateEventSearch = [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Search query must be 1-100 characters long'),

  query('category')
    .optional()
    .custom((value) => {
      const validCategories = ['tech', 'sports', 'cultural', 'workshop', 'academic', 'social', 'volunteer', 'career'];
      const categories = value.split(',');
      for (const cat of categories) {
        if (!validCategories.includes(cat.trim())) {
          throw new Error(`Invalid category: ${cat.trim()}`);
        }
      }
      return true;
    }),

  query('status')
    .optional()
    .isIn(['upcoming', 'ongoing', 'completed'])
    .withMessage('Invalid status'),

  query('priceRange')
    .optional()
    .custom((value) => {
      const validRanges = ['free', '0-500', '500-1000', '1000+'];
      if (!validRanges.includes(value) && !value.match(/^\d+-\d+$/)) {
        throw new Error('Invalid price range format');
      }
      return true;
    }),

  ...validatePagination
];

// Google OAuth validation
const validateGoogleAuth = [
  body('googleToken')
    .notEmpty()
    .withMessage('Google token is required'),

  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateEmailVerification,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateUserProfileUpdate,
  validateEventCreation,
  validateClubCreation,
  validateEventRegistration,
  validatePaymentVerification,
  validateExternalPaymentConfirmation,
  validateAttendanceUpdate,
  validateMongoId,
  validatePagination,
  validateEventSearch,
  validateGoogleAuth,
  handleValidationErrors
};
