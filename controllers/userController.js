const User = require('../models/User');
const Event = require('../models/Event');
const Club = require('../models/Club');
const {
  asyncHandler,
  NotFoundError,
  ValidationError,
  ConflictError
} = require('../middleware/errorHandler');

// Get authenticated user's full profile
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('joinedEvents', 'title startDate eventImage')
    .populate('joinedClubs', 'name clubLogo category')
    .lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Remove sensitive fields
  delete user.passwordHash;
  delete user.verificationToken;
  delete user.passwordResetToken;

  res.status(200).json({
    success: true,
    data: { user }
  });
});

// Update user profile (non-auth fields)
const updateProfile = asyncHandler(async (req, res) => {
  const allowedUpdates = [
    'name', 'bio', 'interests', 'profilePicture', 'state', 'city'
  ];

  const updates = {};
  Object.keys(req.body).forEach(key => {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  // Validate interests if provided
  if (updates.interests && !Array.isArray(updates.interests)) {
    throw new ValidationError('Interests must be an array');
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  )
  .populate('joinedEvents', 'title startDate eventImage')
  .populate('joinedClubs', 'name clubLogo category')
  .lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Remove sensitive fields
  delete user.passwordHash;
  delete user.verificationToken;
  delete user.passwordResetToken;

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
});

// Get public user profile
const getPublicProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId)
    .populate('joinedClubs', 'name clubLogo category')
    .lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Return only public profile data
  const publicProfile = user.getPublicProfile();

  res.status(200).json({
    success: true,
    data: { user: publicProfile }
  });
});

// Update user interests
const updateInterests = asyncHandler(async (req, res) => {
  const { interests } = req.body;

  if (!Array.isArray(interests)) {
    throw new ValidationError('Interests must be an array');
  }

  if (interests.length > 20) {
    throw new ValidationError('Maximum 20 interests allowed');
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { interests },
    { new: true, runValidators: true }
  )
  .populate('joinedEvents', 'title startDate eventImage')
  .populate('joinedClubs', 'name clubLogo category')
  .lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Remove sensitive fields
  delete user.passwordHash;
  delete user.verificationToken;
  delete user.passwordResetToken;

  res.status(200).json({
    success: true,
    message: 'Interests updated successfully',
    data: { user }
  });
});

// Upload profile picture
const uploadProfilePicture = asyncHandler(async (req, res) => {
  // This would handle file upload using multer and Cloudinary
  // For now, we'll accept a URL from the request body
  const { profilePicture } = req.body;

  if (!profilePicture) {
    throw new ValidationError('Profile picture URL is required');
  }

  // Basic URL validation
  try {
    new URL(profilePicture);
  } catch {
    throw new ValidationError('Invalid profile picture URL');
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { profilePicture },
    { new: true, runValidators: true }
  )
  .populate('joinedEvents', 'title startDate eventImage')
  .populate('joinedClubs', 'name clubLogo category')
  .lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Remove sensitive fields
  delete user.passwordHash;
  delete user.verificationToken;
  delete user.passwordResetToken;

  res.status(200).json({
    success: true,
    message: 'Profile picture updated successfully',
    data: { user }
  });
});

// Get user's dashboard data
const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get user's data
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new NotFoundError('User');
  }

  // Get upcoming events the user is registered for
  const upcomingEvents = await Event.find({
    _id: { $in: user.joinedEvents },
    startDate: { $gte: new Date() },
    status: 'upcoming'
  })
  .sort({ startDate: 1 })
  .limit(5)
  .select('title startDate location eventImage')
  .lean();

  // Get recent notifications
  const Notification = require('../models/Notification');
  const recentNotifications = await Notification.getUserNotifications(userId, {
    limit: 5,
    sort: { createdAt: -1 }
  });

  // Get user's clubs
  const userClubs = await Club.find({
    _id: { $in: user.joinedClubs }
  })
  .select('name clubLogo category memberCount')
  .sort({ memberCount: -1 })
  .limit(5)
  .lean();

  res.status(200).json({
    success: true,
    data: {
      user: {
        name: user.name,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        eventAttendanceCount: user.eventAttendanceCount,
        joinedEventsCount: user.joinedEvents.length,
        joinedClubsCount: user.joinedClubs.length
      },
      upcomingEvents,
      recentNotifications: recentNotifications.map(n => n.getSummary()),
      userClubs
    }
  });
});

// Change password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new ValidationError('Current password is incorrect');
  }

  // Validate new password
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
  if (!passwordRegex.test(newPassword)) {
    throw new ValidationError('New password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters long');
  }

  // Update password
  user.passwordHash = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});


const getUserCredits = asyncHandler(async (req, res) => {
    console.log("User ID:", req.user._id);
  const user = await User.findById(req.user._id).select('credits');
  console.log("Credits from DB:", user?.credits);
  res.status(200).json({
    success: true,
    data: user.credits
  });
});
// Delete user account
const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new ValidationError('Password is required to delete account');
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ValidationError('Password is incorrect');
  }

  // Remove user from all events and clubs
  await Event.updateMany(
    { registeredUsers: req.user._id },
    { $pull: { registeredUsers: req.user._id } }
  );

  await Club.updateMany(
    { members: req.user._id },
    { $pull: { members: req.user._id } }
  );

  // Delete user's notifications
  const Notification = require('../models/Notification');
  await Notification.deleteMany({ userId: req.user._id });

  // Delete user's payments
  const Payment = require('../models/Payment');
  await Payment.deleteMany({ userId: req.user._id });

  // Delete user
  await User.findByIdAndDelete(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully'
  });
});

module.exports = {
  getProfile,
  updateProfile,
  getPublicProfile,
  updateInterests,
  uploadProfilePicture,
  getDashboard,
  getUserCredits,
  changePassword,
  deleteAccount
};