const TelegramBot = require('node-telegram-bot-api');

// Use environment variable for security
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log("Bot is running...");

// Store user conversation states
const userStates = {};
const greetings = ["Hello!", "Hi there!", "Hey! How are you?", "Hi! Nice to see you!"];

const channelId = -1003010205363; // 

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Hello! I'm your bot. Type 'hello', 'help', or 'hi' to chat.");
  userStates[chatId] = 'start';
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "Commands you can try:\n" +
    "- hello / hi → I greet you randomly\n" +
    "- about → Learn about me\n" +
    "- joke → I tell a joke\n" +
    "- thanks → I will reply\n" +
    "- /sendToChannel → I post a message to the channel"
  );
});

// Handle messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

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
    bot.sendMessage(chatId, "Why did the programmer quit his job? Because he didn't get arrays!");
  } else if (text === 'thanks' || text === 'thank you') {
    bot.sendMessage(chatId, "You're welcome! 😊");
  } else if (!text.startsWith('/')) {
    bot.sendMessage(chatId, "I didn't understand that. Try 'hello', 'about', 'joke', or 'help'.");
  }
});

// Command to send message to channel manually
bot.onText(/\/sendToChannel/, (msg) => {
  bot.sendMessage(channelId, "Hello channel! This is a message from the bot.");
});

// Optional: automatically post to channel every hour
setInterval(() => {
  bot.sendMessage(channelId, "Hello channel! This is an automated hourly message.");
}, 3600000); // 1 hour in milliseconds
