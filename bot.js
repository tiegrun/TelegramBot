require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// --- Telegram Bot Setup ---
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log("Bot is running...");

// ✅ Your channel ID
const channelId = -1003010205363;

// --- Fetch blog posts from JSONBin ---
const fetchPosts = async () => {
  try {
    const res = await axios.get(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_ID}/latest`, {
      headers: { 'X-Master-Key': process.env.JSONBIN_KEY }
    });
    console.log("JSONBin response:", res.data);
    return res.data.record.posts || [];
  } catch (err) {
    console.error("Error fetching JSONBin:", err.message);
    return [];
  }
};


// --- Format and post blogs to Telegram ---
const postBlogPostsToChannel = async () => {
  const posts = await fetchPosts();
  if (!posts || posts.length === 0) return;

  for (let post of posts) {
    const message = `📝 <b>${post.title}</b>\n\n${post.summary}\n\n🔗 https://tieg.run\n\n#Marketing #Business #Growth`;
    try {
      await bot.sendMessage(channelId, message, { parse_mode: "HTML" });
    } catch (err) {
      console.error("Error sending message:", err.message);
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
    let delay = (hour * 60 + minute - nowMinutes) * 60 * 1000;
    if (delay < 0) delay += 24 * 60 * 60 * 1000; // schedule for next day if passed

    setTimeout(function repeatPost() {
      postBlogPostsToChannel();
      setInterval(postBlogPostsToChannel, 24 * 60 * 60 * 1000); // repeat every 24h
    }, delay);
  });
};

// --- Start ---
postBlogPostsToChannel(); // immediate post on startup
schedulePosts();           // schedule future posts
