require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());

// Health check
app.get("/", (req, res) => res.send("Bot is running ✅"));

// --- Telegram Bot ---
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ BOT_TOKEN not found in .env");
  process.exit(1);
}

if (!global.botInstance) {
  global.botInstance = new TelegramBot(token, { polling: false });
}
const bot = global.botInstance;

// --- Channel & Group IDs ---
const channelId = -1003010205363; // your channel
const groupId = -4880247765;      // your group
const targets = [channelId, groupId];

// --- JSON source ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- Last ID memory ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

const loadLastSentId = () => {
  try {
    if (fs.existsSync(lastIdFile)) {
      const data = JSON.parse(fs.readFileSync(lastIdFile, "utf8"));
      lastSentId = data.lastId || 0;
    }
  } catch {
    lastSentId = 0;
  }
};

const saveLastSentId = (id) => {
  try {
    fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: id }));
  } catch {}
};

loadLastSentId();

// --- Fetch posts ---
const fetchPosts = async () => {
  try {
    const res = await axios.get(POSTS_URL, { timeout: 10000 });
    const data = res.data;

    if (Array.isArray(data)) return data;
    if (data.posts && Array.isArray(data.posts)) return data.posts;

    return [];
  } catch {
    return [];
  }
};

// Validate
const isValidPost = (post) =>
  post && typeof post.id === "number" && post.title && post.summary;

// --- Send to channel & group ---
const sendToTargets = async (targets, post, message, buttons) => {
  for (let target of targets) {
    try {
      if (post.imageUrl) {
        await bot.sendPhoto(target, post.imageUrl, {
          caption: message,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons }
        });
      } else {
        await bot.sendMessage(target, message, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons }
        });
      }
    } catch (err) {
      console.error(`❌ Failed to send to ${target}:`, err.message);
    }
  }
};

// --- Send ALL new posts instantly ---
const postAllNewPosts = async () => {
  const posts = await fetchPosts();
  const newPosts = posts
    .filter(isValidPost)
    .filter((p) => p.id > lastSentId)
    .sort((a, b) => a.id - b.id);

  if (!newPosts.length) return;

  for (let post of newPosts) {
    const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
    const buttons = [[
      { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
      { text: "🌐 Website", url: "https://www.tieg.run/" }
    ]];

    await sendToTargets(targets, post, message, buttons);

    lastSentId = post.id;
    saveLastSentId(lastSentId);

    await new Promise(r => setTimeout(r, 800)); // small anti-flood pause
  }
};

// --- Auto run every 5 minutes ---
setInterval(() => {
  postAllNewPosts().catch(err => console.error(err));
}, 5 * 60 * 1000);

// Manual endpoint
app.get("/send", async (req, res) => {
  try {
    await postAllNewPosts();
    res.send("OK");
  } catch {
    res.status(500).send("ERROR");
  }
});

// Reset endpoint
app.get("/reset", async (req, res) => {
  lastSentId = 0;
  saveLastSentId(0);
  await postAllNewPosts();
  res.json({ status: "reset" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
