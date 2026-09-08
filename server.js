// Unified Server for Three Telegram Bots (Tieg Channel, Jadu Channel, Jadu Support)
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
const supportJaduToken = process.env.SUPPORT_JADU_BOT_TOKEN;
const supportJaduGroupId = process.env.SUPPORT_JADU_GROUP_ID;

if (!tiegToken || !jaduToken) {
  console.error("❌ Missing TIEG_BOT_TOKEN or JADU_BOT_TOKEN in .env file!");
  process.exit(1);
}

// Initialize Channel Bots
const tiegBot = new TelegramBot(tiegToken, { polling: false });
const jaduBot = new TelegramBot(jaduToken, { polling: false });
console.log("🤖 Initialized separate instances for Tieg.run and Jadu.am bots");

// --- Initialize Support Bot (Live Chat) ---
let supportJaduBot = null;
if (supportJaduToken && supportJaduGroupId) {
  supportJaduBot = new TelegramBot(supportJaduToken, { polling: true });
  console.log("🤖 Initialized Jadu Support Bot (Polling Enabled)");

  const supportMessageMap = new Map();

  // 1. User sends message to Support Bot -> Forward to private Telegram group
  supportJaduBot.on("message", async (msg) => {
    if (msg.chat.id.toString() === supportJaduGroupId.toString()) return;

    // Handle /start commands with deep linking parameters
    if (msg.text && msg.text.startsWith("/start")) {
      const isMembership = msg.text.includes("membership");
      const isContact = msg.text.includes("contact");

      let greetingMessage = "Բարև ձեզ! ✨\nԳրեք ձեր հարցը կամ տվյալները անհատական խորհրդատվություն ստանալու համար, և մենք շուտով կպատասխանենք ձեզ:";

      if (isMembership) {
        greetingMessage = "Բարև ձեզ! 🔮\nԴուք ցանկանում եք ձեռք բերել «Մուտքի արտոնագիր»: Գրեք ձեր տվյալները կամ հարցը, և մենք ձեզ կուղարկենք մանրամասները:";
      } else if (isContact) {
        greetingMessage = "Բարև ձեզ! 💬\nՇնորհակալություն կապ հաստատելու համար: Գրեք ձեր հարցը, և մեր թիմը շուտով կպատասխանի ձեզ:";
      }

      await supportJaduBot.sendMessage(msg.chat.id, greetingMessage);
      return;
    }

    try {
      const forwardedMsg = await supportJaduBot.forwardMessage(
        supportJaduGroupId,
        msg.chat.id,
        msg.message_id
      );

      supportMessageMap.set(forwardedMsg.message_id, msg.chat.id);
    } catch (err) {
      console.error("❌ Failed to forward support message:", err.message);
    }
  });

  // 2. Admin replies in group -> Send answer back to the user
  supportJaduBot.on("message", async (msg) => {
    if (
      msg.chat.id.toString() !== supportJaduGroupId.toString() ||
      !msg.reply_to_message
    ) return;

    const targetUserId =
      msg.reply_to_message.forward_from?.id ||
      supportMessageMap.get(msg.reply_to_message.message_id);

    if (targetUserId) {
      try {
        await supportJaduBot.sendMessage(targetUserId, msg.text);
        await supportJaduBot.sendMessage(supportJaduGroupId, "✅ Պատասխանն ուղարկվեց:");
      } catch (err) {
        await supportJaduBot.sendMessage(
          supportJaduGroupId,
          "❌ Չհաջողվեց ուղարկել (օգտատերը կարող է արգելափակել է բոտը):"
        );
      }
    } else {
      await supportJaduBot.sendMessage(
        supportJaduGroupId,
        "⚠️ Չհաջողվեց գտնել օգտատիրոջ ID-ն:"
      );
    }
  });
} else {
  console.warn("⚠️ Support Bot credentials (SUPPORT_JADU_BOT_TOKEN / SUPPORT_JADU_GROUP_ID) missing in .env file.");
}

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

// Helper function to extract YouTube Thumbnail URL
const getYouTubeThumbnail = (youtubeUrl) => {
  if (!youtubeUrl) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = youtubeUrl.match(regExp);
  if (match && match[2].length === 11) {
    return `https://img.youtube.com/vi/${match[2]}/hqdefault.jpg`;
  }
  return null;
};

const isValidPost = (post) =>
  post && 
  post.active !== false && 
  typeof post.id === "number" && 
  post.title && 
  (post.summary || post.body || post.description);

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
const tiegChannelId = process.env.TIEGRUN_CHANNEL_ID;
const tiegGroupId = process.env.TIEGRUN_GROUP_ID;
const tiegPostsUrl = process.env.TIEGRUN_POSTS_URL;
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
// 2. JADU.AM BOT LOGIC (MULTI-GIST SUPPORT)
// ==========================================
const jaduChannelId = process.env.JADU_CHANNEL_ID;
const jaduLastIdsFile = "jaduLastSentIds.json";

// Stores per-Gist tracking object: { [gistUrl]: lastSentId }
let jaduLastSentIds = {};

// Default Fallback Gist URLs if JADU_POSTS_URLS is not set
const jaduGistUrls = process.env.JADU_POSTS_URLS
  ? process.env.JADU_POSTS_URLS.split(",").map((url) => url.trim())
  : [
      "https://gist.githubusercontent.com/tiegrun/3c6372487a2bcf452597b7ee5640afb8/raw/feed.json",
      "https://gist.githubusercontent.com/tiegrun/b0d34c23239482fb0cf3f2497793b6c6/raw/self-build.json",
      "https://gist.githubusercontent.com/tiegrun/9bafda754cedcb58b13dd069e374c79c/raw/agesta-codes.json",
      "https://gist.githubusercontent.com/tiegrun/fd6874122a5aca1df81452ab069553ac/raw/books.json",
      "https://gist.githubusercontent.com/tiegrun/2cc27b4d43575676cc19cb3041473478/raw/coaches.json"
    ].filter(Boolean);

const loadJaduLastSentIds = () => {
  try {
    if (fs.existsSync(jaduLastIdsFile)) {
      jaduLastSentIds = JSON.parse(fs.readFileSync(jaduLastIdsFile, "utf8"));
      console.log("📋 [Jadu.am] Loaded per-Gist tracking IDs:", jaduLastSentIds);
    }
  } catch {
    jaduLastSentIds = {};
  }
};

const saveJaduLastSentIds = () => {
  try {
    fs.writeFileSync(jaduLastIdsFile, JSON.stringify(jaduLastSentIds, null, 2));
  } catch (err) {
    console.error("[Jadu.am] Failed to save lastSentIds:", err.message);
  }
};

loadJaduLastSentIds();

const fetchGistItems = async (url) => {
  try {
    const res = await axios.get(url, getAxiosConfig());
    if (!res.data) return [];

    let fetchedData = Array.isArray(res.data) ? res.data : res.data.posts || res.data.coaches || [];

    const isBooks = url.includes("books");
    const isAgesta = url.includes("agesta");
    const isSelfBuild = url.includes("self-build");
    const isCoaches = url.includes("coaches");

    return fetchedData.map((item, index) => {
      const numericId = typeof item.id === "number" ? item.id : parseInt(item.code) || index + 1;

      // Extract title/author or coach name
      const title = item.title || item.name || (item.code ? `Ագեստայի Կոդ ${item.code}` : "Անվերնագիր");
      const author = item.author || (isCoaches ? `${item.role || ""} • ${item.specialty || ""}` : "");
      
      // Extract summary / description / keyConcept
      const summaryText = isCoaches 
        ? `${item.description || ""}\n\n💡 ${item.keyConcept || ""}`.trim()
        : item.summary || item.description || item.body || "";

      return {
        id: numericId,
        active: item.active !== false,
        title: title,
        author: author,
        summary: summaryText,
        category: item.category || (isBooks ? "Գիրք" : isAgesta ? "Ագեստայի Թվեր" : isSelfBuild ? "Ինքնակերտում" : isCoaches ? "Ուսուցիչներ" : "Հոդված"),
        imageUrl: item.imageUrl || item.avatarUrl || null,
        youtubeUrl: item.youtubeUrl || null,
        linkUrl: item.linkUrl || (isAgesta ? "https://jadu.am/agesta" : isSelfBuild ? "https://jadu.am/self-build" : isBooks ? "https://jadu.am/books" : isCoaches ? "https://jadu.am/coaches" : "https://jadu.am/feed"),
        sourceGistUrl: url
      };
    });
  } catch (err) {
    console.error(`[Jadu.am] Failed to fetch Gist (${url}):`, err.message);
    return [];
  }
};

const postJaduBatch = async (posts, batchSize = 5) => {
  const batch = posts.slice(0, batchSize);
  for (let post of batch) {
    const description = post.summary || post.description || "";
    const displayTitle = post.author ? `${post.title} - ${post.author}` : post.title;
    const message = `✨ <b>${displayTitle}</b> ✨\n\n${description}`;
    
    const buttons = [[
      { text: "🔮 Այցելիր Վեբկայք - Jadu.am", url: post.linkUrl || "https://jadu.am" }
    ]];

    const jaduPost = { ...post };

    if (post.category === "Գիրք") {
      if (jaduPost.imageUrl) {
        jaduPost.imageUrl = `https://wsrv.nl/?url=${encodeURIComponent(post.imageUrl)}&w=600&h=600&fit=contain&bg=ffffff&output=jpg`;
      }
    } else {
      const youtubeThumb = getYouTubeThumbnail(post.youtubeUrl);
      if (youtubeThumb) {
        jaduPost.imageUrl = youtubeThumb;
      }
      if (post.youtubeUrl) {
        buttons.unshift([
          { text: "▶️ Դիտել YouTube-ում", url: post.youtubeUrl }
        ]);
      }
    }

    const channelSuccess = await sendPost(jaduBot, jaduChannelId, jaduPost, message, buttons);
    if (channelSuccess) {
      console.log(`✅ [Jadu.am] Post ${post.id} (${post.category}) from ${post.sourceGistUrl.split('/').pop()} sent to channel`);
      
      // Update per-Gist tracking ID
      jaduLastSentIds[post.sourceGistUrl] = Math.max(jaduLastSentIds[post.sourceGistUrl] || 0, post.id);
      saveJaduLastSentIds();
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
    let allNewPosts = [];

    // Loop through each Gist individually using its own tracking ID
    for (const gistUrl of jaduGistUrls) {
      const lastSentId = jaduLastSentIds[gistUrl] || 0;
      const items = await fetchGistItems(gistUrl);

      const newItems = items
        .filter(isValidPost)
        .filter((item) => item.id > lastSentId);

      if (newItems.length > 0) {
        newItems.sort((a, b) => a.id - b.id);
        allNewPosts = allNewPosts.concat(newItems);
      }
    }

    if (!allNewPosts.length) {
      console.log("✓ [Jadu.am] No new posts across any Gist");
      return;
    }

    console.log(`📬 [Jadu.am] Found ${allNewPosts.length} new post(s) total across Gists`);

    while (allNewPosts.length > 0) {
      allNewPosts = await postJaduBatch(allNewPosts, 5);
      if (allNewPosts.length > 0) {
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

app.get("/", (req, res) => res.send("Triple Telegram Bot Server Running ✅"));

app.get("/status", (req, res) => {
  res.json({
    status: "running",
    tiegRun: { lastSentId: tiegLastSentId, channelId: tiegChannelId, groupId: tiegGroupId },
    jaduAm: { lastSentIds: jaduLastSentIds, channelId: jaduChannelId, gistsCount: jaduGistUrls.length },
    jaduSupport: { groupId: supportJaduGroupId, active: !!supportJaduBot },
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
  jaduLastSentIds = {};
  saveJaduLastSentIds();
  console.log("🔄 Reset tracking IDs to 0 for all bots");
  try {
    await runAllChecks();
    res.json({ status: "reset_all", tiegLastSentId, jaduLastSentIds });
  } catch {
    res.status(500).send("ERROR");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Unified Bot Server running on port ${PORT}`);
});