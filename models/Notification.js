const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: {
      values: [
        'event_registration',
        'payment_success',
        'payment_failed',
        'club_invite',
        'club_join_request',
        'event_reminder',
        'event_cancellation',
        'refund_processed',
        'welcome',
        'system',
        'recommendation_update',
        'credits_awarded'
      ],
      message: 'Invalid notification type'
    }
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  relatedEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  relatedClubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club'
  },
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  actionUrl: {
    type: String,
    trim: true
  },
  actionText: {
    type: String,
    trim: true,
    maxlength: [50, 'Action text cannot exceed 50 characters']
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be one of: low, medium, high, urgent'
    },
    default: 'medium'
  },
  category: {
    type: String,
    enum: {
      values: ['events', 'clubs', 'payments', 'system', 'social'],
      message: 'Category must be one of: events, clubs, payments, system, social'
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  expiresAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
notificationSchema.index({ userId: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if notification is recent (within 24 hours)
notificationSchema.virtual('isRecent').get(function() {
  const now = new Date();
  const hoursDiff = (now - this.createdAt) / (1000 * 60 * 60);
  return hoursDiff <= 24;
});

// Virtual for formatted creation time
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
});

// Pre-save middleware to set expiration and category
notificationSchema.pre('save', function(next) {
  // Set expiration date for certain notification types
  if (!this.expiresAt && ['event_reminder', 'event_cancellation'].includes(this.type)) {
    // Expire event-related notifications after 7 days
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  // Set category based on type if not explicitly set
  if (!this.category) {
    if (this.type.includes('event') || this.type.includes('payment')) {
      this.category = 'events';
    } else if (this.type.includes('club')) {
      this.category = 'clubs';
    } else if (this.type === 'welcome' || this.type === 'system') {
      this.category = 'system';
    } else {
      this.category = 'social';
    }
  }

  next();
});

// Static method to create different types of notifications
notificationSchema.statics.createEventRegistration = function(userId, eventId, eventTitle) {
  return this.create({
    userId,
    type: 'event_registration',
    title: 'Event Registration Successful',
    message: `You have successfully registered for "${eventTitle}"`,
    relatedEventId: eventId,
    actionUrl: `/events/${eventId}`,
    actionText: 'View Event',
    priority: 'high',
    category: 'events'
  });
};

notificationSchema.statics.createPaymentSuccess = function(userId, eventId, eventTitle, amount) {
  return this.create({
    userId,
    type: 'payment_success',
    title: 'Payment Successful',
    message: `Payment of ₹${amount/100} confirmed for "${eventTitle}"`,
    relatedEventId: eventId,
    actionUrl: `/events/${eventId}`,
    actionText: 'View Event',
    priority: 'high',
    category: 'events',
    metadata: { amount }
  });
};

notificationSchema.statics.createEventReminder = function(userId, eventId, eventTitle, startDate) {
  return this.create({
    userId,
    type: 'event_reminder',
    title: 'Event Reminder',
    message: `"${eventTitle}" is starting tomorrow at ${startDate.toLocaleTimeString()}`,
    relatedEventId: eventId,
    actionUrl: `/events/${eventId}`,
    actionText: 'View Details',
    priority: 'medium',
    category: 'events'
  });
};

notificationSchema.statics.createEventCancellation = function(userId, eventId, eventTitle) {
  return this.create({
    userId,
    type: 'event_cancellation',
    title: 'Event Cancelled',
    message: `"${eventTitle}" has been cancelled. Refunds will be processed if applicable.`,
    relatedEventId: eventId,
    priority: 'high',
    category: 'events'
  });
};

notificationSchema.statics.createClubInvite = function(userId, clubId, clubName, invitedBy) {
  return this.create({
    userId,
    type: 'club_invite',
    title: 'Club Invitation',
    message: `You've been invited to join "${clubName}" by ${invitedBy}`,
    relatedClubId: clubId,
    actionUrl: `/clubs/${clubId}`,
    actionText: 'View Club',
    priority: 'medium',
    category: 'clubs'
  });
};

notificationSchema.statics.createWelcomeNotification = function(userId, userName) {
  return this.create({
    userId,
    type: 'welcome',
    title: 'Welcome to CampusConnect!',
    message: `Hi ${userName}! Welcome to CampusConnect. Start exploring events and clubs on your campus.`,
    actionUrl: '/events',
    actionText: 'Explore Events',
    priority: 'medium',
    category: 'system'
  });
};

notificationSchema.statics.createRefundProcessed = function(userId, eventId, eventTitle, refundAmount) {
  return this.create({
    userId,
    type: 'refund_processed',
    title: 'Refund Processed',
    message: `Refund of ₹${refundAmount/100} has been processed for "${eventTitle}"`,
    relatedEventId: eventId,
    priority: 'medium',
    category: 'events',
    metadata: { refundAmount }
  });
};

notificationSchema.statics.createCreditsAwarded = function(userId, eventId, eventTitle, creditValue, creditType) {
  return this.create({
    userId,
    type: 'credits_awarded',
    title: 'Credits Awarded',
    message: `You earned ${creditValue} ${creditType} credit${creditValue > 1 ? 's' : ''} for attending "${eventTitle}"`,
    relatedEventId: eventId,
    actionUrl: `/events/${eventId}`,
    actionText: 'View Event',
    priority: 'medium',
    category: 'events',
    metadata: { creditValue, creditType }
  });
};

// Static method to get user notifications with pagination
notificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const query = { userId };

  // Add unread filter if specified
  if (options.unreadOnly) {
    query.isRead = false;
  }

  // Add category filter if specified
  if (options.category) {
    query.category = options.category;
  }

  const sort = options.sort || { createdAt: -1 };
  const limit = options.limit || 20;
  const page = options.page || 1;
  const skip = (page - 1) * limit;

  return this.find(query)
    .populate('relatedEventId', 'title eventImage')
    .populate('relatedClubId', 'name clubLogo')
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

// Static method to mark notifications as read
notificationSchema.statics.markAsRead = function(userId, notificationIds = null) {
  const query = { userId };
  if (notificationIds) {
    query._id = { $in: notificationIds };
  }

  return this.updateMany(query, { isRead: true });
};

// Static method to delete old notifications
notificationSchema.statics.deleteOldNotifications = function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true
  });
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

// Instance method to get notification summary
notificationSchema.methods.getSummary = function() {
  return {
    id: this._id,
    type: this.type,
    title: this.title,
    message: this.message,
    timeAgo: this.timeAgo,
    isRead: this.isRead,
    priority: this.priority,
    actionUrl: this.actionUrl,
    actionText: this.actionText,
    relatedEventId: this.relatedEventId,
    relatedClubId: this.relatedClubId
  };
};

module.exports = mongoose.model('Notification', notificationSchema);
