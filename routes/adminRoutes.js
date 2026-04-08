const express = require('express');
const router = express.Router();

const { authenticate, requireAdmin } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Event = require('../models/Event');

// ✅ Apply middleware to all admin routes
router.use(authenticate, requireAdmin);


// 📊 Admin Dashboard Stats
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ userType: 'student' });
    const totalStaff = await User.countDocuments({ userType: 'staff' });
    const totalEvents = await Event.countDocuments();

    res.json({
      success: true,
      data: {
        totalUsers,
        totalStudents,
        totalStaff,
        totalEvents
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ✅ Approve event
router.put('/events/:id/approve', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    event.verificationStatus = 'approved';
    event.isPublished = true;
    event.adminApproved = true;

    await event.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ❌ Reject event
router.put('/events/:id/reject', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    event.verificationStatus = 'rejected';
    event.isPublished = false;

    await event.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 👥 Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ❌ Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 📅 Get all events
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find();
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ❌ Delete event
router.delete('/events/:id', async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;