/**
 * Configuration module for Crypto Billionaire Bot
 * Centralizes all configuration with validation
 */

require('dotenv').config();

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    poolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 20
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // Timezone configuration
  timezone: {
    storage: 'UTC',
    display: 'Asia/Kolkata',
    displayShort: 'IST'
  },

  // Gann analysis defaults
  gann: {
    defaultSymbol: 'BTCUSDT',
    cycles: {
      minor: [7, 14, 30],
      major: [90, 120, 144, 180, 360],
      tolerance: 3 // days
    },
    angles: {
      defaultTimeUnit: 'hour',
      defaultOneByOne: 'auto'
    },
    targets: {
      defaultMinPercent: 0.5,
      defaultMaxPercent: 5
    }
  },

  // Future Telegram configuration (Part 2)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID
  },

  // Future Binance configuration (Part 2)
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET
  }
};

/**
 * Validate required configuration
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateConfig() {
  const errors = [];

  // In production, DATABASE_URL is required
  if (config.server.isProduction && !config.database.url) {
    errors.push('DATABASE_URL is required in production');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  ...config,
  validateConfig
};
