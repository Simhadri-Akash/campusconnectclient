const { getChatResponse } = require('../services/eventDiscoveryService');

exports.chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const response = await getChatResponse({
      message,
      user: req.user
    });

    return res.json({
      success: true,
      ...response
    });
  } catch (error) {
    console.error('Chatbot Error:', error);

    return res.json({
      success: true,
      reply:
        "Sorry, I couldn't process that. Try asking about upcoming events, tech events, or recommendations.",
      events: [],
      suggestions: ['Upcoming events', 'Tech events', 'Free workshops']
    });
  }
};
