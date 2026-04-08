const Event = require('../models/Event');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const validateEventWithAI = require('../services/aiEventValidator');
const {
  asyncHandler,
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError
} = require('../middleware/errorHandler');

const buildExternalPaymentUrl = (event) => {
  const params = new URLSearchParams({
    eventId: event._id.toString(),
    title: event.title,
    amount: event.price.toString()
  });

  let paymentUrl = event.paymentUrl || '/payments/mock';

  if (paymentUrl.includes('payments.campusconnect.dev')) {
    paymentUrl = '/payments/mock';
  }

  const separator = paymentUrl.includes('?') ? '&' : '?';
  return `${paymentUrl}${separator}${params.toString()}`;
};

const getRuntimeStatus = (event) => {
  if (event.status === 'cancelled') {
    return 'cancelled';
  }

  const now = new Date();
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  if (now < startDate) {
    return 'upcoming';
  }
  if (now >= startDate && now <= endDate) {
    return 'ongoing';
  }
  return 'completed';
};

const finalizeEventRegistration = async ({ req, event, userId, payment = null }) => {
  const success = event.registerUser(userId);
  if (!success) {
    throw new ConflictError('Event is full');
  }

  await event.save();

  await User.findByIdAndUpdate(userId, {
    $push: { joinedEvents: event._id },
    $inc: { eventAttendanceCount: 1 }
  });

  if (payment) {
    payment.status = 'completed';
    await payment.save();
  }

  await Notification.createEventRegistration(userId, event._id, event.title);

  req.app.get('io').to(`user-${userId}`).emit('event_registered', {
    type: 'event_registered',
    message: `Successfully registered for "${event.title}"`,
    eventId: event._id
  });
};

const getCreditField = (creditType) => {
  const fieldMap = {
    'experimental elective': 'experimental',
    'universal elective': 'universal',
    core: 'core',
    group1: 'group1',
    group2: 'group2',
    group3: 'group3'
  };

  return fieldMap[creditType];
};

// Get all events with filtering and pagination
const getEvents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    category,
    search,
    sortBy = 'date_asc',
    priceRange,
    status = 'upcoming'
  } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // 🔥 Base search filters
  const searchFilters = Event.searchEvents(search, { category, status, priceRange });

  let finalFilters = {};

  // 🔥 Public or student → only approved
  if (!req.user || req.user.userType === 'student') {
    finalFilters = {
      ...searchFilters,
      isPublished: true,
      verificationStatus: 'approved'
    };
  }

  // 🔥 Staff → own + approved
  else if (req.user.userType === 'staff') {
    finalFilters = {
      $and: [
        searchFilters,
        {
          $or: [
            { organizerId: req.user._id },
            { isPublished: true, verificationStatus: 'approved' }
          ]
        }
      ]
    };
  }

  // 🔥 Admin → everything
  else {
    finalFilters = searchFilters;
  }

  // 🔥 Sorting
  let sort = {};
  switch (sortBy) {
    case 'date_desc':
      sort = { startDate: -1 };
      break;
    case 'popularity':
      sort = { registrationCount: -1 };
      break;
    default:
      sort = { startDate: 1 };
  }

  const [events, total] = await Promise.all([
    Event.find(finalFilters)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('organizerId', 'name username')
      .lean(),
    Event.countDocuments(finalFilters)
  ]);

  const eventsWithStatus = events.map(event => ({
    ...event,
    status: getRuntimeStatus(event),
    availableSlots: event.slotLimit - event.registrationCount,
    isRegistrationOpen:
      new Date() < new Date(event.registrationDeadline || event.startDate) &&
      getRuntimeStatus(event) === 'upcoming' &&
      event.slotLimit - event.registrationCount > 0,
    isUserRegistered: req.user
      ? event.registeredUsers.some(id => id.toString() === req.user._id.toString())
      : false
  }));

  res.json({
    success: true,
    data: {
      events: eventsWithStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total
      }
    }
  });
});
const completeEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);

  if (!event) throw new NotFoundError('Event');

  // Only organizer or admin
  if (
    req.user.userType !== 'admin' &&
    event.organizerId.toString() !== req.user._id.toString()
  ) {
    throw new AuthorizationError('Not allowed');
  }

  // Mark event as completed
  event.status = 'completed';
  const creditSummary = await updateStudentCredits(event);
  await event.save();

  res.json({
    success: true,
    message:
      creditSummary.awardedCount > 0
        ? `Event completed and credits awarded to ${creditSummary.awardedCount} attendee${creditSummary.awardedCount > 1 ? 's' : ''}`
        : 'Event completed. No credits were awarded because no attendees were marked.'
  });
});
// 🔥 Add credits to students after event completion
const updateStudentCredits = async (event) => {
  if (!event.creditType || !event.creditValue) {
    return { awardedCount: 0, creditField: null };
  }

  if (event.creditsAwarded) {
    return { awardedCount: 0, creditField: getCreditField(event.creditType) };
  }

  const creditField = getCreditField(event.creditType);

  if (!creditField) {
    return { awardedCount: 0, creditField: null };
  }

  const attendeeIds = (event.attendedUsers || []).map(id => id.toString());
  if (attendeeIds.length === 0) {
    return { awardedCount: 0, creditField };
  }

  await User.updateMany(
    { _id: { $in: attendeeIds } },
    {
      $inc: {
        [`credits.${creditField}`]: event.creditValue,
        'credits.total': event.creditValue
      }
    }
  );

  await Promise.all(
    attendeeIds.map((userId) =>
      Notification.createCreditsAwarded(
        userId,
        event._id,
        event.title,
        event.creditValue,
        event.creditType
      )
    )
  );

  event.creditsAwarded = true;
  return { awardedCount: attendeeIds.length, creditField };
};

const updateEventAttendance = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { attendedUserIds } = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }

  if (
    req.user.userType !== 'admin' &&
    event.organizerId.toString() !== req.user._id.toString()
  ) {
    throw new AuthorizationError('Not allowed');
  }

  if (event.status === 'completed') {
    throw new ValidationError('Attendance cannot be changed after the event is completed');
  }

  const registeredUserIds = new Set(event.registeredUsers.map((id) => id.toString()));
  const sanitizedAttendance = attendedUserIds.filter((userId) => registeredUserIds.has(userId));

  event.attendedUsers = sanitizedAttendance;
  await event.save();

  res.json({
    success: true,
    message: 'Attendance updated successfully',
    data: {
      eventId: event._id,
      attendedUserIds: sanitizedAttendance,
      attendedCount: sanitizedAttendance.length
    }
  });
});
// Get single event details
const getEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId)
    .populate('organizerId', 'name username profilePicture')
    .populate('registeredUsers', 'name username profilePicture')
    .lean();

  if (!event) {
    throw new NotFoundError('Event');
  }

  // Check if user is registered
  const isUserRegistered = req.user && event.registeredUsers.some(userId =>
    userId._id.toString() === req.user._id.toString()
  );

  const availableSlots = event.slotLimit - event.registrationCount;
  const runtimeStatus = getRuntimeStatus(event);

  res.status(200).json({
    success: true,
    data: {
      event: {
        ...event,
        status: runtimeStatus,
        isUserRegistered,
        availableSlots,
        isRegistrationOpen: availableSlots > 0 &&
          runtimeStatus === 'upcoming' &&
          new Date() < (event.registrationDeadline || event.startDate)
      }
    }
  });
});

// Create new event (admin/organizer only)
const createEvent = asyncHandler(async (req, res) => {
  const eventData = {
    ...req.body,
    isPaid: Number(req.body.price) > 0 || req.body.isPaid === true,
    paymentUrl: req.body.paymentUrl || null,
    paymentInstructions: req.body.paymentInstructions || null,
    organizerId: req.user._id,
    organizerName: req.user.name
  };

  // 🔥 AI validation before saving
  let aiResult = {
    status: 'pending',
    score: 0,
    issues: [],
    suggestedTags: [],
    summary: 'AI review could not run.'
  };

  // 🔥 Staff auto approval
  try {
    aiResult = await validateEventWithAI(eventData);
  } catch (err) {
    aiResult.issues = ['AI review unavailable'];
  }
  eventData.verificationStatus = aiResult.status;
  eventData.isPublished = aiResult.status === 'approved';
  eventData.aiScore = aiResult.score || 0;
  eventData.rejectionReason = aiResult.issues?.length ? aiResult.issues.join('; ') : null;
  if ((!req.body.tags || req.body.tags.length === 0) && aiResult.suggestedTags?.length) {
    eventData.tags = aiResult.suggestedTags;
  }

  // Create event
  const event = new Event(eventData);
  await event.save();

  await event.populate('organizerId', 'name username');

  res.status(201).json({
    success: true,
    message:
      aiResult.status === 'approved'
        ? 'Event created and approved successfully'
        : aiResult.status === 'pending'
          ? 'Event created and sent for AI/manual review'
          : 'Event created but rejected by AI review. Please fix the flagged issues.',
    data: {
      event,
      aiReview: aiResult
    }
  });
});
// Update event details (organizer/admin only)
const updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }
  if (req.body.status === 'completed') {
    await updateStudentCredits(event);
  }
  // Check authorization
  if (req.user.userType !== 'admin' && event.organizerId.toString() !== req.user._id.toString()) {
    throw new AuthorizationError('You can only update your own events');
  }

  // Don't allow changing start date if event has started
  if (req.body.startDate && new Date(req.body.startDate) < new Date()) {
    throw new ValidationError('Cannot update start date to past time');
  }

  Object.assign(event, req.body);
  event.isPaid = Number(event.price) > 0 || event.isPaid === true;

  let aiResult = {
    status: 'pending',
    score: 0,
    issues: ['AI review unavailable'],
    suggestedTags: [],
    summary: 'AI review could not run.'
  };

  try {
    aiResult = await validateEventWithAI(event.toObject());
  } catch (error) {
    // Keep the fallback above so event updates do not fail when AI review is unavailable.
  }
  event.aiScore = aiResult.score || 0;
  event.rejectionReason = aiResult.issues?.length ? aiResult.issues.join('; ') : null;
  event.verificationStatus = aiResult.status;
  event.isPublished = aiResult.status === 'approved';
  await event.save();

  await event.populate('organizerId', 'name username');

  res.status(200).json({
    success: true,
    message:
      aiResult.status === 'approved'
        ? 'Event updated and approved successfully'
        : aiResult.status === 'pending'
          ? 'Event updated and sent for AI/manual review'
          : 'Event updated, but AI review rejected it until the issues are fixed',
    data: { event, aiReview: aiResult }
  });
});

// Delete/cancel event (organizer/admin only)
const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }
  if (event.status === 'completed') {
    await updateStudentCredits(event);
  }
  // Check authorization
  if (req.user.userType !== 'admin' && event.organizerId.toString() !== req.user._id.toString()) {
    throw new AuthorizationError('You can only delete your own events');
  }

  // Mark as cancelled instead of deleting
  event.status = 'cancelled';
  await event.save();

  // Send notifications to registered users
  if (event.registeredUsers.length > 0) {
    const notificationPromises = event.registeredUsers.map(userId =>
      Notification.createEventCancellation(userId, eventId, event.title)
    );
    await Promise.all(notificationPromises);
  }

  res.status(200).json({
    success: true,
    message: 'Event cancelled successfully',
    data: { event }
  });
});

// Register user for event
const registerForEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { couponCode } = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }

  // Check if event is still accepting registrations
  if (!event.isRegistrationOpen) {
    throw new ConflictError('Event registration is closed or full');
  }

  // Check if user is already registered
  if (event.isUserRegistered(req.user._id)) {
    throw new ConflictError('You are already registered for this event');
  }

  const userId = req.user._id;

  if (event.price === 0) {
    const payment = await Payment.create({
      userId,
      eventId,
      amount: 0,
      razorpayOrderId: `FREE_${eventId}_${userId}_${Date.now()}`,
      paymentGateway: 'internal',
      status: 'completed'
    });

    await finalizeEventRegistration({ req, event, userId, payment });

    res.status(200).json({
      success: true,
      message: 'Successfully registered for event',
      data: {
        registration: {
          eventId,
          userId,
          registrationDate: new Date(),
          confirmationCode: `CONF${eventId.toString().slice(-6).toUpperCase()}`,
          paymentRequired: false
        }
      }
    });
  } else {
    if (!event.paymentUrl) {
      throw new ValidationError('This paid event does not have a payment URL configured yet');
    }

    let payment = await Payment.findOne({
      userId,
      eventId,
      status: { $in: ['pending', 'failed'] }
    });

    if (!payment) {
      payment = new Payment({
        userId,
        eventId,
        amount: event.price * 100,
        razorpayOrderId: `EXTERNAL_${eventId}_${userId}`,
        paymentGateway: 'rupay_url',
        paymentMethod: 'rupay',
        externalPaymentUrl: event.paymentUrl,
        status: 'pending'
      });
    } else {
      payment.amount = event.price * 100;
      payment.paymentGateway = 'rupay_url';
      payment.paymentMethod = 'rupay';
      payment.externalPaymentUrl = event.paymentUrl;
      payment.status = 'pending';
      payment.failureReason = null;
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Open the payment URL and confirm your RuPay payment to complete registration',
      data: {
        paymentRequired: true,
        payment: {
          paymentId: payment._id,
          amount: event.price,
          currency: 'INR',
          paymentUrl: buildExternalPaymentUrl(event),
          paymentInstructions:
            event.paymentInstructions ||
            'Use the provided RuPay payment link and then submit your transaction reference to confirm registration.',
          eventId,
          confirmationRequired: true
        }
      }
    });
  }
});

// Unregister from event
const unregisterFromEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }

  // Check if user is registered
  if (!event.isUserRegistered(req.user._id)) {
    throw new ConflictError('You are not registered for this event');
  }

  // Don't allow unregistration if event has started
  if (new Date() >= event.startDate) {
    throw new ValidationError('Cannot unregister from event that has started');
  }

  const userId = req.user._id;
  const success = event.unregisterUser(userId);

  if (!success) {
    throw new ValidationError('Failed to unregister from event');
  }

  await event.save();

  // Update user's joined events
  await User.findByIdAndUpdate(userId, {
    $pull: { joinedEvents: eventId },
    $inc: { eventAttendanceCount: -1 }
  });

  // Handle refund if paid event
  let refundStatus = 'no_refund';
  const payment = await Payment.findOne({
    userId,
    eventId,
    status: 'completed'
  });

  if (payment && payment.amount > 0) {
    // TODO: Implement Razorpay refund logic
    refundStatus = 'refund_initiated';

    // Create refund notification
    await Notification.createRefundProcessed(userId, eventId, event.title, payment.amount);
  }

  res.status(200).json({
    success: true,
    message: 'Unregistered successfully',
    data: { refundStatus }
  });
});

// Get user's registered events
const getUserEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Build query
  const query = { registeredUsers: req.user._id };
  if (status) {
    query.status = status;
  }

  const [events, total] = await Promise.all([
    Event.find(query)
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('organizerId', 'name username')
      .lean(),
    Event.countDocuments(query)
  ]);
  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    data: {
      events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages
      }
    }
  });
});
const getStaffDashboard = asyncHandler(async (req, res) => {
  const staffId = req.user._id;

  const totalEvents = await Event.countDocuments({ organizerId: staffId });

  const upcomingEvents = await Event.find({
    organizerId: staffId,
    startDate: { $gte: new Date() }
  }).limit(5);

  const totalParticipants = await Event.aggregate([
    { $match: { organizerId: staffId } },
    { $group: { _id: null, total: { $sum: '$registrationCount' } } }
  ]);

  const revenue = await Payment.aggregate([
    { $match: { organizerId: staffId, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const pendingAI = await Event.countDocuments({
    organizerId: staffId,
    verificationStatus: 'pending'
  });

  res.json({
    success: true,
    data: {
      totalEvents,
      totalParticipants: totalParticipants[0]?.total || 0,
      revenue: revenue[0]?.total || 0,
      pendingAI,
      upcomingEvents
    }
  });
});
// 🔥 Get participants of an event (STAFF / ADMIN)
const getEventParticipants = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId)
    .populate('registeredUsers', 'name email userType')
    .lean();

  if (!event) throw new NotFoundError('Event');

  // Only organizer or admin
  if (
    req.user.userType !== 'admin' &&
    event.organizerId.toString() !== req.user._id.toString()
  ) {
    throw new AuthorizationError('Not allowed');
  }

  res.json({
    success: true,
    data: {
      eventTitle: event.title,
      participants: event.registeredUsers.map((participant) => ({
        ...participant,
        hasAttended: (event.attendedUsers || []).some(
          (attendedId) => attendedId.toString() === participant._id.toString()
        )
      })),
      attendedCount: event.attendedUsers?.length || 0,
      creditsConfigured: Boolean(event.creditType && event.creditValue),
      creditType: event.creditType,
      creditValue: event.creditValue,
      eventStatus: event.status
    }
  });
});
const getStaffEventRegistrations = async (req, res) => {
  try {
    const events = await Event.find({ organizerId: req.user._id })
      .populate('registeredUsers', 'name email');

    const formatted = events.map((event) => ({
      _id: event._id,
      title: event.title,
      participants: event.registeredUsers,
      registrationCount: event.registrationCount
    }));

    res.json({
      success: true,
      data: { events: formatted }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  completeEvent,
  registerForEvent,
  getStaffDashboard,
  unregisterFromEvent,
  getUserEvents,
  updateEventAttendance,
  getEventParticipants,
  getStaffEventRegistrations
};
