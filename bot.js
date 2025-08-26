require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

// Add middleware for parsing JSON
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => res.send('Bot is running!'));

// --- Telegram Bot ---
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN not found!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });
console.log("Bot is ready");

// ✅ Your channel ID
const channelId = -1003010205363;

// --- JSONKeeper posts URL ---
const POSTS_URL = "https://www.jsonkeeper.com/b/0VPTV";

// --- File to store last sent id ---
const lastIdFile = "lastSentId.json";
let lastSentId = 0;

// Load last sent id if exists
const loadLastSentId = () => {
  try {
    if (fs.existsSync(lastIdFile)) {
      const data = fs.readFileSync(lastIdFile, "utf8");
      const parsed = JSON.parse(data);
      lastSentId = parsed.lastId || 0;
      console.log(`Loaded lastSentId: ${lastSentId}`);
    } else {
      console.log("No lastSentId file found, starting from 0");
    }
  } catch (err) {
    console.error("Error loading lastSentId:", err.message);
    lastSentId = 0;
  }
};

// Save last sent id
const saveLastSentId = (id) => {
  try {
    fs.writeFileSync(lastIdFile, JSON.stringify({ lastId: id }));
    console.log(`Saved lastSentId: ${id}`);
  } catch (err) {
    console.error("Error saving lastSentId:", err.message);
  }
};

// Initialize lastSentId
loadLastSentId();

// --- Fetch posts from JSONKeeper ---
const fetchPosts = async () => {
  try {
    console.log("Fetching posts from JSONKeeper...");
    const res = await axios.get(POSTS_URL, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'TelegramBot/1.0'
      }
    });
    
    console.log("Response received:", res.status);
    
    if (!res.data) {
      console.log("No data in response");
      return [];
    }
    
    // Handle your specific JSON structure: { "posts": [...] }
    let posts = [];
    if (Array.isArray(res.data)) {
      posts = res.data;
    } else if (res.data.posts && Array.isArray(res.data.posts)) {
      posts = res.data.posts;
    } else {
      console.log("Unexpected data structure:", typeof res.data);
      return [];
    }
    
    console.log(`Found ${posts.length} total posts`);
    return posts;
  } catch (err) {
    console.error("Error fetching posts:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return [];
  }
};

// --- Validate post data ---
const isValidPost = (post) => {
  return post && 
         post.id && 
         typeof post.id === 'number' && 
         post.title && 
         post.summary;
};

// --- Post new posts ---
const postNewPosts = async () => {
  try {
    console.log("Starting postNewPosts...");
    const posts = await fetchPosts();
    
    if (!posts || posts.length === 0) {
      console.log("No posts found");
      return { success: true, message: "No posts found", newPosts: 0 };
    }

    // Filter and validate posts
    const validPosts = posts.filter(isValidPost);
    console.log(`Valid posts: ${validPosts.length}`);
    
    const newPosts = validPosts.filter(post => post.id > lastSentId);
    console.log(`New posts (id > ${lastSentId}): ${newPosts.length}`);
    
    if (newPosts.length === 0) {
      console.log("No new posts to send");
      return { success: true, message: "No new posts", newPosts: 0 };
    }

    // Sort ascending so oldest first
    newPosts.sort((a, b) => a.id - b.id);
    console.log(`Sending ${newPosts.length} new posts...`);

    let sentCount = 0;
    for (let post of newPosts) {
      try {
        const message = `📰 <b>${post.title}</b>\n\n${post.summary}`;
        const buttons = [
          [
            { text: "▶️ Watch on YouTube", url: post.youtubeUrl || "https://www.youtube.com" },
            { text: "🌐 Visit Website", url: "https://www.tieg.run/" }
          ]
        ];

        console.log(`Sending post ${post.id}: ${post.title}`);

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

        // Update lastSentId after successful send
        lastSentId = post.id;
        saveLastSentId(lastSentId);
        sentCount++;
        
        console.log(`Successfully sent post ${post.id}`);
        
        // Add small delay to avoid rate limiting
        if (newPosts.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (err) {
        console.error(`Error sending post ${post.id}:`, err.message);
        // Don't update lastSentId if sending failed
        throw err; // Re-throw to stop processing more posts
      }
    }
    
    return { 
      success: true, 
      message: `Successfully sent ${sentCount} posts`, 
      newPosts: sentCount 
    };
    
  } catch (err) {
    console.error("Error in postNewPosts:", err.message);
    return { 
      success: false, 
      message: err.message, 
      newPosts: 0 
    };
  }
};

// --- Expose endpoint for cron-job.org ---
app.get('/send', async (req, res) => {
  try {
    console.log("=== Cron job triggered ===");
    const result = await postNewPosts();
    
    console.log("Result:", result);
    
    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: result.message,
        newPosts: result.newPosts,
        currentLastId: lastSentId,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error("Error in /send endpoint:", err.message);
    res.status(500).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add status endpoint for debugging
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    lastSentId: lastSentId,
    timestamp: new Date().toISOString(),
    channelId: channelId
  });
});

// Test endpoint to check posts without sending
app.get('/check', async (req, res) => {
  try {
    const posts = await fetchPosts();
    const validPosts = posts.filter(isValidPost);
    const newPosts = validPosts.filter(post => post.id > lastSentId);
    
    res.json({
      totalPosts: posts.length,
      validPosts: validPosts.length,
      newPosts: newPosts.length,
      lastSentId: lastSentId,
      newPostIds: newPosts.map(p => p.id).sort(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add a test endpoint to see your JSON structure
app.get('/test-json', async (req, res) => {
  try {
    const response = await axios.get(POSTS_URL);
    res.json({
      status: 'success',
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      hasPostsProperty: response.data.posts !== undefined,
      sampleData: response.data
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Send endpoint: http://localhost:${PORT}/send`);
  console.log(`Status endpoint: http://localhost:${PORT}/status`);
  console.log(`Check endpoint: http://localhost:${PORT}/check`);
  console.log(`Test JSON endpoint: http://localhost:${PORT}/test-json`);
});

// Optional: Don't post immediately on startup to avoid duplicates
// postNewPosts();