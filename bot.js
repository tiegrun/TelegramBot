require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Telegram Bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}
const bot = new TelegramBot(token, { polling: true });
console.log("Bot is running...");

// ✅ Your channel ID
const channelId = -1003010205363;

// --- File to track last sent post ---
const lastSentFile = path.join(__dirname, 'lastSent.json');
let lastSentTitle = null;

// Load last sent post
if (fs.existsSync(lastSentFile)) {
  lastSentTitle = fs.readFileSync(lastSentFile, 'utf8');
}

// --- Fetch posts from JSONKeeper ---
const fetchBlogPosts = async () => {
  try {
    const response = await axios.get("https://www.jsonkeeper.com/b/0VPTV");
    const posts = response.data.posts; // expects { "posts": [...] }
    return Array.isArray(posts) ? posts : [];
  } catch (err) {
    console.error("Error fetching JSONKeeper:", err.message);
    return [];
  }
};

// --- Post newest post to Telegram ---
const postNewestToChannel = async () => {
  const posts = await fetchBlogPosts();
  if (!posts || posts.length === 0) return;

  // Get the newest post (last in the array if chronological)
  const newest = posts[posts.length - 1];

  // Skip if already sent
  if (newest.title === lastSentTitle) return;

  const message = `📰 <b>${newest.title}</b>\n\n${newest.summary}`;
  const buttons = [
    [
      { text: "▶️ Watch on YouTube", url: newest.youtubeUrl },
      { text: "🌐 Visit Website", url: "https://www.tieg.run/" }
    ]
  ];

  try {
    if (newest.imageUrl) {
      await bot.sendPhoto(channelId, newest.imageUrl, { 
        caption: message, 
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      await bot.sendMessage(channelId, message, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
    }

    // Save as last sent
    lastSentTitle = newest.title;
    fs.writeFileSync(lastSentFile, lastSentTitle);
  } catch (err) {
    console.error("Error sending message:", err.message);
  }
};

// --- Continuous checking every 15 minutes ---
setInterval(postNewestToChannel, 15 * 60 * 1000); // 15 min interval
postNewestToChannel(); // also post immediately on startup
