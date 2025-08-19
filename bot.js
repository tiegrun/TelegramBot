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

// --- Fetch latest marketing/business news ---
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const fetchNews = async () => {
  try {
    const url = `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=5&apiKey=${NEWS_API_KEY}`;
    const response = await axios.get(url);
    return response.data.articles; // array of articles
  } catch (err) {
    console.error("Error fetching news:", err.message);
    return [];
  }
};

// --- Format and post news to Telegram ---
const hashtags = "#Marketing #Business #Growth #Tips";

const postNewsToChannel = async () => {
  const articles = await fetchNews();
  if (articles.length === 0) return;

  for (let article of articles) {
    const message = `📰 <b>${article.title}</b>\n\n${article.description || ""}\n\n🔗 ${article.url}\n\n${hashtags}`;
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
    const timeMinutes = hour * 60 + minute;
    let delay = (timeMinutes - nowMinutes) * 60 * 1000;

    if (delay < 0) delay += 24 * 60 * 60 * 1000; // schedule for next day if passed

    setTimeout(function repeatPost() {
      postNewsToChannel();
      setInterval(postNewsToChannel, 24 * 60 * 60 * 1000); // repeat every 24h
    }, delay);
  });
};

// Post immediately on startup
postNewsToChannel();

// Start scheduled posts
schedulePosts();
