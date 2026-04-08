const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Event = require('../models/Event');
const User = require('../models/User');
const Notification = require('../models/Notification');
const {
  asyncHandler,
  NotFoundError,
  ValidationError,
  ConflictError
} = require('../middleware/errorHandler');

const completeRegistrationAfterPayment = async (req, event, payment) => {
  const success = event.registerUser(req.user._id);
  if (!success) {
    throw new ConflictError('Event became full before registration could be completed');
  }

  await event.save();

  await User.findByIdAndUpdate(req.user._id, {
    $push: { joinedEvents: event._id },
    $inc: { eventAttendanceCount: 1 }
  });

  await Notification.createPaymentSuccess(
    req.user._id,
    event._id,
    event.title,
    payment.amount
  );

  req.app.get('io').to(`user-${req.user._id}`).emit('payment_success', {
    type: 'payment_success',
    message: `Payment confirmed for "${event.title}"`,
    eventId: event._id,
    amount: payment.amount
  });
};

const buildRazorpayReceipt = (eventId, userId) => {
  const eventPart = String(eventId).slice(-8);
  const userPart = String(userId).slice(-8);
  const timePart = Date.now().toString().slice(-8);
  return `cc_${eventPart}_${userPart}_${timePart}`.slice(0, 40);
};

// Initialize Razorpay instance
const initializeRazorpay = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

// Verify Razorpay payment signature
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  return expectedSignature === signature;
};

// Create Razorpay order
const createOrder = asyncHandler(async (req, res) => {
  const { eventId, amount } = req.body;

  // Validate event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }

  // Check if event exists and is accepting registrations
  if (!event.isRegistrationOpen) {
    throw new ValidationError('Event registration is closed or full');
  }

  // Check if user is already registered
  if (event.isUserRegistered(req.user._id)) {
    throw new ConflictError('You are already registered for this event');
  }

  // Check availability
  if (event.availableSlots <= 0) {
    throw new ValidationError('Event is full');
  }

  // Validate amount matches event price
  if (amount !== event.price) {
    throw new ValidationError('Payment amount does not match event price');
  }

  const razorpay = initializeRazorpay();

  const options = {
    amount: amount * 100, // Convert to paise
    currency: 'INR',
    receipt: buildRazorpayReceipt(eventId, req.user._id),
    notes: {
      eventId: eventId.toString(),
      userId: req.user._id.toString()
    }
  };

  try {
    const order = await razorpay.orders.create(options);

    // Create payment record
    const payment = new Payment({
      userId: req.user._id,
      eventId,
      amount: amount * 100,
      razorpayOrderId: order.id,
      status: 'pending'
    });

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt
        },
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    if (error?.error?.description) {
      throw new ValidationError(error.error.description);
    }
    throw new ValidationError('Failed to create payment order');
  }
});

// Verify Razorpay payment and complete registration
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, eventId } = req.body;

  // Validate inputs
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('Missing payment verification details');
  }

  // Verify payment signature
  const isValidSignature = verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );

  if (!isValidSignature) {
    throw new ValidationError('Invalid payment signature');
  }

  // Find payment record
  const payment = await Payment.findOne({
    razorpayOrderId,
    userId: req.user._id,
    eventId,
    status: 'pending'
  });

  if (!payment) {
    throw new NotFoundError('Payment record');
  }

  // Verify payment with Razorpay
  const razorpay = initializeRazorpay();
  try {
    const razorpayPayment = await razorpay.payments.fetch(razorpayPaymentId);

    if (razorpayPayment.status !== 'captured') {
      throw new ValidationError('Payment was not successful');
    }

    // Update payment record
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = 'completed';
    payment.paymentMethod = razorpayPayment.method;
    payment.transactionId = razorpayPayment.id;
    await payment.save();

    // Get event details
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event');
    }

    // Register user for event
    const success = event.registerUser(req.user._id);
    if (!success) {
      // Refund payment if event became full
      try {
        await razorpay.payments.refund(razorpayPaymentId, {
          amount: payment.amount
        });
        payment.status = 'refunded';
        payment.refundAmount = payment.amount;
        payment.refundDate = new Date();
        await payment.save();
      } catch (refundError) {
        console.error('Refund failed:', refundError);
      }
      throw new ConflictError('Event became full. Payment will be refunded.');
    }

    await event.save();

    // Update user's joined events
    await User.findByIdAndUpdate(req.user._id, {
      $push: { joinedEvents: eventId },
      $inc: { eventAttendanceCount: 1 }
    });

    // Create confirmation notification
    await Notification.createPaymentSuccess(
      req.user._id,
      eventId,
      event.title,
      payment.amount
    );

    // Send real-time notification
    req.app.get('io').to(`user-${req.user._id}`).emit('payment_success', {
      type: 'payment_success',
      message: `Payment of ₹${payment.amount/100} confirmed for "${event.title}"`,
      eventId,
      amount: payment.amount
    });

    // Generate confirmation code
    const confirmationCode = `CONF${eventId.toString().slice(-6).toUpperCase()}`;

    res.status(200).json({
      success: true,
      message: 'Payment verified and registration confirmed',
      data: {
        payment: {
          id: payment._id,
          amount: payment.amount,
          status: payment.status,
          razorpayPaymentId: payment.razorpayPaymentId,
          confirmationCode
        },
        event: {
          id: event._id,
          title: event.title,
          startDate: event.startDate
        }
      }
    });
  } catch (error) {
    // Mark payment as failed
    payment.status = 'failed';
    payment.failureReason = error.message;
    await payment.save();

    console.error('Payment verification failed:', error);
    throw new ValidationError('Payment verification failed');
  }
});

const confirmExternalPayment = asyncHandler(async (req, res) => {
  const { eventId, paymentReference } = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event');
  }

  if (event.price <= 0) {
    throw new ValidationError('This event does not require an external payment');
  }

  if (!event.paymentUrl) {
    throw new ValidationError('Payment URL is not configured for this event');
  }

  if (event.isUserRegistered(req.user._id)) {
    throw new ConflictError('You are already registered for this event');
  }

  const payment = await Payment.findOne({
    userId: req.user._id,
    eventId,
    status: 'pending'
  });

  if (!payment) {
    throw new NotFoundError('Pending payment');
  }

  payment.status = 'completed';
  payment.paymentMethod = 'rupay';
  payment.paymentGateway = 'rupay_url';
  payment.transactionId = paymentReference;
  payment.externalPaymentUrl = event.paymentUrl;
  await payment.save();

  await completeRegistrationAfterPayment(req, event, payment);

  res.status(200).json({
    success: true,
    message: 'Payment reference received and registration confirmed',
    data: {
      payment: {
        id: payment._id,
        amount: payment.amount,
        transactionId: payment.transactionId,
        status: payment.status
      },
      event: {
        id: event._id,
        title: event.title,
        startDate: event.startDate
      }
    }
  });
});

// Get payment history for user
const getPaymentHistory = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    dateFrom,
    dateTo
  } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const options = {
    page: pageNum,
    limit: limitNum,
    status,
    dateFrom,
    dateTo
  };

  const [payments, total] = await Promise.all([
    Payment.getUserPaymentHistory(req.user._id, options),
    Payment.countDocuments({ userId: req.user._id })
  ]);

  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    data: {
      payments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages
      }
    }
  });
});

// Get payment details
const getPaymentDetails = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findOne({
    _id: paymentId,
    userId: req.user._id
  })
  .populate('eventId', 'title startDate eventImage')
  .lean();

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  res.status(200).json({
    success: true,
    data: { payment }
  });
});

// Process refund (admin only)
const processRefund = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { refundAmount, refundReason } = req.body;

  const payment = await Payment.findById(paymentId)
    .populate('userId', 'name email')
    .populate('eventId', 'title');

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  if (payment.status !== 'completed') {
    throw new ValidationError('Only completed payments can be refunded');
  }

  if (!payment.canBeRefunded) {
    throw new ValidationError('Payment has already been refunded');
  }

  if (refundAmount && refundAmount > payment.amount) {
    throw new ValidationError('Refund amount cannot exceed payment amount');
  }

  const razorpay = initializeRazorpay();
  try {
    const refundData = {
      amount: refundAmount || payment.amount
    };

    if (refundReason) {
      refundData.notes = { reason: refundReason };
    }

    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, refundData);

    // Update payment record
    await payment.createRefund(refundData.amount, refund.id);

    // Send notification to user
    await Notification.createRefundProcessed(
      payment.userId._id,
      payment.eventId._id,
      payment.eventId.title,
      refundData.amount
    );

    // Send real-time notification
    req.app.get('io').to(`user-${payment.userId._id}`).emit('refund_processed', {
      type: 'refund_processed',
      message: `Refund of ₹${refundData.amount/100} processed for "${payment.eventId.title}"`,
      amount: refundData.amount
    });

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status
        }
      }
    });
  } catch (error) {
    console.error('Refund processing failed:', error);
    throw new Error('Failed to process refund');
  }
});

// Get Razorpay key (client-side)
const getRazorpayKey = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      keyId: process.env.RAZORPAY_KEY_ID
    }
  });
});

module.exports = {
  createOrder,
  verifyPayment,
  confirmExternalPayment,
  getPaymentHistory,
  getPaymentDetails,
  processRefund,
  getRazorpayKey
};
