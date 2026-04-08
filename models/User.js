const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  passwordHash: {
    type: String,
    required: function() {
      return !this.googleId; // Only required if not a Google OAuth user
    },
    minlength: [8, 'Password must be at least 8 characters long']
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  collegeName: {
    type: String,
    required: [true, 'College name is required'],
    trim: true,
    maxlength: [200, 'College name cannot exceed 200 characters']
  },
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: {
      values: ['student', 'staff', 'admin'],
      message: 'User type must be either student, staff, or admin'
    },
    default: 'student'
  },
  state: {
    type: String,
    trim: true,
    maxlength: [100, 'State cannot exceed 100 characters']
  },
  city: {
    type: String,
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters']
  },
  profilePicture: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  interests: [{
    type: String,
    trim: true
  }],
  joinedEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  joinedClubs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club'
  }],
  eventAttendanceCount: {
    type: Number,
    default: 0,
    min: 0
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  },
  verificationTokenExpiry: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpiry: {
    type: Date,
    default: null
  },
  credits: {
    total: {
      type: Number,
      default: 0
    },
    experimental: {
      type: Number,
      default: 0
    },
    universal: {
      type: Number,
      default: 0
    },
    core: {
      type: Number,
      default: 0
    },
    group1: {
      type: Number,
      default: 0
    },
    group2: {
      type: Number,
      default: 0
    },
    group3: {
      type: Number,
      default: 0
    }
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash;
      delete ret.verificationToken;
      delete ret.passwordResetToken;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
userSchema.index({ userType: 1 });
userSchema.index({ collegeName: 1 });
userSchema.index({ interests: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('passwordHash')) return next();

  try {
    // Hash password with cost of 10
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.passwordHash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to get public user profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    name: this.name,
    collegeName: this.collegeName,
    userType: this.userType,
    state: this.state,
    city: this.city,
    profilePicture: this.profilePicture,
    bio: this.bio,
    interests: this.interests,
    eventAttendanceCount: this.eventAttendanceCount,
    joinedClubs: this.joinedClubs,
    createdAt: this.createdAt
  };
};

// Method to check if verification token is valid
userSchema.methods.isVerificationTokenValid = function(token) {
  return this.verificationToken === token &&
         this.verificationTokenExpiry > Date.now();
};

// Method to check if password reset token is valid
userSchema.methods.isPasswordResetTokenValid = function(token) {
  return this.passwordResetToken === token &&
         this.passwordResetExpiry > Date.now();
};

// Static method to find users by interests
userSchema.statics.findByInterests = function(interests) {
  return this.find({
    interests: { $in: interests },
    emailVerified: true
  });
};

module.exports = mongoose.model('User', userSchema);
