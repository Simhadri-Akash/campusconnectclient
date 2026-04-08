const express = require('express');
const router = express.Router();

const { optionalAuth } = require('../middleware/authMiddleware');
const { chatWithAI } = require('../controllers/chatControllerSafe');

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Chat endpoint is available. Send a POST request with a "message" field.'
  });
});

router.post('/', optionalAuth, chatWithAI);

module.exports = router;
