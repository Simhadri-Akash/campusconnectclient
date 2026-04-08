const Event = require('../models/Event');

const CATEGORY_KEYWORDS = {
  tech: ['tech', 'coding', 'hackathon', 'developer', 'ai', 'software'],
  sports: ['sport', 'sports', 'football', 'cricket', 'basketball', 'match', 'tournament'],
  cultural: ['cultural', 'dance', 'music', 'fest', 'festival', 'art'],
  workshop: ['workshop', 'session', 'training', 'bootcamp'],
  academic: ['academic', 'seminar', 'lecture', 'research', 'study'],
  social: ['social', 'networking', 'meetup', 'community'],
  volunteer: ['volunteer', 'ngo', 'service', 'charity'],
  career: ['career', 'placement', 'internship', 'resume', 'interview']
};

const DEFAULT_SUGGESTIONS = [
  'Upcoming events',
  'Tech events this week',
  'Free workshops',
  'Recommend events for me'
];

const normalize = (value = '') => value.toString().trim().toLowerCase();

const detectIntent = (text) => {
  const normalized = normalize(text);

  return {
    normalized,
    wantsFree: normalized.includes('free'),
    wantsUpcoming:
      normalized.includes('upcoming') ||
      normalized.includes('next event') ||
      normalized.includes('coming up'),
    wantsRecommendation:
      normalized.includes('recommend') ||
      normalized.includes('suggest') ||
      normalized.includes('for me'),
    wantsThisWeek:
      normalized.includes('this week') ||
      normalized.includes('week'),
    wantsToday:
      normalized.includes('today') ||
      normalized.includes('tonight')
  };
};

const getApprovedUpcomingEvents = async () => {
  return Event.find({
    isPublished: true,
    verificationStatus: 'approved',
    status: 'upcoming',
    startDate: { $gte: new Date() }
  })
    .sort({ startDate: 1 })
    .select(
      'title description category tags startDate endDate location price registrationCount slotLimit eventImage clubName'
    )
    .lean();
};

const inferCategoryFromText = (text) => {
  const normalized = normalize(text);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return null;
};

const buildEventSummary = (event) => ({
  id: event._id,
  title: event.title,
  category: event.category,
  location: event.location,
  startDate: event.startDate,
  price: event.price,
  eventImage: event.eventImage || null,
  clubName: event.clubName || null,
  availableSlots: Math.max(0, (event.slotLimit || 0) - (event.registrationCount || 0))
});

const scoreEventForUser = (event, user, text, category, wantsFree) => {
  let score = 0;
  const normalizedText = normalize(text);
  const title = normalize(event.title);
  const description = normalize(event.description);
  const location = normalize(event.location);
  const tags = (event.tags || []).map(normalize);

  if (category && event.category === category) {
    score += 5;
  }

  if (wantsFree && event.price === 0) {
    score += 3;
  }

  if (normalizedText) {
    if (title.includes(normalizedText)) score += 6;
    if (description.includes(normalizedText)) score += 4;
    if (location.includes(normalizedText)) score += 3;
    if (tags.some((tag) => tag.includes(normalizedText))) score += 4;

    const words = normalizedText.split(/\s+/).filter(Boolean);
    words.forEach((word) => {
      if (title.includes(word)) score += 2;
      if (description.includes(word)) score += 1;
      if (location.includes(word)) score += 1;
      if (tags.some((tag) => tag.includes(word))) score += 1;
    });
  }

  const interests = Array.isArray(user?.interests)
    ? user.interests.map(normalize)
    : [];

  interests.forEach((interest) => {
    if (event.category.includes(interest)) score += 3;
    if (title.includes(interest)) score += 3;
    if (description.includes(interest)) score += 2;
    if (tags.some((tag) => tag.includes(interest))) score += 2;
  });

  const daysUntilEvent =
    (new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (daysUntilEvent <= 3) score += 2;
  else if (daysUntilEvent <= 7) score += 1;

  return score;
};

const recommendEvents = ({
  events,
  user,
  text = '',
  category = null,
  wantsFree = false,
  limit = 4,
  allowGenericMatches = false
}) => {
  const ranked = events
    .map((event) => ({
      event,
      score: scoreEventForUser(event, user, text, category, wantsFree)
    }))
    .filter(({ event, score }) => {
      if (category && event.category !== category) return false;
      if (wantsFree && event.price !== 0) return false;
      return score > 0 || !text || allowGenericMatches;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.event.startDate) - new Date(b.event.startDate);
    })
    .slice(0, limit)
    .map(({ event }) => buildEventSummary(event));

  return ranked;
};

const getEventsForIntent = ({ events, user, message, category, intent, limit = 4 }) => {
  let filteredEvents = [...events];

  if (category) {
    filteredEvents = filteredEvents.filter((event) => event.category === category);
  }

  if (intent.wantsFree) {
    filteredEvents = filteredEvents.filter((event) => event.price === 0);
  }

  if (intent.wantsToday) {
    filteredEvents = filteredEvents.filter((event) => {
      const diffDays =
        (new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays < 1.25;
    });
  } else if (intent.wantsThisWeek) {
    filteredEvents = filteredEvents.filter((event) => {
      const diffDays =
        (new Date(event.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    });
  }

  const shouldUseGenericPool =
    intent.wantsUpcoming ||
    intent.wantsRecommendation ||
    intent.wantsThisWeek ||
    intent.wantsToday;

  if (shouldUseGenericPool) {
    return filteredEvents
      .slice(0, limit)
      .map((event) => buildEventSummary(event));
  }

  return recommendEvents({
    events: filteredEvents,
    user,
    text: message,
    category,
    wantsFree: intent.wantsFree,
    limit,
    allowGenericMatches: true
  });
};

const buildChatReply = ({ recommendations, category, intent }) => {
  const normalized = intent.normalized;

  if (!recommendations.length) {
    if (intent.wantsUpcoming || intent.wantsRecommendation) {
      return "I couldn't find any approved upcoming events right now. Once more events are published, I'll recommend them here.";
    }

    if (category) {
      return `I couldn't find any ${category} events right now. Try asking for upcoming events or another category.`;
    }

    if (intent.wantsFree) {
      return "I couldn't find any free events right now. Try asking for upcoming events or workshops.";
    }

    if (intent.wantsToday) {
      return "I couldn't find any events happening today. Try asking for this week's events or upcoming events.";
    }

    if (intent.wantsThisWeek) {
      return "I couldn't find any events for this week. Try asking for upcoming events or a specific category like tech.";
    }

    return "I couldn't find a strong match for that right now. Try asking about upcoming events, free workshops, or a category like tech or sports.";
  }

  if (intent.wantsUpcoming) {
    return 'Here are the upcoming events I found:';
  }

  if (normalized.includes('recommend')) {
    return 'These are the best event picks for you right now:';
  }

  if (normalized.includes('free')) {
    return 'Here are the free events I found for you:';
  }

  if (normalized.includes('today')) {
    return 'Here are the events closest to today:';
  }

  if (normalized.includes('week')) {
    return 'Here are some good events coming up this week:';
  }

  if (category) {
    return `Here are the ${category} events that match your request:`;
  }

  return 'Here are some events that match what you asked for:';
};

const buildSuggestions = (category) => {
  if (!category) return DEFAULT_SUGGESTIONS;

  return [
    'Upcoming events',
    `${category[0].toUpperCase()}${category.slice(1)} events`,
    'Free events',
    'Recommend events for me'
  ];
};

const getChatResponse = async ({ message, user }) => {
  const events = await getApprovedUpcomingEvents();
  const category = inferCategoryFromText(message);
  const intent = detectIntent(message);

  const recommendations = getEventsForIntent({
    events,
    user,
    message,
    category,
    intent,
    limit: 4
  });

  return {
    reply: buildChatReply({
      recommendations,
      category,
      intent
    }),
    events: recommendations,
    suggestions: buildSuggestions(category)
  };
};

const getEventRecommendations = async ({ user, limit = 6, category = null }) => {
  const events = await getApprovedUpcomingEvents();

  const recommendations = recommendEvents({
    events,
    user,
    text: Array.isArray(user?.interests) ? user.interests.join(' ') : '',
    category,
    wantsFree: false,
    limit
  });

  return recommendations;
};

module.exports = {
  getChatResponse,
  getEventRecommendations
};
