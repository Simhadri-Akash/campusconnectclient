/* Legacy validator retained for reference.
const validateEventWithAI = (eventData) => {
  let score = 0;
  let issues = [];

  // 1️⃣ Description quality
  if (!eventData.description || eventData.description.length < 50) {
    issues.push('Description too short');
  } else {
    score += 1;
  }

  // 2️⃣ Title quality
  if (!eventData.title || eventData.title.length < 5) {
    issues.push('Title too short');
  } else {
    score += 1;
  }

  // 3️⃣ Academic relevance (example)
  if (!eventData.category) {
    issues.push('Category missing');
  } else {
    score += 1;
  }

  // Final decision
  if (score <= 1) {
    return { status: 'rejected', issues };
  }

  if (score === 2) {
    return { status: 'pending', issues };
  }

  return { status: 'approved', issues };
};

module.exports = validateEventWithAI;
*/

const CATEGORY_HINTS = {
  tech: ['tech', 'ai', 'code', 'software', 'developer', 'hackathon', 'product'],
  sports: ['sports', 'football', 'cricket', 'tournament', 'fitness', 'match'],
  cultural: ['dance', 'music', 'culture', 'festival', 'theatre', 'art'],
  workshop: ['workshop', 'training', 'hands-on', 'session', 'bootcamp'],
  academic: ['academic', 'seminar', 'lecture', 'research', 'study', 'paper'],
  social: ['social', 'community', 'meetup', 'networking'],
  volunteer: ['volunteer', 'service', 'charity', 'ngo', 'drive'],
  career: ['career', 'resume', 'interview', 'placement', 'internship']
};

const BLOCKED_WORDS = ['test event', 'dummy', 'lorem ipsum', 'tbd', 'coming soon'];

const normalize = (value = '') => value.toString().trim().toLowerCase();

const buildSuggestedTags = (eventData) => {
  const text = normalize(`${eventData.title || ''} ${eventData.description || ''}`);
  const tags = new Set();

  Object.entries(CATEGORY_HINTS).forEach(([category, hints]) => {
    hints.forEach((hint) => {
      if (text.includes(hint)) {
        tags.add(hint.replace(/\s+/g, '-'));
      }
    });

    if (eventData.category === category) {
      tags.add(category);
    }
  });

  return Array.from(tags).slice(0, 5);
};

const validateEventWithAI = (eventData) => {
  const issues = [];
  let score = 0;

  const title = normalize(eventData.title);
  const description = normalize(eventData.description);
  const location = normalize(eventData.location);
  const category = normalize(eventData.category);
  const paymentUrl = normalize(eventData.paymentUrl);
  const isPaid = Number(eventData.price) > 0 || eventData.isPaid === true;

  if (title.length >= 8) score += 15;
  else issues.push('Title should be more descriptive');

  if (description.length >= 80) score += 25;
  else if (description.length >= 40) {
    score += 12;
    issues.push('Description could include more details like agenda, outcome, or audience');
  } else {
    issues.push('Description is too short for approval');
  }

  if (category) score += 10;
  else issues.push('Category is missing');

  if (location.length >= 3) score += 10;
  else issues.push('Location is missing or incomplete');

  const startDate = new Date(eventData.startDate);
  const endDate = new Date(eventData.endDate);
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate) {
    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    if (durationHours >= 0.5 && durationHours <= 12) {
      score += 15;
    } else if (durationHours <= 48) {
      score += 8;
      issues.push('Event duration is unusual, please double-check the schedule');
    } else {
      issues.push('Event duration looks too long and should be reviewed');
    }
  } else {
    issues.push('Start and end times are not valid');
  }

  const categoryHints = CATEGORY_HINTS[category] || [];
  const matchingHints = categoryHints.filter((hint) => description.includes(hint) || title.includes(hint));
  if (matchingHints.length > 0) score += 10;
  else if (category) issues.push(`Description does not clearly reflect the ${category} category`);

  if (Number(eventData.slotLimit) >= 5) score += 5;
  else issues.push('Slot limit looks too small');

  if (isPaid) {
    if (paymentUrl) {
      score += 10;
    } else {
      issues.push('Paid events must include a payment URL');
    }
  }

  if (BLOCKED_WORDS.some((word) => title.includes(word) || description.includes(word))) {
    issues.push('Event content looks like placeholder text');
    score -= 30;
  }

  const suggestedTags = buildSuggestedTags(eventData);
  const finalScore = Math.max(0, Math.min(100, score));

  let status = 'approved';
  if (finalScore < 45) status = 'rejected';
  else if (finalScore < 70) status = 'pending';

  return {
    status,
    score: finalScore,
    issues,
    suggestedTags,
    summary:
      status === 'approved'
        ? 'AI review approved the event for publishing.'
        : status === 'pending'
          ? 'AI review recommends manual review before publishing.'
          : 'AI review rejected the event until the flagged issues are fixed.'
  };
};

module.exports = validateEventWithAI;
