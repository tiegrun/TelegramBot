require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true, debug: true });
console.log("Bot is running...");

// ✅ Your channel ID
const channelId = -1003010205363;

// --- JSONBin.io config ---
const JSONBIN_ID = process.env.JSONBIN_ID; // your bin ID
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY; // optional if private bin

// --- Fetch blog posts from JSONBin.io ---
const fetchPosts = async () => {
  try {
    const response = await axios.get(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: JSONBIN_API_KEY ? { 'X-Master-Key': JSONBIN_API_KEY } : {},
    });
    return response.data.record; // array of posts
  } catch (err) {
    console.error("Error fetching JSONBin:", err.message);
    return [];
  }
};

// --- Format and post blog posts to Telegram ---
const hashtags = "#Marketing #Business #Growth #Tips";

const postPostsToChannel = async () => {
  const posts = await fetchPosts();
  if (!posts || posts.length === 0) return;

  for (let post of posts) {
    const message = `
<b>${post.title}</b>

${post.summary || ""}

${post.youtubeUrl ? "🎥 " + post.youtubeUrl : ""}
${post.imageUrl ? "🖼️ " + post.imageUrl : ""}

${hashtags}
    `;
    bot.sendMessage(channelId, message, { parse_mode: "HTML" });
  }
};

// --- Schedule posts 3 times per day ---
const scheduleTimes = ["08:00", "13:00", "18:00"]; // 24-hour format

const schedulePosts = () => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  scheduleTimes.forEach(time => {
    const [hour, minute] = time.split(":").map(Number);
    let delay = (hour * 60 + minute - nowMinutes) * 60 * 1000;
    if (delay < 0) delay += 24 * 60 * 60 * 1000; // next day

    setTimeout(function repeatPost() {
      postPostsToChannel();
      setInterval(postPostsToChannel, 24 * 60 * 60 * 1000); // every 24h
    }, delay);
  });
};

// Post immediately on startup
postPostsToChannel();

// Start scheduled posts
schedulePosts();
