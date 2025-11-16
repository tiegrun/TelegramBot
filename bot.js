require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());

// --- Health check ---
app.get("/", (req, res) => res.send("Bot is running ✅"));

// --- Telegram Bot ---
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ BOT_TOKEN not found in .env");
  process.exit(1);
}

// Prevent multiple initializations
if (!global.botInstance) {
  global.botInstance = new TelegramBot(token, { polling: false });
  console.log("🤖 Bot initialized once");
}
const bot = global.botInstance;

// --- Channel & Group IDs ---
const channelId = -1003010205363;       // your channel
const groupId = -4880247765;            // your group
const targets = [channelId, groupId];   // send to both

// --- Posts source ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- Last sent post persistence ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

const loadLastSentId = () => {
  try {
    if (fs.existsSync(lastIdFile)) {
      const parsed = JSON.parse(fs.readFileSync(lastIdFile, "utf8"));
      lastSentId = parsed.lastId || 0;
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
    if (!res.data) return [];
    return Array.isArray(res.data)
      ? res.data
      : res.data.posts && Array.isArray(res.data.posts)
      ? res.data.posts
      : [];
  } catch {
    return [];
  }
};

// --- Validate post ---
const isValidPost = (post) =>
  post && typeof post.id === "number" && post.title && post.summary;

// --- Helper: Send message to channel AND group ---
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

// --- Post a batch of posts ---
const postBatch = async (posts, batchSize = 5) => {
  const batch = posts.slice(0, batchSize);

  for (let post of batch) {
    try {
      const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
      const buttons = [[
        { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
        { text: "🌐 Website", url: "https://www.tieg.run/" }
      ]];

      await sendToTargets(targets, post, message, buttons);

      lastSentId = post.id;
      saveLastSentId(lastSentId);

      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Failed to send post ${post.id}:`, err.message);
    }
  }

  return posts.slice(batchSize);
};

// --- Silent batch posting with delay ---
const postNewPostsSilent = async () => {
  try {
    let posts = await fetchPosts();
    let newPosts = posts.filter(isValidPost).filter(p => p.id > lastSentId);
    if (!newPosts.length) return;

    newPosts.sort((a, b) => a.id - b.id);

    while (newPosts.length > 0) {
      newPosts = await postBatch(newPosts, 5);

      if (newPosts.length > 0) {
        console.log("⏳ Waiting 3 minutes for next batch...");
        await new Promise(r => setTimeout(r, 3 * 60 * 1000));
      }
    }
  } catch (err) {
    console.error("Error in silent posting:", err.message);
  }
};

// --- Auto-fetch every 5 minutes ---
setInterval(() => {
  postNewPostsSilent().catch(err => console.error("Auto fetch error:", err));
}, 5 * 60 * 1000);

// --- Manual endpoints ---
app.get("/send", async (req, res) => {
  try {
    await postNewPostsSilent();
    res.status(200).send("OK");
  } catch {
    res.status(500).send("ERROR");
  }
});

app.get("/status", (req, res) => {
  res.json({
    status: "running",
    lastSentId,
    targets,
    timestamp: new Date().toISOString(),
  });
});

app.get("/reset", async (req, res) => {
  lastSentId = 0;
  saveLastSentId(0);

  try {
    await postNewPostsSilent();
    res.json({ status: "reset", lastSentId });
  } catch {
    res.status(500).send("ERROR");
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
