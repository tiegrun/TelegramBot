require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

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

// --- File to track sent posts ---
const sentPostsFile = path.join(__dirname, 'sentPosts.json');
let sentPosts = [];

// Load previously sent posts
if (fs.existsSync(sentPostsFile)) {
  sentPosts = JSON.parse(fs.readFileSync(sentPostsFile, 'utf8'));
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

// --- Post new posts to Telegram ---
const postBlogPostsToChannel = async () => {
  const posts = await fetchBlogPosts();
  if (!posts || posts.length === 0) return;

  // Reverse posts so newest appear first
  const reversedPosts = posts.slice().reverse();

  // Filter out posts already sent
  const newPosts = reversedPosts.filter(post => !sentPosts.includes(post.title));
  if (newPosts.length === 0) return;

  for (let post of newPosts) {
    const message = `
📰 <b>${post.title}</b>

${post.summary}
`;

    const buttons = [
      [
        { text: "▶️ Watch on YouTube", url: post.youtubeUrl },
        { text: "🌐 Visit Website", url: "https://www.tieg.run/" }
      ]
    ];

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

    // Mark post as sent
    sentPosts.push(post.title);
  }

  // Save sent posts to file
  fs.writeFileSync(sentPostsFile, JSON.stringify(sentPosts, null, 2));
};

// --- Schedule posts 3 times per day (optional, still keeps original schedule) ---
const scheduleTimes = ["08:00", "13:00", "18:00"]; // 24-hour format

const schedulePosts = () => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  scheduleTimes.forEach(time => {
    const [hour, minute] = time.split(":").map(Number);
    let delay = (hour * 60 + minute - nowMinutes) * 60 * 1000;
    if (delay < 0) delay += 24 * 60 * 60 * 1000;

    setTimeout(function repeatPost() {
      postBlogPostsToChannel();
      setInterval(postBlogPostsToChannel, 24 * 60 * 60 * 1000);
    }, delay);
  });
};

// --- New: Check for new posts every 15 minutes ---
setInterval(postBlogPostsToChannel, 15 * 60 * 1000);

// Post immediately on startup
postBlogPostsToChannel();

// Start scheduled posts (optional)
schedulePosts();
