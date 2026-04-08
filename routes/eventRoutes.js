const express = require('express');
const router = express.Router();

const eventController = require('../controllers/eventController');

const { authenticate, optionalAuth, requireStaff, requireAdmin } =
  require('../middleware/authMiddleware');

const {
  validateEventCreation,
  validateEventRegistration,
  validateAttendanceUpdate,
  validateMongoId,
  validatePagination,
  validateEventSearch
} = require('../middleware/validationMiddleware');
/**
 * @route   GET /api/events
 * @desc    Get all events with filtering and pagination
 * @access  Public
 */
router.get('/', optionalAuth, validateEventSearch, eventController.getEvents);

/**
 * @route   POST /api/events
 * @desc    Create new event
 * @access  Private (Admin/Organizer)
 */

router.post(
  '/',
  authenticate,
  requireStaff,
  validateEventCreation,
  eventController.createEvent
);
/**
 * @route   GET /api/events/my-events
 * @desc    Get user's registered events
 * @access  Private
 */
router.get('/my-events', authenticate, validatePagination, eventController.getUserEvents);
router.get('/staff/dashboard', authenticate, requireStaff, eventController.getStaffDashboard);
/**
 * @route   GET /api/events/:eventId
 * @desc    Get single event details
 * @access  Public
 */
router.get('/:eventId', optionalAuth, validateMongoId('eventId'), eventController.getEvent);

/**
 * @route   PATCH /api/events/:eventId
 * @desc    Update event details
 * @access  Private (Event Organizer/Admin)
 */
router.patch(
  '/:eventId',
  authenticate,
  requireStaff,
  validateMongoId('eventId'),
  eventController.updateEvent
);
/**
 * @route   DELETE /api/events/:eventId
 * @desc    Cancel/delete event
 * @access  Private (Event Organizer/Admin)
 */
router.delete(
  '/:eventId',
  authenticate,
  requireAdmin,
  validateMongoId('eventId'),
  eventController.deleteEvent
);
/**
 * @route   POST /api/events/:eventId/register
 * @desc    Register user for event
 * @access  Private
 */
router.post('/:eventId/register', authenticate, validateMongoId('eventId'), validateEventRegistration, eventController.registerForEvent);
router.patch('/:eventId/attendance', authenticate, requireStaff, validateMongoId('eventId'), validateAttendanceUpdate, eventController.updateEventAttendance);
router.patch('/:eventId/complete', authenticate, requireStaff, eventController.completeEvent);

/**
 * @route   POST /api/events/:eventId/unregister
 * @desc    Unregister user from event
 * @access  Private
 */
router.post('/:eventId/unregister', authenticate, validateMongoId('eventId'), eventController.unregisterFromEvent);
router.get(
  '/:eventId/participants',
  authenticate,
  requireStaff,
  validateMongoId('eventId'),
  eventController.getEventParticipants
);
router.get(
  '/staff/registrations',
  authenticate,
  requireStaff,
  eventController.getStaffEventRegistrations
);
// Export router
module.exports = router;
