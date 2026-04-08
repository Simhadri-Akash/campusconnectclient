const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Club name is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Club name must be at least 3 characters long'],
    maxlength: [100, 'Club name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Club description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters long'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  category: {
    type: String,
    required: [true, 'Club category is required'],
    enum: {
      values: ['tech', 'sports', 'cultural', 'academic', 'arts', 'social', 'volunteer', 'professional'],
      message: 'Category must be one of: tech, sports, cultural, academic, arts, social, volunteer, professional'
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  memberCount: {
    type: Number,
    default: 0,
    min: 0
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Club admin is required'],
    ref: 'User'
  },
  adminName: {
    type: String,
    required: [true, 'Admin name is required'],
    trim: true,
    maxlength: [100, 'Admin name cannot exceed 100 characters']
  },
  clubLogo: {
    type: String,
    default: null
  },
  clubBanner: {
    type: String,
    default: null
  },
  meetingLocation: {
    type: String,
    trim: true,
    maxlength: [300, 'Meeting location cannot exceed 300 characters']
  },
  meetingSchedule: {
    type: String,
    trim: true,
    maxlength: [200, 'Meeting schedule cannot exceed 200 characters']
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  department: {
    type: String,
    default: null
  },
  clubHead: {
    type: String,
    default: null
  },
  socialLinks: {
    instagram: {
      type: String,
      trim: true,
      match: [/^(https?:\/\/)?(www\.)?instagram\.com\/.*/, 'Please enter a valid Instagram URL']
    },
    discord: {
      type: String,
      trim: true,
      match: [/^(https?:\/\/)?(www\.)?discord\.(gg|com)\/.*/, 'Please enter a valid Discord URL']
    },
    website: {
      type: String,
      trim: true,
      match: [/^(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}.*$/, 'Please enter a valid website URL']
    },
    facebook: {
      type: String,
      trim: true,
      match: [/^(https?:\/\/)?(www\.)?facebook\.com\/.*/, 'Please enter a valid Facebook URL']
    },
    twitter: {
      type: String,
      trim: true,
      match: [/^(https?:\/\/)?(www\.)?twitter\.com\/.*/, 'Please enter a valid Twitter URL']
    }
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'archived'],
      message: 'Status must be one of: active, inactive, archived'
    },
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
clubSchema.index({ category: 1 });
clubSchema.index({ adminId: 1 });
clubSchema.index({ tags: 1 });
clubSchema.index({ status: 1 });
clubSchema.index({ memberCount: -1 });
clubSchema.index({ category: 1, status: 1 });

// Pre-save middleware to update member count
clubSchema.pre('save', function(next) {
  if (this.isModified('members')) {
    this.memberCount = this.members.length;
  }
  next();
});

clubSchema.methods.isMember = function(userId) {
  return this.members.some(member => member.toString() === userId.toString());
};

clubSchema.methods.isAdmin = function(userId) {
  return this.adminId.toString() === userId.toString();
};

clubSchema.methods.addMember = function(userId) {
  if (!this.isMember(userId)) {
    this.members.push(userId);
    return true;
  }
  return false;
};

clubSchema.methods.removeMember = function(userId) {
  const index = this.members.findIndex(member => member.toString() === userId.toString());
  if (index !== -1) {
    this.members.splice(index, 1);
    return true;
  }
  return false;
};

clubSchema.methods.getPublicMembers = function(limit = 50) {
  return this.members.slice(0, limit);
};

clubSchema.statics.findActive = function(limit = 20) {
  return this.find({ status: 'active' })
    .sort({ memberCount: -1 })
    .limit(limit)
    .populate('adminId', 'name username profilePicture');
};

clubSchema.statics.searchClubs = function(query, filters = {}) {
  const searchCriteria = {
    $and: [{ status: 'active' }]
  };

  if (query) {
    searchCriteria.$and.push({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } }
      ]
    });
  }

  if (filters.category) {
    const categories = filters.category.split(',');
    searchCriteria.$and.push({ category: { $in: categories } });
  }

  return searchCriteria.$and.length === 1 ? { status: 'active' } : searchCriteria;
};

clubSchema.statics.getPopularClubs = function(limit = 10, category = null) {
  const filter = { status: 'active' };
  if (category) {
    filter.category = category;
  }

  return this.find(filter)
    .sort({ memberCount: -1 })
    .limit(limit)
    .populate('adminId', 'name username profilePicture');
};

clubSchema.virtual('isAcceptingMembers').get(function() {
  return this.status === 'active';
});

clubSchema.virtual('events', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'clubId'
});

module.exports = mongoose.model('Club', clubSchema);
