// Tieg.run Telegram Bot
// Tieg.run Telegram Bot
// Tieg.run Telegram Bot

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

// ✅ Prevent multiple initializations
if (!global.botInstance) {
  global.botInstance = new TelegramBot(token, { polling: false });
  console.log("🤖 Bot initialized once");
}
const bot = global.botInstance;

// --- Channel and Group IDs ---
// Tieg.run
// Tieg.run
const channelId = -1003010205363;
const groupId = -1003330903443;

console.log(`📢 Bot will post to Channel: ${channelId} and Group: ${groupId}`);

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
      console.log(`📋 Loaded lastSentId: ${lastSentId}`);
    }
  } catch {
    lastSentId = 0;
  }
};

const saveLastSentId = (id) => {
  try {
    fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: id }));
    console.log(`💾 Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("Failed to save lastSentId:", err.message);
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
    console.error("Failed to fetch posts:", err.message);
    return [];
  }
};

// --- Validate post ---
const isValidPost = (post) =>
  post && typeof post.id === "number" && post.title && post.summary;

// --- Send single post to a target ---
const sendPost = async (targetId, post, message, buttons) => {
  try {
    if (post.imageUrl) {
      await bot.sendPhoto(targetId, post.imageUrl, {
        caption: message,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      await bot.sendMessage(targetId, message, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
    }
    return true;
  } catch (err) {
    console.error(`❌ Failed to send post ${post.id} to ${targetId}:`, err.message);
    return false;
  }
};

// --- Post a batch of posts (up to batchSize) ---
const postBatch = async (posts, batchSize = 5) => {
  const batch = posts.slice(0, batchSize);
  
  for (let post of batch) {
    const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
    const buttons = [[
      { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
      { text: "🌐 Website", url: "https://www.tieg.run/" }
    ]];

    // Send to channel
    const channelSuccess = await sendPost(channelId, post, message, buttons);
    if (channelSuccess) {
      console.log(`✅ Post ${post.id} sent to channel`);
    }

    // Send to group
    const groupSuccess = await sendPost(groupId, post, message, buttons);
    if (groupSuccess) {
      console.log(`✅ Post ${post.id} sent to group`);
    }

    // Update lastSentId only if channel succeeded (your primary target)
    if (channelSuccess) {
      lastSentId = post.id;
      saveLastSentId(lastSentId);
    }

    // Wait 1 second before next post
    await new Promise(r => setTimeout(r, 1000));
  }

  return posts.slice(batchSize); // remaining posts
};

// --- Posting lock to prevent concurrent runs ---
let isPosting = false;

// --- Silent batch posting with delay between batches ---
const postNewPostsSilent = async () => {
  // Prevent concurrent execution
  if (isPosting) {
    console.log("⚠️ Already posting, skipping this run");
    return;
  }
  
  isPosting = true;
  
  try {
    console.log("🔍 Fetching posts...");
    let posts = await fetchPosts();
    let newPosts = posts.filter(isValidPost).filter(p => p.id > lastSentId);
    
    if (!newPosts.length) {
      console.log("✓ No new posts to send");
      return;
    }

    newPosts.sort((a, b) => a.id - b.id);
    console.log(`📬 Found ${newPosts.length} new post(s) to send`);

    while (newPosts.length > 0) {
      newPosts = await postBatch(newPosts, 5); // post 5 at a time
      
      if (newPosts.length > 0) {
        console.log(`⏳ Waiting 3 minutes before next batch... (${newPosts.length} posts remaining)`);
        await new Promise(r => setTimeout(r, 3 * 60 * 1000)); // wait 3 minutes
      }
    }
    
    console.log("✅ All new posts sent successfully");
  } catch (err) {
    console.error("❌ Error in silent posting:", err.message);
  } finally {
    isPosting = false;
  }
};

// --- Auto-fetch posts every 5 minutes ---
setInterval(() => {
  console.log("🔄 Auto-checking for new posts...");
  postNewPostsSilent().catch(err => console.error("Auto fetch error:", err));
}, 5 * 60 * 1000); // 5 minutes

// Initial check on startup
console.log("🚀 Running initial post check...");
setTimeout(() => {
  postNewPostsSilent().catch(err => console.error("Initial fetch error:", err));
}, 5000); // Wait 5 seconds after startup

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
    channelId,
    groupId,
    timestamp: new Date().toISOString(),
  });
});

app.get("/reset", async (req, res) => {
  const oldId = lastSentId;
  lastSentId = 0;
  saveLastSentId(0);
  console.log(`🔄 Reset lastSentId from ${oldId} to 0`);
  
  try {
    await postNewPostsSilent();
    res.json({ status: "reset", oldId, newId: lastSentId });
  } catch {
    res.status(500).send("ERROR");
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`📤 Manual send: http://localhost:${PORT}/send`);
  console.log(`🔄 Reset: http://localhost:${PORT}/reset`);
});