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

// ✅ Prevent multiple bot initializations
if (!global.botInstance) {
  global.botInstance = new TelegramBot(token, { polling: false });
  console.log("🤖 Bot initialized once");
}
const bot = global.botInstance;

// --- Channel ID ---
const channelId = -1003010205363;

// --- Posts source ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- Last sent post id persistence ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

const loadLastSentId = () => {
  try {
    if (fs.existsSync(lastIdFile)) {
      const data = fs.readFileSync(lastIdFile, "utf8");
      const parsed = JSON.parse(data);
      lastSentId = parsed.lastId || 0;
      console.log(`ℹ️ Loaded lastSentId: ${lastSentId}`);
    }
  } catch (err) {
    console.error("⚠️ Could not load lastSentId:", err.message);
  }
};
const saveLastSentId = (id) => {
  try {
    fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: id }));
    console.log(`💾 Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("⚠️ Could not save lastSentId:", err.message);
  }
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
  } catch (err) {
    console.error("⚠️ Error fetching posts:", err.message);
    return [];
  }
};

// --- Validate post ---
const isValidPost = (post) =>
  post && typeof post.id === "number" && post.title && post.summary;

// --- Post new posts ---
const postNewPosts = async () => {
  try {
    const posts = await fetchPosts();
    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter((p) => p.id > lastSentId);

    if (!newPosts.length) return { success: true, message: "No new posts" };

    // Sort oldest → newest
    newPosts.sort((a, b) => a.id - b.id);

    let sentCount = 0;
    for (let post of newPosts) {
      try {
        const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
        const buttons = [[
          { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
          { text: "🌐 Website", url: "https://www.tieg.run/" }
        ]];

        if (post.imageUrl) {
          await bot.sendPhoto(channelId, post.imageUrl, {
            caption: message,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons },
          });
        } else {
          await bot.sendMessage(channelId, message, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: buttons },
          });
        }

        // ✅ Save lastSentId immediately after success
        lastSentId = post.id;
        saveLastSentId(lastSentId);
        sentCount++;

        await new Promise((r) => setTimeout(r, 1000)); // avoid spam
      } catch (err) {
        console.error(`⚠️ Could not send post ${post.id}:`, err.message);
      }
    }
    return { success: true, message: `Sent ${sentCount} new posts` };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// --- Silent post ---
const postNewPostsSilent = async () => {
  try {
    const posts = await fetchPosts();
    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter((p) => p.id > lastSentId);
    if (!newPosts.length) return;

    newPosts.sort((a, b) => a.id - b.id);

    for (let post of newPosts) {
      try {
        const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
        const buttons = [[
          { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
          { text: "🌐 Website", url: "https://www.tieg.run/" }
        ]];

        if (post.imageUrl) {
          await bot.sendPhoto(channelId, post.imageUrl, {
            caption: message, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }
          });
        } else {
          await bot.sendMessage(channelId, message, {
            parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }
          });
        }

        lastSentId = post.id;
        saveLastSentId(lastSentId);
        await new Promise((r) => setTimeout(r, 1000));
      } catch {}
    }
  } catch {}
};

// --- Endpoints ---
app.get("/silent", async (req, res) => {
  try {
    await postNewPostsSilent();
    res.status(200).end();
  } catch {
    res.status(500).end();
  }
});

app.get("/send", async (req, res) => {
  const result = await postNewPosts();
  res.sendStatus(result.success ? 200 : 500);
});

app.get("/status", (req, res) => {
  res.json({
    status: "running",
    lastSentId,
    channelId,
    timestamp: new Date().toISOString(),
  });
});

app.get("/reset", async (req, res) => {
  lastSentId = 0;
  saveLastSentId(0);
  const result = await postNewPosts();
  res.json({ status: "reset", message: result.message, lastSentId });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`➡️ Silent endpoint: /silent`);
});
