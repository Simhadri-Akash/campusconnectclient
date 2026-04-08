const Event = require('../models/Event');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;

    // 🔥 Get approved events
    const events = await Event.find({
      isPublished: true,
      verificationStatus: 'approved'
    }).select('title category location startDate');

    // 🔥 Format event data for AI
    const eventContext = events.map(e =>
      `${e.title} (${e.category}) at ${e.location} on ${new Date(e.startDate).toDateString()}`
    ).join('\n');

    let reply = "";

    // 🧠 STEP 1: QUICK RULE-BASED (FAST RESPONSE)
    if (message.toLowerCase().includes('tech')) {
      const techEvents = events.filter(e =>
        e.category?.toLowerCase().includes('tech')
      );

      reply = techEvents.length
        ? "Here are some tech events:\n" +
          techEvents.map(e => `• ${e.title} (${e.location})`).join('\n')
        : "No tech events found.";
      
      return res.json({ success: true, reply });
    }

    if (message.toLowerCase().includes('upcoming')) {
      const upcoming = events.slice(0, 5);

      reply =
        "Upcoming events:\n" +
        upcoming.map(e => `• ${e.title}`).join('\n');

      return res.json({ success: true, reply });
    }

    // 🤖 STEP 2: AI RESPONSE (SMART)
    const prompt = `
You are a smart campus assistant for a platform called CampusConnect.
User interests: ${req.user?.interests || "general"}
Here are available events:
${eventContext}

User question:
${message}

Instructions:
- Recommend relevant events
- Be short and clear
- If no exact match, suggest closest events
`;

    const aiRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    reply = aiRes.choices[0].message.content;

    res.json({ success: true, reply });

  } catch (err) {
    console.error("Chatbot Error:", err);

    // 🔥 FALLBACK RESPONSE
    res.json({
      success: true,
      reply:
        "Sorry, I couldn't process that. Try asking:\n- Tech events\n- Upcoming events\n- Workshops"
    });
  }
};