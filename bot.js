const TelegramBot = require('node-telegram-bot-api');

// Replace with your BotFather token
const token = process.env.BOT_TOKEN;


// Create bot with polling
const bot = new TelegramBot(token, { polling: true });

// Store user conversation states
const userStates = {};

// Random greetings
const greetings = ["Hello!", "Hi there!", "Hey! How are you?", "Hi! Nice to see you!"];

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Hello! I'm your expanded bot. Type 'hello', 'help', or 'hi' to start chatting.");
  userStates[chatId] = 'start';
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "You can type:\n" +
    "- hello / hi → I greet you randomly\n" +
    "- help → Show this message\n" +
    "- about → Learn about me\n" +
    "- joke → I tell a joke\n" +
    "- thanks → I will say you're welcome\n" +
    "- Let's have a mini conversation too!"
  );
});

// Handle messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  if (!userStates[chatId]) userStates[chatId] = 'start';

  // Mini conversation
  if (userStates[chatId] === 'askColor') {
    bot.sendMessage(chatId, `Nice! ${text} is a beautiful color.`);
    userStates[chatId] = 'start';
    return;
  }

  // Normal responses
  if (text === 'hello' || text === 'hi') {
    const reply = greetings[Math.floor(Math.random() * greetings.length)];
    bot.sendMessage(chatId, reply);
    bot.sendMessage(chatId, "By the way, what's your favorite color?");
    userStates[chatId] = 'askColor'; // start mini conversation
  } else if (text === 'help') {
    bot.sendMessage(chatId, "You can type 'hello', 'about', 'joke', 'thanks', or start a mini conversation by saying 'hi'.");
  } else if (text === 'about') {
    bot.sendMessage(chatId, "I am an expanded demo Telegram bot created with Node.js! I can chat with you.");
  } else if (text === 'joke') {
    bot.sendMessage(chatId, "Why did the programmer quit his job? Because he didn't get arrays!");
  } else if (text === 'thanks' || text === 'thank you') {
    bot.sendMessage(chatId, "You're welcome! 😊");
  } else if (!text.startsWith('/')) {
    bot.sendMessage(chatId, "I didn't understand that. Try typing 'hello', 'about', 'joke', or 'help'.");
  }
});
