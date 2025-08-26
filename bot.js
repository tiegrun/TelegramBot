require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Telegram Bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}
const bot = new TelegramBot(token);

// ✅ Your channel ID
const channelId = -1003010205363;

// --- JSONKeeper posts URL ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- File to store last sent id ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

// Load last sent id if exists
if (fs.existsSync(lastIdFile)) {
  const data = fs.readFileSync(lastIdFile, "utf8");
  lastSentId = JSON.parse(data).lastId || 0;
}

// --- Fetch posts from JSONKeeper ---
const fetchPosts = async () => {
  try {
    const res = await axios.get(POSTS_URL);
    return Array.isArray(res.data.posts) ? res.data.posts : [];
  } catch (err) {
    console.error("Error fetching posts:", err.message);
    return [];
  }
};

// --- Post new posts ---
const postNewPosts = async () => {
  const posts = await fetchPosts();
  if (!posts || posts.length === 0) return console.log("No posts found.");

  // Filter posts with id higher than lastSentId
  const newPosts = posts.filter(post => post.id > lastSentId);
  if (newPosts.length === 0) return console.log("No new posts to send.");

  // Sort ascending so oldest first
  newPosts.sort((a, b) => a.id - b.id);

  for (let post of newPosts) {
    const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
    const buttons = [
      [
        { text: "▶️ Watch on YouTube", url: post.youtubeUrl },
        { text: "🌐 Visit Website", url: "https://www.tieg.run/" }
      ]
    ];

    try {
      if (post.imageUrl) {
        await bot.sendPhoto(channelId, post.imageUrl, {
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

      // Update lastSentId
      lastSentId = post.id;
      fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: lastSentId }));

      console.log(`Sent post: ${post.title}`);
    } catch (err) {
      console.error("Error sending message:", err.message);
    }
  }
};

// --- Run once ---
postNewPosts();
