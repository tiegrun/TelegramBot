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

// --- Fetch posts from JSONBin ---
const JSONBIN_ID = process.env.JSONBIN_ID;         // e.g., "your-bin-id"
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY; // X-Master-Key

const fetchBlogPosts = async () => {
  try {
    const response = await axios.get(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY
      }
    });

    const posts = response.data.record?.posts;
    if (Array.isArray(posts)) return posts;
    return [];
  } catch (err) {
    console.error("Error fetching JSONBin:", err.message);
    return [];
  }
};

// --- Format and post to Telegram ---
const postBlogPostsToChannel = async () => {
  const posts = await fetchBlogPosts();
  if (!posts || posts.length === 0) return;

  // Reverse the posts so newest appear first
  const reversedPosts = posts.slice().reverse();

  for (let post of reversedPosts) {
    const message = `
📰 <b>${post.title}</b>

${post.summary}

🔗 YouTube: ${post.youtubeUrl}
🌐 Website: https://www.tieg.run/
`;
    // Send image first if exists
    if (post.imageUrl) {
      await bot.sendPhoto(channelId, post.imageUrl, { caption: message, parse_mode: "HTML" });
    } else {
      await bot.sendMessage(channelId, message, { parse_mode: "HTML" });
    }
  }
};


// --- Schedule posts 3 times per day ---
const scheduleTimes = ["08:00", "13:00", "18:00"]; // 24-hour format

const schedulePosts = () => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  scheduleTimes.forEach(time => {
    const [hour, minute] = time.split(":").map(Number);
    const timeMinutes = hour * 60 + minute;
    let delay = (timeMinutes - nowMinutes) * 60 * 1000;

    if (delay < 0) delay += 24 * 60 * 60 * 1000; // schedule for next day if passed

    setTimeout(function repeatPost() {
      postBlogPostsToChannel();
      setInterval(postBlogPostsToChannel, 24 * 60 * 60 * 1000); // repeat every 24h
    }, delay);
  });
};

// Post immediately on startup
postBlogPostsToChannel();

// Start scheduled posts
schedulePosts();
