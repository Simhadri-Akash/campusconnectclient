const express = require('express');
const router = express.Router();

// Import controller functions
const clubController = require('../controllers/clubController');

// Import middleware
const { authenticate, optionalAuth, requireRole } = require('../middleware/authMiddleware');
const {
  validateClubCreation,
  validateMongoId,
  validatePagination
} = require('../middleware/validationMiddleware');

/**
 * @route   GET /api/clubs
 * @desc    Get all clubs with filtering and pagination
 * @access  Public
 */
router.get('/', optionalAuth, validatePagination, clubController.getClubs);

/**
 * @route   GET /api/clubs/popular
 * @desc    Get popular clubs
 * @access  Public
 */
router.get('/popular', optionalAuth, clubController.getPopularClubs);

/**
 * @route   POST /api/clubs
 * @desc    Create new club
 * @access  Private (Admin)
 */
router.post(
  '/',
  authenticate,
  requireRole('admin', 'staff'),
  validateClubCreation,
  clubController.createClub
);
/**
 * @route   GET /api/clubs/my-clubs
 * @desc    Get user's joined clubs
 * @access  Private
 */
router.get('/my-clubs', authenticate, validatePagination, clubController.getUserClubs);

/**
 * @route   GET /api/clubs/:clubId
 * @desc    Get club details
 * @access  Public
 */
router.get('/:clubId', optionalAuth, validateMongoId('clubId'), clubController.getClub);

/**
 * @route   PATCH /api/clubs/:clubId
 * @desc    Update club details
 * @access  Private (Club Admin)
 */
router.patch(
  '/:clubId',
  authenticate,
  requireRole('admin', 'staff'),
  validateMongoId('clubId'),
  clubController.updateClub
);
/**
 * @route   POST /api/clubs/:clubId/join
 * @desc    Join a club
 * @access  Private
 */
router.post('/:clubId/join', authenticate, validateMongoId('clubId'), clubController.joinClub);

/**
 * @route   POST /api/clubs/:clubId/leave
 * @desc    Leave a club
 * @access  Private
 */
router.post('/:clubId/leave', authenticate, validateMongoId('clubId'), clubController.leaveClub);

/**
 * @route   DELETE /api/clubs/:clubId/members/:userId
 * @desc    Remove member from club
 * @access  Private (Club Admin)
 */
router.patch(
  '/:clubId',
  authenticate,
  requireRole('admin', 'staff'),
  validateMongoId('clubId'),
  clubController.updateClub
);
// Export router
module.exports = router;