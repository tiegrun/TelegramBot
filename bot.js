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
    const posts = response.data.posts;
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

  const newPosts = posts.filter(post => !sentPosts.includes(post.title));
  if (newPosts.length === 0) return;

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

      // Mark post as sent
      sentPosts.push(post.title);
    } catch (err) {
      console.error("Error sending message:", err.message);
    }
  }

  // Save sent posts to file
  fs.writeFileSync(sentPostsFile, JSON.stringify(sentPosts, null, 2));
};

// --- Continuous checking for new posts ---
setInterval(postBlogPostsToChannel, 15 * 60 * 1000); // every 15 min
postBlogPostsToChannel(); // also post immediately on startup
