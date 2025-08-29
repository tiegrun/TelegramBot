require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

// --- Middleware ---
app.use(express.json());

// --- Health check endpoint ---
app.get('/', (req, res) => res.send('Bot is running!'));

// --- Telegram Bot ---
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ Error: BOT_TOKEN not found in .env file!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });
console.log("✅ Bot is ready!");

// --- Channel ID ---
const channelId = -1003010205363;

// --- JSONKeeper posts URL ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- Last sent post ID ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

// --- Load last sent ID ---
const loadLastSentId = () => {
  try {
    if (fs.existsSync(lastIdFile)) {
      const data = fs.readFileSync(lastIdFile, "utf8");
      const parsed = JSON.parse(data);
      lastSentId = parsed.lastId || 0;
      console.log(`ℹ️ Loaded lastSentId: ${lastSentId}`);
    } else {
      console.log("ℹ️ No lastSentId file found, starting from 0");
    }
  } catch (err) {
    console.error("⚠️ Error loading lastSentId:", err.message);
    lastSentId = 0;
  }
};

// --- Save last sent ID ---
const saveLastSentId = (id) => {
  try {
    fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: id }));
    console.log(`💾 Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("⚠️ Error saving lastSentId:", err.message);
  }
};

// --- Initialize lastSentId ---
loadLastSentId();

// --- Fetch posts from JSONKeeper ---
const fetchPosts = async () => {
  try {
    const res = await axios.get(POSTS_URL, {
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    });

    if (!res.data) return [];

    let posts = [];
    if (Array.isArray(res.data)) {
      posts = res.data;
    } else if (res.data.posts && Array.isArray(res.data.posts)) {
      posts = res.data.posts;
    } else {
      return [];
    }

    return posts;
  } catch (err) {
    console.error("⚠️ Error fetching posts:", err.message);
    return [];
  }
};

// --- Silent fetch posts ---
const fetchPostsSilent = async () => {
  try {
    const res = await axios.get(POSTS_URL, { timeout: 10000 });
    if (!res.data) return [];
    return Array.isArray(res.data) ? res.data : (res.data.posts || []);
  } catch {
    return [];
  }
};

// --- Validate post ---
const isValidPost = (post) => {
  return (
    post &&
    typeof post.id === "number" &&
    post.title &&
    post.summary
  );
};

// --- Post new posts ---
const postNewPosts = async () => {
  try {
    const posts = await fetchPosts();
    if (!posts.length) {
      return { success: true, message: "No posts found", newPosts: 0 };
    }

    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter(p => p.id > lastSentId);

    if (!newPosts.length) {
      return { success: true, message: "No new posts", newPosts: 0 };
    }

    newPosts.sort((a, b) => a.id - b.id);

    let sentCount = 0;
    for (let post of newPosts) {
      const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
      const buttons = [[
        { text: "▶️ Watch on YouTube", url: post.youtubeUrl || "https://www.youtube.com" },
        { text: "🌐 Visit Website", url: "https://www.tieg.run/#blog" }
      ]];

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

        lastSentId = post.id;
        saveLastSentId(lastSentId);
        sentCount++;

        if (newPosts.length > 1) {
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (err) {
        console.error(`⚠️ Error sending post ${post.id}:`, err.message);
        throw err;
      }
    }

    return { success: true, message: `Sent ${sentCount} posts`, newPosts: sentCount };
  } catch (err) {
    return { success: false, message: err.message, newPosts: 0 };
  }
};

// --- FIXED: Silent post new posts ---
const postNewPostsSilent = async () => {
  try {
    const posts = await fetchPostsSilent();
    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter(p => p.id > lastSentId);

    if (!newPosts.length) return { success: true, count: 0 };

    // Limit to 5 posts max to prevent overwhelming output
    const limitedPosts = newPosts.sort((a, b) => a.id - b.id).slice(0, 5);

    for (let post of limitedPosts) {
      const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
      const buttons = [[
        { text: "▶️ Watch on YouTube", url: post.youtubeUrl || "https://www.youtube.com" },
        { text: "🌐 Visit Website", url: "https://www.tieg.run/#blog" }
      ]];

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

        lastSentId = post.id;
        saveLastSentId(lastSentId);

        if (limitedPosts.length > 1) {
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (err) {
        // Return error but don't throw to avoid cascading failures
        return { success: false, error: err.message };
      }
    }

    return { success: true, count: limitedPosts.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// --- Endpoints ---

// FIXED: Silent endpoint with proper logging control
app.get('/silent', async (req, res) => {
  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  try {
    // Temporarily disable logging for this request only
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    const result = await postNewPostsSilent();
    
    // Send minimal response - just status code, no body
    res.status(result.success ? 200 : 500).end();
  } catch (err) {
    res.status(500).end();
  } finally {
    // CRITICAL: Restore original console methods
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
});

// Alternative ultra-minimal silent endpoint
app.get('/silent-minimal', async (req, res) => {
  try {
    // Ultra-minimal approach - no logging override needed
    const posts = await axios.get(POSTS_URL, { timeout: 5000 }).then(r => r.data).catch(() => []);
    const validPosts = (Array.isArray(posts) ? posts : (posts.posts || [])).filter(isValidPost);
    const newPosts = validPosts.filter(p => p.id > lastSentId).slice(0, 3); // Max 3 posts

    for (let post of newPosts) {
      try {
        const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
        const buttons = [[
          { text: "▶️ Watch on YouTube", url: post.youtubeUrl || "https://www.youtube.com" },
          { text: "🌐 Visit Website", url: "https://www.tieg.run/#blog" }
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
        await new Promise(res => setTimeout(res, 1000));
      } catch {
        break; // Stop on first error
      }
    }
    
    res.end(); // Absolutely minimal response
  } catch {
    res.status(500).end();
  }
});

app.get('/send', async (req, res) => {
  const result = await postNewPosts();
  res.sendStatus(result.success ? 200 : 500);
});

app.get('/cron', async (req, res) => {
  try {
    await postNewPosts();
    res.status(200).send("1");
  } catch {
    res.status(500).send("0");
  }
});

app.get('/status', (req, res) => {
  res.json({
    status: "running",
    lastSentId,
    channelId,
    timestamp: new Date().toISOString()
  });
});

app.get('/check', async (req, res) => {
  try {
    const posts = await fetchPosts();
    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter(p => p.id > lastSentId);

    res.json({
      totalPosts: posts.length,
      validPosts: validPosts.length,
      newPosts: newPosts.length,
      lastSentId,
      newPostIds: newPosts.map(p => p.id),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test-json', async (req, res) => {
  try {
    const response = await axios.get(POSTS_URL);
    res.json({
      status: "success",
      isArray: Array.isArray(response.data),
      hasPostsProperty: !!response.data.posts,
      sampleData: response.data
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/reset', async (req, res) => {
  lastSentId = 0;
  saveLastSentId(0);
  const result = await postNewPosts();

  res.json({
    status: "reset_complete",
    message: result.message,
    newPosts: result.newPosts,
    currentLastId: lastSentId
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});