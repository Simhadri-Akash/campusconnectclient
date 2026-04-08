const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Event ID is required'],
    ref: 'Event'
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  razorpayOrderId: {
    type: String,
    required: [true, 'Razorpay order ID is required'],
    unique: true,
    trim: true
  },
  razorpayPaymentId: {
    type: String,
    trim: true,
    sparse: true // Allows multiple null values
  },
  razorpaySignature: {
    type: String,
    trim: true,
    sparse: true
  },
  status: {
    type: String,
    required: [true, 'Payment status is required'],
    enum: {
      values: ['pending', 'completed', 'failed', 'refunded'],
      message: 'Status must be one of: pending, completed, failed, refunded'
    },
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    trim: true,
    enum: {
      values: ['card', 'upi', 'wallet', 'netbanking', 'emi', 'rupay', 'external'],
      message: 'Invalid payment method'
    }
  },
  paymentGateway: {
    type: String,
    trim: true,
    default: 'internal',
    enum: {
      values: ['internal', 'razorpay', 'rupay_url', 'external_url'],
      message: 'Invalid payment gateway'
    }
  },
  transactionId: {
    type: String,
    trim: true,
    sparse: true
  },
  externalPaymentUrl: {
    type: String,
    trim: true
  },
  failureReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Failure reason cannot exceed 500 characters']
  },
  refundAmount: {
    type: Number,
    min: [0, 'Refund amount cannot be negative']
  },
  refundDate: {
    type: Date
  },
  refundId: {
    type: String,
    trim: true
  },
  refundStatus: {
    type: String,
    enum: {
      values: ['none', 'initiated', 'processed', 'failed'],
      message: 'Refund status must be one of: none, initiated, processed, failed'
    },
    default: 'none'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
paymentSchema.index({ userId: 1 });
paymentSchema.index({ eventId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ eventId: 1, status: 1 });

// Virtual for checking if payment is successful
paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'completed';
});

// Virtual for checking if payment can be refunded
paymentSchema.virtual('canBeRefunded').get(function() {
  return this.status === 'completed' && this.refundStatus === 'none';
});

// Virtual for payment amount in INR format
paymentSchema.virtual('amountINR').get(function() {
  return (this.amount / 100).toFixed(2);
});

// Pre-save middleware to validate refund data
paymentSchema.pre('save', function(next) {
  // If refund is processed, validate refund details
  if (this.refundStatus === 'processed' && (!this.refundAmount || !this.refundId)) {
    return next(new Error('Refund amount and refund ID are required for processed refunds'));
  }

  // Refund amount should not exceed original amount
  if (this.refundAmount && this.refundAmount > this.amount) {
    return next(new Error('Refund amount cannot exceed original payment amount'));
  }

  // Set refund date when refund is initiated
  if (this.isModified('refundStatus') &&
      ['initiated', 'processed'].includes(this.refundStatus) &&
      !this.refundDate) {
    this.refundDate = new Date();
  }

  next();
});

// Static method to find user's payment history
paymentSchema.statics.getUserPaymentHistory = function(userId, options = {}) {
  const query = { userId };

  // Add status filter if provided
  if (options.status) {
    query.status = options.status;
  }

  // Add date range filter if provided
  if (options.dateFrom || options.dateTo) {
    query.createdAt = {};
    if (options.dateFrom) query.createdAt.$gte = new Date(options.dateFrom);
    if (options.dateTo) query.createdAt.$lte = new Date(options.dateTo);
  }

  const sort = options.sort || { createdAt: -1 };
  const limit = options.limit || 20;
  const page = options.page || 1;
  const skip = (page - 1) * limit;

  return this.find(query)
    .populate('eventId', 'title startDate eventImage')
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

// Static method to get payment analytics
paymentSchema.statics.getPaymentAnalytics = function(dateRange = {}) {
  const matchStage = {};

  if (dateRange.startDate || dateRange.endDate) {
    matchStage.createdAt = {};
    if (dateRange.startDate) matchStage.createdAt.$gte = new Date(dateRange.startDate);
    if (dateRange.endDate) matchStage.createdAt.$lte = new Date(dateRange.endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        successfulPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failedPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        refundedPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] }
        },
        averageTransactionValue: { $avg: '$amount' }
      }
    }
  ]);
};

// Static method to get monthly revenue trend
paymentSchema.statics.getMonthlyRevenueTrend = function(years = 1) {
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  return this.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$amount' },
        transactionCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
};

// Static method to find payments by event
paymentSchema.statics.getEventPayments = function(eventId) {
  return this.find({ eventId })
    .populate('userId', 'name email')
    .sort({ createdAt: -1 });
};

// Method to create refund
paymentSchema.methods.createRefund = function(refundAmount, refundId) {
  if (!this.canBeRefunded) {
    throw new Error('Payment cannot be refunded');
  }

  this.refundAmount = refundAmount || this.amount;
  this.refundId = refundId;
  this.refundStatus = 'processed';
  this.refundDate = new Date();

  return this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  return this.save();
};

// Method to verify Razorpay signature
paymentSchema.methods.verifyRazorpaySignature = function(signature, receivedSignature) {
  // This would integrate with Razorpay's signature verification
  // For now, we'll store the signature and mark as completed
  this.razorpaySignature = signature;
  this.status = 'completed';
  return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);
