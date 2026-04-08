const express = require('express');
const router = express.Router();

// Controllers
const userController = require('../controllers/userController');

// Middleware
const { authenticate } = require('../middleware/authMiddleware');
const {
  validateUserProfileUpdate,
  validateMongoId
} = require('../middleware/validationMiddleware');

/**
 * @route   GET /api/users/credits
 * @desc    Get user credit details
 * @access  Private
 */
router.get('/credits', authenticate, userController.getUserCredits);
/**
 * @route   GET /api/users/profile
 */
router.get('/profile', authenticate, userController.getProfile);

/**
 * @route   PATCH /api/users/profile
 */
router.patch(
  '/profile',
  authenticate,
  validateUserProfileUpdate,
  userController.updateProfile
);

/**
 * @route   GET /api/users/dashboard
 */
router.get('/dashboard', authenticate, userController.getDashboard);

/**
 * @route   PATCH /api/users/interests
 */
router.patch('/interests', authenticate, userController.updateInterests);

/**
 * @route   POST /api/users/profile-picture
 */
router.post('/profile-picture', authenticate, userController.uploadProfilePicture);

/**
 * @route   POST /api/users/change-password
 */
router.post('/change-password', authenticate, userController.changePassword);

/**
 * @route   DELETE /api/users/delete-account
 */
router.delete('/delete-account', authenticate, userController.deleteAccount);

/**
 * @route   GET /api/users/:userId
 */
router.get('/:userId', validateMongoId('userId'), userController.getPublicProfile);

module.exports = router;