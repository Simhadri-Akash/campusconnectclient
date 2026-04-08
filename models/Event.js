const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters long'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Event description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  category: {
    type: String,
    required: [true, 'Event category is required'],
    enum: {
      values: ['tech', 'sports', 'cultural', 'workshop', 'academic', 'social', 'volunteer', 'career'],
      message: 'Category must be one of: tech, sports, cultural, workshop, academic, social, volunteer, career'
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    validate: {
      validator: function(value) {
        return value > Date.now();
      },
      message: 'Start date must be in the future'
    }
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  location: {
    type: String,
    required: [true, 'Event location is required'],
    trim: true,
    maxlength: [300, 'Location cannot exceed 300 characters']
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Organizer is required'],
    ref: 'User'
  },
  organizerName: {
    type: String,
    required: [true, 'Organizer name is required'],
    trim: true,
    maxlength: [100, 'Organizer name cannot exceed 100 characters']
  },
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    default: null
  },
  clubName: {
    type: String,
    default: null
  },
  registeredUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  attendedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  registrationCount: {
    type: Number,
    default: 0,
    min: 0
  },
  slotLimit: {
    type: Number,
    required: [true, 'Slot limit is required'],
    min: [1, 'Slot limit must be at least 1'],
    max: [10000, 'Slot limit cannot exceed 10000']
  },
  price: {
    type: Number,
    default: 0,
    min: [0, 'Price cannot be negative'],
    max: [50000, 'Price cannot exceed 50000']
  },
  status: {
    type: String,
    enum: {
      values: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      message: 'Status must be one of: upcoming, ongoing, completed, cancelled'
    },
    default: 'upcoming'
  },
  eventImage: {
    type: String,
    default: null
  },
  agenda: [{
    time: {
      type: String,
      required: true,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format']
    },
    activity: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Activity description cannot exceed 200 characters']
    }
  }],
  speakers: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Speaker name cannot exceed 100 characters']
    },
    role: {
      type: String,
      required: true,
      trim: true,
      maxlength: [150, 'Speaker role cannot exceed 150 characters']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Speaker bio cannot exceed 500 characters']
    }
  }],
  requirements: [{
    type: String,
    trim: true,
    maxlength: [200, 'Requirement cannot exceed 200 characters']
  }],
  maxWaitlist: {
    type: Number,
    default: 0,
    min: 0
  },
  waitlistedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  creditType: {
    type: String,
    enum: [
      'experimental elective',
      'universal elective',
      'core',
      'group1',
      'group2',
      'group3'
    ],
    default: null
  },
  creditValue: {
    type: Number,
    default: 0
  },
  creditsAwarded: {
    type: Boolean,
    default: false
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paymentId: {
    type: String,
    default: null
  },
  paymentUrl: {
    type: String,
    default: null,
    trim: true
  },
  paymentInstructions: {
    type: String,
    default: null,
    trim: true,
    maxlength: [500, 'Payment instructions cannot exceed 500 characters']
  },
  isTeamEvent: {
    type: Boolean,
    default: false
  },
  teamSize: {
    type: Number,
    default: 1
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  aiScore: {
    type: Number,
    default: 0
  },
  rejectionReason: {
    type: String,
    default: null
  },
  adminApproved: {
    type: Boolean,
    default: false
  },
  registrationDeadline: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value < this.startDate;
      },
      message: 'Registration deadline must be before event start date'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
eventSchema.index({ category: 1 });
eventSchema.index({ organizerId: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ startDate: 1, status: 1 });
eventSchema.index({ category: 1, status: 1 });
eventSchema.index({ price: 1 });

// Virtual for checking if event is free
eventSchema.virtual('isFree').get(function() {
  return this.price === 0;
});

// Virtual for available slots
eventSchema.virtual('availableSlots').get(function() {
  return Math.max(0, this.slotLimit - this.registrationCount);
});

// Virtual for checking if registration is still open
eventSchema.virtual('isRegistrationOpen').get(function() {
  const now = new Date();
  const deadline = this.registrationDeadline || this.startDate;
  return now < deadline && this.status === 'upcoming' && this.availableSlots > 0;
});

// Pre-save middleware to update registration count
eventSchema.pre('save', function(next) {
  if (this.isModified('registeredUsers')) {
    this.registrationCount = this.registeredUsers.length;
  }
  next();
});

// Pre-save middleware to update status based on dates
eventSchema.pre('save', function(next) {
  const now = new Date();

  if (this.status !== 'cancelled') {
    if (now >= this.startDate && now <= this.endDate) {
      this.status = 'ongoing';
    } else if (now > this.endDate) {
      this.status = 'completed';
    } else if (now < this.startDate) {
      this.status = 'upcoming';
    }
  }

  next();
});

eventSchema.methods.isUserRegistered = function(userId) {
  return this.registeredUsers.some(user => user.toString() === userId.toString());
};

eventSchema.methods.registerUser = function(userId) {
  if (!this.isUserRegistered(userId) && this.availableSlots > 0) {
    this.registeredUsers.push(userId);
    return true;
  }
  return false;
};

eventSchema.methods.unregisterUser = function(userId) {
  const index = this.registeredUsers.findIndex(user => user.toString() === userId.toString());
  if (index !== -1) {
    this.registeredUsers.splice(index, 1);
    return true;
  }
  return false;
};

eventSchema.methods.addToWaitlist = function(userId) {
  if (!this.waitlistedUsers.includes(userId) && this.maxWaitlist > 0) {
    if (this.waitlistedUsers.length < this.maxWaitlist) {
      this.waitlistedUsers.push(userId);
      return true;
    }
  }
  return false;
};

eventSchema.statics.findUpcoming = function(limit = 10) {
  return this.find({
    status: 'upcoming',
    startDate: { $gt: new Date() }
  }).sort({ startDate: 1 }).limit(limit);
};

eventSchema.statics.searchEvents = function(query, filters = {}) {
  const searchCriteria = {
    $and: []
  };
  const now = new Date();

  if (query) {
    searchCriteria.$and.push({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } }
      ]
    });
  }

  if (filters.category) {
    const categories = filters.category.split(',');
    searchCriteria.$and.push({ category: { $in: categories } });
  }

  if (filters.status) {
    if (filters.status === 'upcoming') {
      searchCriteria.$and.push({
        status: { $ne: 'cancelled' },
        startDate: { $gt: now }
      });
    } else if (filters.status === 'ongoing') {
      searchCriteria.$and.push({
        status: { $ne: 'cancelled' },
        startDate: { $lte: now },
        endDate: { $gte: now }
      });
    } else if (filters.status === 'completed') {
      searchCriteria.$and.push({
        status: { $ne: 'cancelled' },
        endDate: { $lt: now }
      });
    } else {
      searchCriteria.$and.push({ status: filters.status });
    }
  }

  if (filters.priceRange) {
    const priceFilter = {};
    if (filters.priceRange === 'free') {
      priceFilter.price = 0;
    } else if (filters.priceRange.includes('-')) {
      const [min, max] = filters.priceRange.split('-').map(Number);
      priceFilter.price = { $gte: min || 0 };
      if (max) {
        priceFilter.price.$lte = max;
      }
    }

    if (Object.keys(priceFilter).length > 0) {
      searchCriteria.$and.push(priceFilter);
    }
  }

  return searchCriteria.$and.length === 0 ? {} : searchCriteria;
};

module.exports = mongoose.model('Event', eventSchema);
