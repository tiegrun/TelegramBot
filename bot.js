// Unified Server for Two Separate Telegram Bots
require("dotenv").config();
const TelegramBotModule = require("node-telegram-bot-api");
const TelegramBot = TelegramBotModule.TelegramBot || TelegramBotModule.default || TelegramBotModule;
const axios = require("axios");
const https = require("https");
const fs = require("fs");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());

// --- Bot Tokens ---
const tiegToken = process.env.TIEG_BOT_TOKEN;
const jaduToken = process.env.JADU_BOT_TOKEN;

if (!tiegToken || !jaduToken) {
  console.error("❌ Missing TIEG_BOT_TOKEN or JADU_BOT_TOKEN in .env file!");
  process.exit(1);
}

// Separate Bot Instances
const tiegBot = new TelegramBot(tiegToken, { polling: false });
const jaduBot = new TelegramBot(jaduToken, { polling: false });
console.log("🤖 Initialized separate instances for Tieg.run and Jadu.am bots");

// --- Shared Axios Config (Fixes SSL/TLS drops) ---
const getAxiosConfig = () => ({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*"
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    ciphers: "DEFAULT:@SECLEVEL=0"
  })
});

const isValidPost = (post) =>
  post && typeof post.id === "number" && post.title && (post.summary || post.body);

const sendPost = async (botInstance, targetId, post, message, buttons) => {
  try {
    if (post.imageUrl) {
      await botInstance.sendPhoto(targetId, post.imageUrl, {
        caption: message,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      await botInstance.sendMessage(targetId, message, {
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

// ==========================================
// 1. TIEG.RUN BOT LOGIC
// ==========================================
const tiegChannelId = process.env.TIEGRUN_CHANNEL_ID 
const tiegGroupId = process.env.TIEGRUN_GROUP_ID 
const tiegPostsUrl = process.env.TIEGRUN_POSTS_URL 
const tiegLastIdFile = "lastSentId.json";
let tiegLastSentId = 0;

const loadTiegLastSentId = () => {
  try {
    if (fs.existsSync(tiegLastIdFile)) {
      const parsed = JSON.parse(fs.readFileSync(tiegLastIdFile, "utf8"));
      tiegLastSentId = parsed.lastId || 0;
      console.log(`📋 [Tieg.run] Loaded lastSentId: ${tiegLastSentId}`);
    }
  } catch {
    tiegLastSentId = 0;
  }
};

const saveTiegLastSentId = (id) => {
  try {
    fs.writeFileSync(tiegLastIdFile, JSON.stringify({ lastId: id }));
    console.log(`💾 [Tieg.run] Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("[Tieg.run] Failed to save lastSentId:", err.message);
  }
};

loadTiegLastSentId();

const fetchTiegPosts = async () => {
  try {
    const res = await axios.get(tiegPostsUrl, getAxiosConfig());
    if (!res.data) return [];
    return Array.isArray(res.data) ? res.data : res.data.posts || [];
  } catch (err) {
    console.error("[Tieg.run] Failed to fetch posts:", err.message);
    return [];
  }
};

const postTiegBatch = async (posts, batchSize = 5) => {
  const batch = posts.slice(0, batchSize);
  for (let post of batch) {
    const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
    const buttons = [[
      { text: "▶️ YouTube", url: post.youtubeUrl || "https://youtube.com" },
      { text: "🌐 Website", url: "https://www.tieg.run/" }
    ]];

    const channelSuccess = await sendPost(tiegBot, tiegChannelId, post, message, buttons);
    if (channelSuccess) console.log(`✅ [Tieg.run] Post ${post.id} sent to channel`);

    const groupSuccess = await sendPost(tiegBot, tiegGroupId, post, message, buttons);
    if (groupSuccess) console.log(`✅ [Tieg.run] Post ${post.id} sent to group`);

    if (channelSuccess) {
      tiegLastSentId = post.id;
      saveTiegLastSentId(tiegLastSentId);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return posts.slice(batchSize);
};

let isTiegPosting = false;
const runTiegCheck = async () => {
  if (isTiegPosting) return;
  isTiegPosting = true;
  try {
    console.log("🔍 [Tieg.run] Fetching posts...");
    let posts = await fetchTiegPosts();
    let newPosts = posts.filter(isValidPost).filter(p => p.id > tiegLastSentId);

    if (!newPosts.length) {
      console.log("✓ [Tieg.run] No new posts");
      return;
    }

    newPosts.sort((a, b) => a.id - b.id);
    console.log(`📬 [Tieg.run] Found ${newPosts.length} new post(s)`);

    while (newPosts.length > 0) {
      newPosts = await postTiegBatch(newPosts, 5);
      if (newPosts.length > 0) {
        await new Promise(r => setTimeout(r, 3 * 60 * 1000));
      }
    }
  } catch (err) {
    console.error("❌ [Tieg.run] Error:", err.message);
  } finally {
    isTiegPosting = false;
  }
};

// ==========================================
// 2. JADU.AM BOT LOGIC
// ==========================================
const jaduChannelId = process.env.JADU_CHANNEL_ID 
const jaduPostsUrl = process.env.JADU_POSTS_URL 
const jaduLastIdFile = "jaduLastSentId.json";
let jaduLastSentId = 0;

const loadJaduLastSentId = () => {
  try {
    if (fs.existsSync(jaduLastIdFile)) {
      const parsed = JSON.parse(fs.readFileSync(jaduLastIdFile, "utf8"));
      jaduLastSentId = parsed.lastId || 0;
      console.log(`📋 [Jadu.am] Loaded lastSentId: ${jaduLastSentId}`);
    }
  } catch {
    jaduLastSentId = 0;
  }
};

const saveJaduLastSentId = (id) => {
  try {
    fs.writeFileSync(jaduLastIdFile, JSON.stringify({ lastId: id }));
    console.log(`💾 [Jadu.am] Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("[Jadu.am] Failed to save lastSentId:", err.message);
  }
};

loadJaduLastSentId();

const fetchJaduPosts = async () => {
  try {
    const res = await axios.get(jaduPostsUrl, getAxiosConfig());
    if (!res.data) return [];
    return Array.isArray(res.data) ? res.data : res.data.posts || [];
  } catch (err) {
    console.error("[Jadu.am] Failed to fetch posts:", err.message);
    return [];
  }
};

const postJaduBatch = async (posts, batchSize = 5) => {
  const batch = posts.slice(0, batchSize);
  for (let post of batch) {
    const message = `✨ <b>${post.title}</b> ✨\n\n${post.summary}`;
    const buttons = [[
      { text: "🔮 Jadu.am Website", url: post.linkUrl || "https://jadu.am" },
      { text: "📲 Share Channel", url: "https://t.me/jadu_am" }
    ]];

    const channelSuccess = await sendPost(jaduBot, jaduChannelId, post, message, buttons);
    if (channelSuccess) {
      console.log(`✅ [Jadu.am] Post ${post.id} sent to channel`);
      jaduLastSentId = post.id;
      saveJaduLastSentId(jaduLastSentId);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return posts.slice(batchSize);
};

let isJaduPosting = false;
const runJaduCheck = async () => {
  if (isJaduPosting) return;
  isJaduPosting = true;
  try {
    console.log("🔍 [Jadu.am] Fetching posts...");
    let posts = await fetchJaduPosts();
    let newPosts = posts.filter(isValidPost).filter(p => p.id > jaduLastSentId);

    if (!newPosts.length) {
      console.log("✓ [Jadu.am] No new posts");
      return;
    }

    newPosts.sort((a, b) => a.id - b.id);
    console.log(`📬 [Jadu.am] Found ${newPosts.length} new post(s)`);

    while (newPosts.length > 0) {
      newPosts = await postJaduBatch(newPosts, 5);
      if (newPosts.length > 0) {
        await new Promise(r => setTimeout(r, 3 * 60 * 1000));
      }
    }
  } catch (err) {
    console.error("❌ [Jadu.am] Error:", err.message);
  } finally {
    isJaduPosting = false;
  }
};

// ==========================================
// 3. SCHEDULERS & ROUTING
// ==========================================
const runAllChecks = async () => {
  await runTiegCheck();
  await runJaduCheck();
};

setInterval(() => {
  console.log("🔄 Running scheduled checks...");
  runAllChecks().catch(err => console.error("Schedule error:", err));
}, 5 * 60 * 1000);

console.log("🚀 Running initial checks...");
setTimeout(() => {
  runAllChecks().catch(err => console.error("Initial check error:", err));
}, 5000);

app.get("/", (req, res) => res.send("Dual Telegram Bot Server Running ✅"));

app.get("/status", (req, res) => {
  res.json({
    status: "running",
    tiegRun: { lastSentId: tiegLastSentId, channelId: tiegChannelId, groupId: tiegGroupId },
    jaduAm: { lastSentId: jaduLastSentId, channelId: jaduChannelId },
    timestamp: new Date().toISOString()
  });
});

app.get("/send", async (req, res) => {
  try {
    await runAllChecks();
    res.status(200).send("OK");
  } catch {
    res.status(500).send("ERROR");
  }
});

app.get("/reset", async (req, res) => {
  tiegLastSentId = 0;
  saveTiegLastSentId(0);
  jaduLastSentId = 0;
  saveJaduLastSentId(0);
  console.log("🔄 Reset lastSentId to 0 for both bots");
  try {
    await runAllChecks();
    res.json({ status: "reset_all", tiegLastSentId, jaduLastSentId });
  } catch {
    res.status(500).send("ERROR");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Unified Bot Server running on port ${PORT}`);
});

