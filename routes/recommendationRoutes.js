const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authMiddleware');
const { getRecommendedEvents } = require('../controllers/recommendationController');

router.get('/events', optionalAuth, getRecommendedEvents);

module.exports = router;
