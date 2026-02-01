/**
 * Structured Logger for Crypto Billionaire Bot
 * Outputs JSON-formatted logs for production, pretty logs for development
 * All timestamps in UTC with Asia/Kolkata display option
 */

const DISPLAY_TIMEZONE = 'Asia/Kolkata';

/**
 * Log levels with numeric priorities
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

/**
 * Get current log level from environment
 */
function getCurrentLogLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
}

/**
 * Format timestamp for display
 * @param {Date} date
 * @param {boolean} showTimezone
 * @returns {string}
 */
function formatTimestamp(date = new Date(), showTimezone = false) {
  if (showTimezone) {
    return date.toLocaleString('en-IN', {
      timeZone: DISPLAY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  }
  return date.toISOString();
}

/**
 * Colorize output for terminal (development only)
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m'
};

const levelColors = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.blue,
  debug: colors.gray,
  trace: colors.cyan
};

/**
 * Safely stringify objects, handling circular references
 * @param {any} obj
 * @returns {string}
 */
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Handle BigInt
    if (typeof value === 'bigint') {
      return value.toString();
    }
    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    return value;
  }, 2);
}

/**
 * Format log entry
 * @param {string} level
 * @param {string} message
 * @param {Object} meta
 * @returns {string}
 */
function formatLog(level, message, meta = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date();

  if (isProduction) {
    // JSON format for production (Railway, etc.)
    const logEntry = {
      timestamp: timestamp.toISOString(),
      level: level.toUpperCase(),
      message,
      ...meta
    };
    return JSON.stringify(logEntry);
  }

  // Pretty format for development
  const color = levelColors[level] || colors.reset;
  const levelStr = `${color}[${level.toUpperCase().padEnd(5)}]${colors.reset}`;
  const timeStr = `${colors.gray}${formatTimestamp(timestamp, true)}${colors.reset}`;

  let output = `${timeStr} ${levelStr} ${message}`;

  if (Object.keys(meta).length > 0) {
    const metaStr = safeStringify(meta);
    output += ` ${colors.magenta}${metaStr}${colors.reset}`;
  }

  return output;
}

/**
 * Core logging function
 * @param {string} level
 * @param {string} message
 * @param {Object} meta
 */
function log(level, message, meta = {}) {
  const currentLevel = getCurrentLogLevel();
  const messageLevel = LOG_LEVELS[level];

  if (messageLevel === undefined || messageLevel > currentLevel) {
    return;
  }

  const formatted = formatLog(level, message, meta);

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * Logger interface
 */
const logger = {
  /**
   * Log error message
   * @param {string} message
   * @param {Object} meta
   */
  error(message, meta = {}) {
    log('error', message, meta);
  },

  /**
   * Log warning message
   * @param {string} message
   * @param {Object} meta
   */
  warn(message, meta = {}) {
    log('warn', message, meta);
  },

  /**
   * Log info message
   * @param {string} message
   * @param {Object} meta
   */
  info(message, meta = {}) {
    log('info', message, meta);
  },

  /**
   * Log debug message
   * @param {string} message
   * @param {Object} meta
   */
  debug(message, meta = {}) {
    log('debug', message, meta);
  },

  /**
   * Log trace message
   * @param {string} message
   * @param {Object} meta
   */
  trace(message, meta = {}) {
    log('trace', message, meta);
  },

  /**
   * Create a child logger with default meta
   * @param {Object} defaultMeta
   * @returns {Object}
   */
  child(defaultMeta = {}) {
    return {
      error: (msg, meta = {}) => logger.error(msg, { ...defaultMeta, ...meta }),
      warn: (msg, meta = {}) => logger.warn(msg, { ...defaultMeta, ...meta }),
      info: (msg, meta = {}) => logger.info(msg, { ...defaultMeta, ...meta }),
      debug: (msg, meta = {}) => logger.debug(msg, { ...defaultMeta, ...meta }),
      trace: (msg, meta = {}) => logger.trace(msg, { ...defaultMeta, ...meta })
    };
  },

  /**
   * Log with timing information
   * @param {string} label
   * @returns {Function} - Call to end timing
   */
  time(label) {
    const start = Date.now();
    return (message = 'completed', meta = {}) => {
      const duration = Date.now() - start;
      logger.info(`${label}: ${message}`, { ...meta, durationMs: duration });
    };
  },

  /**
   * Convert UTC timestamp to IST display string
   * @param {Date|string} utcTime
   * @returns {string}
   */
  toIST(utcTime) {
    const date = utcTime instanceof Date ? utcTime : new Date(utcTime);
    return formatTimestamp(date, true);
  },

  /**
   * Get current time in IST
   * @returns {string}
   */
  nowIST() {
    return formatTimestamp(new Date(), true);
  }
};

module.exports = logger;
