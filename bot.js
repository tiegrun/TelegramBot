require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

// Simple health check
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

// Telegram bot setup
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}
const bot = new TelegramBot(token, { polling: true, debug: true });
console.log("Bot is running...");

// Your channel ID
const channelId = -1003010205363;

// Main website URL
const mainSiteUrl = "https://tieg.run";

// JSONBin endpoint (replace BIN_ID with your bin ID)
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_ID}/latest`;

const fetchBlogPosts = async () => {
  try {
    const response = await axios.get(process.env.JSONBIN_ID, {
      headers: {
        'X-Master-Key': process.env.JSONBIN_KEY  // required for private bins
      }
    });
    const posts = response.data.record?.posts; // access "posts" array
    if (!posts || !Array.isArray(posts)) return [];
    return posts;
  } catch (err) {
    console.error("Error fetching JSONBin:", err.message);
    return [];
  }
};

// Send posts to Telegram
const postBlogPostsToChannel = async () => {
  const posts = await fetchBlogPosts();
  if (!posts || !Array.isArray(posts) || posts.length === 0) return;

  for (let post of posts) {
    const message = `📰 <b>${post.title}</b>\n\n${post.summary}\n\n🔗 ${mainSiteUrl}`;
    bot.sendMessage(channelId, message, { parse_mode: "HTML" });
  }
};

// Schedule posts 3 times per day
const scheduleTimes = ["08:00", "13:00", "18:00"]; // 24-hour format
const schedulePosts = () => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  scheduleTimes.forEach(time => {
    const [hour, minute] = time.split(":").map(Number);
    let delay = (hour * 60 + minute - nowMinutes) * 60 * 1000;
    if (delay < 0) delay += 24 * 60 * 60 * 1000; // next day

    setTimeout(function repeatPost() {
      postBlogPostsToChannel();
      setInterval(postBlogPostsToChannel, 24 * 60 * 60 * 1000); // repeat daily
    }, delay);
  });
};

// Post immediately on startup
postBlogPostsToChannel();
// Start scheduled posts
schedulePosts();
