const { getEventRecommendations } = require('../services/eventDiscoveryService');

exports.getRecommendedEvents = async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 6;
    const category = req.query.category || null;

    const recommendations = await getEventRecommendations({
      user: req.user,
      limit,
      category
    });

    return res.status(200).json({
      success: true,
      data: {
        events: recommendations
      }
    });
  } catch (error) {
    console.error('Recommendation error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to load recommendations'
    });
  }
};
