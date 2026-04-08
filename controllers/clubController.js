const Club = require('../models/Club');
const User = require('../models/User');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const {
  asyncHandler,
  NotFoundError,
  ConflictError,
  AuthorizationError
} = require('../middleware/errorHandler');

// Get all clubs with filtering and pagination
const getClubs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    category,
    search,
    sortBy = 'members_desc'
  } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Build search criteria
  const searchCriteria = Club.searchClubs(search, { category });

  // Determine sort order
  let sort = {};
  switch (sortBy) {
    case 'members_desc':
      sort = { memberCount: -1 };
      break;
    case 'name_asc':
      sort = { name: 1 };
      break;
    case 'recent':
      sort = { createdAt: -1 };
      break;
    default:
      sort = { memberCount: -1 };
  }

  // Execute query with pagination
  const [clubs, total] = await Promise.all([
    Club.find(searchCriteria)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('adminId', 'name username profilePicture')
      .lean(),
    Club.countDocuments(searchCriteria)
  ]);

  // Check if user is authenticated to add membership status
  let clubsWithMembershipStatus = clubs;
  if (req.user) {
    clubsWithMembershipStatus = clubs.map(club => ({
      ...club,
      isUserMember: club.members.some(memberId =>
        memberId.toString() === req.user._id.toString()
      )
    }));
  }

  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    data: {
      clubs: clubsWithMembershipStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    }
  });
});

// Get single club details
const getClub = asyncHandler(async (req, res) => {
  const { clubId } = req.params;

  const club = await Club.findById(clubId)
    .populate('adminId', 'name username profilePicture')
    .populate('members', 'name username profilePicture userType')
    .lean();

  if (!club) {
    throw new NotFoundError('Club');
  }

  const members = Array.isArray(club.members) ? club.members.slice(0, 50) : [];
  const clubEvents = await Event.find({
    clubId,
    verificationStatus: 'approved',
    isPublished: true
  })
    .sort({ startDate: 1 })
    .select('title category startDate endDate location price status eventImage registrationCount slotLimit')
    .lean();

  // Check if user is member
  const isUserMember = !!(req.user && club.members.some(member =>
    member._id.toString() === req.user._id.toString()
  ));
  const isUserAdmin = !!(req.user &&
    club.adminId &&
    club.adminId._id.toString() === req.user._id.toString()
  );

  res.status(200).json({
    success: true,
    data: {
      club: {
        ...club,
        members,
        events: clubEvents,
        isUserMember,
        isUserAdmin
      }
    }
  });
});

// Create new club (admin only)
const createClub = asyncHandler(async (req, res) => {
  const clubData = {
    ...req.body,
    adminId: req.user._id,
    adminName: req.user.name,
    members: [req.user._id]
  };

  // ✅ Create club
  const club = new Club(clubData);
  club.memberCount = 1;

  await club.save();

  // ✅ Update user joined clubs
  await User.findByIdAndUpdate(req.user._id, {
    $push: { joinedClubs: club._id }
  });

  await club.populate('adminId', 'name username profilePicture');

  res.status(201).json({
    success: true,
    message: 'Club created successfully',
    data: { club }
  });
});

// Update club details (admin only)
const updateClub = asyncHandler(async (req, res) => {
  const { clubId } = req.params;

  const club = await Club.findById(clubId);
  if (!club) {
    throw new NotFoundError('Club');
  }

  // Check authorization
  if (req.user.userType !== 'admin' && club.adminId.toString() !== req.user._id.toString()) {
    throw new AuthorizationError('Only club admin can update club details');
  }

  Object.assign(club, req.body);
  await club.save();

  await club.populate('adminId', 'name username profilePicture');

  res.status(200).json({
    success: true,
    message: 'Club updated successfully',
    data: { club }
  });
});

// Join a club
const joinClub = asyncHandler(async (req, res) => {
  const { clubId } = req.params;

  const club = await Club.findById(clubId);
  if (!club) {
    throw new NotFoundError('Club');
  }

  const userId = req.user._id;

  // Check if user is already a member
  if (club.isMember(userId)) {
    throw new ConflictError('You are already a member of this club');
  }

  // Check if club is accepting members
  if (!club.isAcceptingMembers) {
    throw new ConflictError('Club is not accepting new members at the moment');
  }

  const success = club.addMember(userId);
  if (!success) {
    throw new ConflictError('Failed to join club');
  }

  await club.save();

  // Update user's joined clubs
  await User.findByIdAndUpdate(userId, {
    $push: { joinedClubs: clubId }
  });

  // Send notification to club admin
  await Notification.createClubInvite(
    club.adminId,
    clubId,
    club.name,
    req.user.name
  );

  // Send real-time notification
  req.app.get('io').to(`user-${club.adminId}`).emit('club_notification', {
    type: 'club_joined',
    message: `${req.user.name} joined your club "${club.name}"`,
    clubId
  });

  res.status(200).json({
    success: true,
    message: 'Successfully joined club',
    data: { club }
  });
});

// Leave a club
const leaveClub = asyncHandler(async (req, res) => {
  const { clubId } = req.params;

  const club = await Club.findById(clubId);
  if (!club) {
    throw new NotFoundError('Club');
  }

  const userId = req.user._id;

  // Check if user is a member
  if (!club.isMember(userId)) {
    throw new ConflictError('You are not a member of this club');
  }

  // Don't allow admin to leave club (they should transfer adminship first)
  if (club.adminId.toString() === userId.toString()) {
    throw new AuthorizationError('Club admin cannot leave club. Transfer adminship first.');
  }

  const success = club.removeMember(userId);
  if (!success) {
    throw new ConflictError('Failed to leave club');
  }

  await club.save();

  // Update user's joined clubs
  await User.findByIdAndUpdate(userId, {
    $pull: { joinedClubs: clubId }
  });

  res.status(200).json({
    success: true,
    message: 'Left club successfully'
  });
});

// Get user's joined clubs
const getUserClubs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [clubs, total] = await Promise.all([
    Club.find({ members: req.user._id })
      .sort({ memberCount: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('adminId', 'name username')
      .lean(),
    Club.countDocuments({ members: req.user._id })
  ]);

  // Add membership status for each club
  const clubsWithStatus = clubs.map(club => ({
    ...club,
    isUserMember: true,
    isUserAdmin: club.adminId.toString() === req.user._id.toString()
  }));

  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    data: {
      clubs: clubsWithStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages
      }
    }
  });
});

// Get popular clubs
const getPopularClubs = asyncHandler(async (req, res) => {
  const { limit = 8, category } = req.query;
  const limitNum = parseInt(limit);

  const clubs = await Club.getPopularClubs(limitNum, category);

  // Add membership status if authenticated
  if (req.user) {
    const clubsWithStatus = clubs.map(club => ({
      ...club,
      isUserMember: club.members.some(memberId =>
        memberId.toString() === req.user._id.toString()
      )
    }));
    return res.status(200).json({
      success: true,
      data: { clubs: clubsWithStatus }
    });
  }

  res.status(200).json({
    success: true,
    data: { clubs }
  });
});

// Remove member from club (admin only)
const removeMember = asyncHandler(async (req, res) => {
  const { clubId, userId } = req.params;

  const club = await Club.findById(clubId);
  if (!club) {
    throw new NotFoundError('Club');
  }

  // Check authorization
  if (req.user.userType !== 'admin' && club.adminId.toString() !== req.user._id.toString()) {
    throw new AuthorizationError('Only club admin can remove members');
  }

  // Don't allow admin to remove themselves
  if (club.adminId.toString() === userId) {
    throw new ValidationError('Cannot remove club admin from members');
  }

  // Check if user is a member
  if (!club.isMember(userId)) {
    throw new ConflictError('User is not a member of this club');
  }

  const success = club.removeMember(userId);
  if (!success) {
    throw new ConflictError('Failed to remove member');
  }

  await club.save();

  // Update user's joined clubs
  await User.findByIdAndUpdate(userId, {
    $pull: { joinedClubs: clubId }
  });

  res.status(200).json({
    success: true,
    message: 'Member removed successfully'
  });
});

module.exports = {
  getClubs,
  getClub,
  createClub,
  updateClub,
  joinClub,
  leaveClub,
  getUserClubs,
  getPopularClubs,
  removeMember
};
