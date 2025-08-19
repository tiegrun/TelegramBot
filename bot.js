const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("Error: BOT_TOKEN not found in environment!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true, debug: true });
console.log("Bot is running...");


// Replace with your channel ID (numeric, starts with -100)
const channelId = -1003010205363; // <-- replace with your channel ID

// Store user conversation states (for private chats)
const userStates = {};
const greetings = ["Hello!", "Hi there!", "Hey! How are you?", "Hi! Nice to see you!"];

// --- Handle private messages (from users) ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  // Skip messages from channels (only log if needed)
  if (msg.chat.type === 'channel') {
    console.log(`Channel message: ${text}`);
    return; // Do not process messages in channel as private chat
  }

  if (!text) return;

  if (!userStates[chatId]) userStates[chatId] = 'start';

  // Mini conversation step
  if (userStates[chatId] === 'askColor') {
    bot.sendMessage(chatId, `Nice! ${text} is a beautiful color.`);
    userStates[chatId] = 'start';
    return;
  }

  // Auto-responses
  if (text === 'hello' || text === 'hi') {
    const reply = greetings[Math.floor(Math.random() * greetings.length)];
    bot.sendMessage(chatId, reply);
    bot.sendMessage(chatId, "By the way, what's your favorite color?");
    userStates[chatId] = 'askColor';
  } else if (text === 'help') {
    bot.sendMessage(chatId, "Try typing 'hello', 'about', 'joke', or 'thanks'.");
  } else if (text === 'about') {
    bot.sendMessage(chatId, "I am a demo Telegram bot created with Node.js!");
  } else if (text === 'joke') {
    bot.sendMessage(chatId, "Why did the programmer quit his job? Because he didn’t get arrays!");
  } else if (text === 'thanks' || text === 'thank you') {
    bot.sendMessage(chatId, "You're welcome! 😊");
  } else if (!text.startsWith('/')) {
    bot.sendMessage(chatId, "I didn’t understand that. Try 'hello', 'about', 'joke', or 'help'.");
  }
});

// --- Command to post a message to the channel ---
bot.onText(/\/sendToChannel (.+)/, (msg, match) => {
  const textToSend = match[1]; // message after the command
  bot.sendMessage(channelId, textToSend);
});

// --- Optional: Scheduled messages to channel ---
const scheduledMessages = [
  "📰 Daily Marketing Tip: Focus on your audience's needs!",
  "📈 Business Insight: Track your metrics daily.",
  "💡 Growth Hack: Automate repetitive tasks for efficiency."
];

let i = 0;
setInterval(() => {
  bot.sendMessage(channelId, scheduledMessages[i]);
  i = (i + 1) % scheduledMessages.length;
}, 3600000); // every 1 hour
