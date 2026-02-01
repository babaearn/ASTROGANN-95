/**
 * Validators for Crypto Billionaire Bot
 * Input validation and sanitization utilities
 */

/**
 * Validate that a value is a positive number
 * @param {any} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validatePositiveNumber(value, fieldName = 'value') {
  if (value === null || value === undefined) {
    return { valid: false, value: null, error: `${fieldName} is required` };
  }

  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, value: null, error: `${fieldName} must be a valid number` };
  }

  if (num <= 0) {
    return { valid: false, value: null, error: `${fieldName} must be positive` };
  }

  if (!isFinite(num)) {
    return { valid: false, value: null, error: `${fieldName} must be finite` };
  }

  return { valid: true, value: num, error: null };
}

/**
 * Validate that a value is a number (including zero and negative)
 * @param {any} value
 * @param {string} fieldName
 * @param {Object} options
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateNumber(value, fieldName = 'value', options = {}) {
  const { min = -Infinity, max = Infinity, allowNull = false } = options;

  if (value === null || value === undefined) {
    if (allowNull) {
      return { valid: true, value: null, error: null };
    }
    return { valid: false, value: null, error: `${fieldName} is required` };
  }

  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, value: null, error: `${fieldName} must be a valid number` };
  }

  if (!isFinite(num)) {
    return { valid: false, value: null, error: `${fieldName} must be finite` };
  }

  if (num < min) {
    return { valid: false, value: null, error: `${fieldName} must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, value: null, error: `${fieldName} must be at most ${max}` };
  }

  return { valid: true, value: num, error: null };
}

/**
 * Validate price value (positive, reasonable range)
 * @param {any} price
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validatePrice(price) {
  const result = validatePositiveNumber(price, 'price');
  if (!result.valid) return result;

  // Sanity check for crypto prices (allow very small to very large)
  if (result.value < 0.00000001) {
    return { valid: false, value: null, error: 'price is too small (min: 0.00000001)' };
  }

  if (result.value > 10000000) {
    return { valid: false, value: null, error: 'price is too large (max: 10,000,000)' };
  }

  return result;
}

/**
 * Validate percentage value
 * @param {any} percent
 * @param {Object} options
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validatePercent(percent, options = {}) {
  const { min = 0, max = 100, fieldName = 'percent' } = options;

  const result = validateNumber(percent, fieldName, { min, max });
  return result;
}

/**
 * Validate symbol format (e.g., BTCUSDT)
 * @param {any} symbol
 * @returns {{ valid: boolean, value: string|null, error: string|null }}
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return { valid: false, value: null, error: 'symbol is required' };
  }

  const cleaned = symbol.toUpperCase().trim();

  if (cleaned.length < 3 || cleaned.length > 20) {
    return { valid: false, value: null, error: 'symbol must be 3-20 characters' };
  }

  if (!/^[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, value: null, error: 'symbol must contain only letters and numbers' };
  }

  return { valid: true, value: cleaned, error: null };
}

/**
 * Validate timeframe format
 * @param {any} timeframe
 * @returns {{ valid: boolean, value: string|null, error: string|null }}
 */
function validateTimeframe(timeframe) {
  const validTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

  if (!timeframe || typeof timeframe !== 'string') {
    return { valid: false, value: null, error: 'timeframe is required' };
  }

  const cleaned = timeframe.toLowerCase().trim();

  if (!validTimeframes.includes(cleaned)) {
    return {
      valid: false,
      value: null,
      error: `timeframe must be one of: ${validTimeframes.join(', ')}`
    };
  }

  return { valid: true, value: cleaned, error: null };
}

/**
 * Validate horizon format (for outcome labels)
 * @param {any} horizon
 * @returns {{ valid: boolean, value: string|null, error: string|null }}
 */
function validateHorizon(horizon) {
  const validHorizons = ['1h', '4h', '24h'];

  if (!horizon || typeof horizon !== 'string') {
    return { valid: false, value: null, error: 'horizon is required' };
  }

  const cleaned = horizon.toLowerCase().trim();

  if (!validHorizons.includes(cleaned)) {
    return {
      valid: false,
      value: null,
      error: `horizon must be one of: ${validHorizons.join(', ')}`
    };
  }

  return { valid: true, value: cleaned, error: null };
}

/**
 * Validate date
 * @param {any} date
 * @param {Object} options
 * @returns {{ valid: boolean, value: Date|null, error: string|null }}
 */
function validateDate(date, options = {}) {
  const { allowFuture = true, allowPast = true, fieldName = 'date' } = options;

  if (!date) {
    return { valid: false, value: null, error: `${fieldName} is required` };
  }

  let parsed;

  if (date instanceof Date) {
    parsed = date;
  } else if (typeof date === 'string' || typeof date === 'number') {
    parsed = new Date(date);
  } else {
    return { valid: false, value: null, error: `${fieldName} must be a valid date` };
  }

  if (isNaN(parsed.getTime())) {
    return { valid: false, value: null, error: `${fieldName} is not a valid date` };
  }

  const now = new Date();

  if (!allowFuture && parsed > now) {
    return { valid: false, value: null, error: `${fieldName} cannot be in the future` };
  }

  if (!allowPast && parsed < now) {
    return { valid: false, value: null, error: `${fieldName} cannot be in the past` };
  }

  return { valid: true, value: parsed, error: null };
}

/**
 * Validate Telegram chat ID
 * @param {any} chatId
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateChatId(chatId) {
  if (chatId === null || chatId === undefined) {
    return { valid: false, value: null, error: 'chatId is required' };
  }

  const num = parseInt(chatId, 10);

  if (isNaN(num)) {
    return { valid: false, value: null, error: 'chatId must be a valid integer' };
  }

  // Telegram chat IDs can be negative (for groups) or positive (for users)
  return { valid: true, value: num, error: null };
}

/**
 * Validate array of price history objects
 * @param {any} priceHistory
 * @param {Object} options
 * @returns {{ valid: boolean, value: Array|null, error: string|null }}
 */
function validatePriceHistory(priceHistory, options = {}) {
  const { minLength = 1, maxLength = 10000 } = options;

  if (!Array.isArray(priceHistory)) {
    return { valid: false, value: null, error: 'priceHistory must be an array' };
  }

  if (priceHistory.length < minLength) {
    return { valid: false, value: null, error: `priceHistory must have at least ${minLength} entries` };
  }

  if (priceHistory.length > maxLength) {
    return { valid: false, value: null, error: `priceHistory cannot exceed ${maxLength} entries` };
  }

  // Validate each entry has required fields
  for (let i = 0; i < priceHistory.length; i++) {
    const entry = priceHistory[i];

    if (!entry || typeof entry !== 'object') {
      return { valid: false, value: null, error: `priceHistory[${i}] must be an object` };
    }

    const price = entry.close_price || entry.closePrice || entry.price;
    if (price === undefined || price === null) {
      return { valid: false, value: null, error: `priceHistory[${i}] must have a price field` };
    }

    const priceValidation = validatePrice(price);
    if (!priceValidation.valid) {
      return { valid: false, value: null, error: `priceHistory[${i}]: ${priceValidation.error}` };
    }
  }

  return { valid: true, value: priceHistory, error: null };
}

/**
 * Validate historical events array
 * @param {any} events
 * @returns {{ valid: boolean, value: Array|null, error: string|null }}
 */
function validateHistoricalEvents(events) {
  if (!Array.isArray(events)) {
    return { valid: false, value: null, error: 'historicalEvents must be an array' };
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (!event || typeof event !== 'object') {
      return { valid: false, value: null, error: `historicalEvents[${i}] must be an object` };
    }

    const dateField = event.event_date || event.eventDate || event.date;
    if (!dateField) {
      return { valid: false, value: null, error: `historicalEvents[${i}] must have a date field` };
    }

    const dateValidation = validateDate(dateField, { fieldName: `historicalEvents[${i}].date` });
    if (!dateValidation.valid) {
      return { valid: false, value: null, error: dateValidation.error };
    }
  }

  return { valid: true, value: events, error: null };
}

/**
 * Validate degree value (0-360)
 * @param {any} degree
 * @param {Object} options
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
function validateDegree(degree, options = {}) {
  const { allowNull = true, fieldName = 'degree' } = options;

  if (degree === null || degree === undefined) {
    if (allowNull) {
      return { valid: true, value: null, error: null };
    }
    return { valid: false, value: null, error: `${fieldName} is required` };
  }

  const result = validateNumber(degree, fieldName, { min: 0, max: 360 });
  return result;
}

/**
 * Validate weights object
 * @param {any} weights
 * @returns {{ valid: boolean, value: Object|null, error: string|null }}
 */
function validateWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    return { valid: false, value: null, error: 'weights must be a valid object' };
  }

  const validated = {};

  for (const [key, value] of Object.entries(weights)) {
    const result = validateNumber(value, `weights.${key}`, { min: 0, max: 1 });
    if (!result.valid) {
      return { valid: false, value: null, error: result.error };
    }
    validated[key] = result.value;
  }

  return { valid: true, value: validated, error: null };
}

/**
 * Batch validate multiple fields
 * @param {Object} validations - { fieldName: { value, validator, options } }
 * @returns {{ valid: boolean, values: Object, errors: Object }}
 */
function validateBatch(validations) {
  const values = {};
  const errors = {};
  let valid = true;

  for (const [fieldName, config] of Object.entries(validations)) {
    const { value, validator, options = {} } = config;
    const result = validator(value, options);

    if (result.valid) {
      values[fieldName] = result.value;
    } else {
      valid = false;
      errors[fieldName] = result.error;
    }
  }

  return { valid, values, errors };
}

/**
 * Sanitize string input
 * @param {any} input
 * @param {Object} options
 * @returns {string}
 */
function sanitizeString(input, options = {}) {
  const { maxLength = 1000, trim = true, toLowerCase = false, toUpperCase = false } = options;

  if (input === null || input === undefined) {
    return '';
  }

  let str = String(input);

  if (trim) {
    str = str.trim();
  }

  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  if (toLowerCase) {
    str = str.toLowerCase();
  }

  if (toUpperCase) {
    str = str.toUpperCase();
  }

  return str;
}

module.exports = {
  validatePositiveNumber,
  validateNumber,
  validatePrice,
  validatePercent,
  validateSymbol,
  validateTimeframe,
  validateHorizon,
  validateDate,
  validateChatId,
  validatePriceHistory,
  validateHistoricalEvents,
  validateDegree,
  validateWeights,
  validateBatch,
  sanitizeString
};
