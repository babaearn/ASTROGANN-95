/**
 * TELEGRAM BOT
 * ============
 * Main Telegram bot initialization and management
 */

const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { registerCommands } = require('./commands');
const config = require('../config');

// ============================================================
// BOT INSTANCE
// ============================================================

let bot = null;
let isRunning = false;
let startTime = null;

/**
 * Initialize the Telegram bot
 */
function initialize() {
  const token = config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not set - bot will not start');
    return null;
  }

  try {
    // Create bot instance
    bot = new TelegramBot(token, {
      polling: {
        interval: 1000,
        autoStart: false,
        params: {
          timeout: 30
        }
      }
    });

    // Error handling
    bot.on('polling_error', (error) => {
      logger.error('Telegram polling error', {
        code: error.code,
        message: error.message
      });
    });

    bot.on('error', (error) => {
      logger.error('Telegram bot error', { error: error.message });
    });

    // Register commands
    registerCommands(bot);

    logger.info('Telegram bot initialized');
    return bot;
  } catch (error) {
    logger.error('Failed to initialize Telegram bot', { error: error.message });
    return null;
  }
}

/**
 * Start the bot (begin polling)
 */
async function start() {
  if (!bot) {
    bot = initialize();
  }

  if (!bot) {
    logger.warn('Cannot start bot - not initialized');
    return false;
  }

  if (isRunning) {
    logger.debug('Bot already running');
    return true;
  }

  try {
    await bot.startPolling();
    isRunning = true;
    startTime = new Date();

    const me = await bot.getMe();
    logger.info('Telegram bot started', {
      username: me.username,
      id: me.id
    });

    return true;
  } catch (error) {
    logger.error('Failed to start bot polling', { error: error.message });
    return false;
  }
}

/**
 * Stop the bot
 */
async function stop() {
  if (!bot || !isRunning) {
    return true;
  }

  try {
    await bot.stopPolling();
    isRunning = false;
    logger.info('Telegram bot stopped');
    return true;
  } catch (error) {
    logger.error('Error stopping bot', { error: error.message });
    return false;
  }
}

/**
 * Send a message to a specific chat
 */
async function sendMessage(chatId, text, options = {}) {
  if (!bot) {
    logger.warn('Cannot send message - bot not initialized');
    return null;
  }

  const defaultOptions = {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  try {
    const result = await bot.sendMessage(chatId, text, { ...defaultOptions, ...options });
    logger.debug('Message sent', { chatId, messageId: result.message_id });
    return result;
  } catch (error) {
    logger.error('Failed to send message', {
      chatId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Send message to the configured admin chat
 */
async function sendToAdmin(text, options = {}) {
  const adminChatId = config.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!adminChatId) {
    logger.warn('TELEGRAM_CHAT_ID not set - cannot send admin message');
    return null;
  }

  return sendMessage(adminChatId, text, options);
}

/**
 * Broadcast message to all active users
 */
async function broadcast(text, options = {}) {
  const db = require('../database/models');

  try {
    const users = await db.getActiveUsers();

    if (!users || users.length === 0) {
      // Fallback to admin chat
      return sendToAdmin(text, options);
    }

    const results = await Promise.allSettled(
      users.map(user => sendMessage(user.telegram_chat_id, text, options))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Broadcast complete', { successful, failed, total: users.length });

    return { successful, failed, total: users.length };
  } catch (error) {
    logger.error('Broadcast failed', { error: error.message });
    // Fallback to admin
    return sendToAdmin(text, options);
  }
}

/**
 * Send alert to all users
 */
async function sendAlert(alertData) {
  const formatters = require('./formatters');
  const text = formatters.formatAlert(alertData);
  return broadcast(text);
}

/**
 * Send daily briefing
 */
async function sendDailyBriefing(briefingData) {
  const formatters = require('./formatters');
  const text = formatters.formatDailyBriefing(briefingData);
  return broadcast(text);
}

/**
 * Send weekly war room
 */
async function sendWeeklyWarRoom(warRoomData) {
  const formatters = require('./formatters');
  const text = formatters.formatWeeklyWarRoom(warRoomData);
  return broadcast(text);
}

/**
 * Get bot status
 */
function getStatus() {
  return {
    initialized: bot !== null,
    running: isRunning,
    startTime,
    uptime: startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0
  };
}

/**
 * Get bot instance (for advanced usage)
 */
function getBot() {
  return bot;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  initialize,
  start,
  stop,
  sendMessage,
  sendToAdmin,
  broadcast,
  sendAlert,
  sendDailyBriefing,
  sendWeeklyWarRoom,
  getStatus,
  getBot
};
