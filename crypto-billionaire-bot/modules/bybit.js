/**
 * BYBIT V5 API CLIENT
 * ====================
 * Public market data endpoints only (no authentication required)
 * Implements retry logic and caching for reliability
 */

const logger = require('../utils/logger');

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_URL = process.env.BYBIT_BASE_URL || 'https://api.bybit.com';

// Cache TTL in milliseconds per endpoint type
const CACHE_TTL = {
  tickers: 5000,        // 5 seconds - real-time data
  kline: 60000,         // 1 minute - historical data
  orderbook: 3000,      // 3 seconds - very dynamic
  openInterest: 30000,  // 30 seconds
  longShortRatio: 60000, // 1 minute
  fundingRate: 60000    // 1 minute
};

// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// In-memory cache
const cache = new Map();

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get cached data if not expired
 * @param {string} key - Cache key
 * @returns {any|null}
 */
function getFromCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

/**
 * Store data in cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in ms
 */
function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl
  });
}

/**
 * Generate cache key from endpoint and params
 * @param {string} endpoint
 * @param {Object} params
 * @returns {string}
 */
function getCacheKey(endpoint, params = {}) {
  const paramStr = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `bybit:${endpoint}:${paramStr}`;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with retry logic
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @param {number} cacheTtl - Cache TTL in ms
 * @returns {Promise<Object>}
 */
async function makeRequest(endpoint, params = {}, cacheTtl = 30000) {
  const cacheKey = getCacheKey(endpoint, params);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('Bybit cache hit', { endpoint, cacheKey });
    return cached;
  }

  // Build URL with query params
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      queryParams.append(key, value);
    }
  }

  const url = `${BASE_URL}${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

  let lastError;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug('Bybit API request', { endpoint, attempt, url });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Bybit returns retCode 0 for success
      if (data.retCode !== 0) {
        throw new Error(`Bybit API Error ${data.retCode}: ${data.retMsg}`);
      }

      // Cache successful response
      setCache(cacheKey, data.result, cacheTtl);

      logger.debug('Bybit API success', { endpoint, attempt });
      return data.result;

    } catch (error) {
      lastError = error;
      logger.warn('Bybit API attempt failed', {
        endpoint,
        attempt,
        error: error.message
      });

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  logger.error('Bybit API failed after all retries', {
    endpoint,
    error: lastError?.message
  });
  throw lastError;
}

// ============================================================
// BYBIT CLIENT CLASS
// ============================================================

class BybitClient {
  /**
   * Get market tickers
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse', 'spot' (default: 'linear')
   * @param {string} options.symbol - Symbol filter (optional)
   * @returns {Promise<Object>}
   */
  async getTickers({ category = 'linear', symbol } = {}) {
    const params = { category };
    if (symbol) params.symbol = symbol;

    const result = await makeRequest('/v5/market/tickers', params, CACHE_TTL.tickers);

    // Normalize response
    return {
      category: result.category,
      list: result.list.map(item => ({
        symbol: item.symbol,
        lastPrice: parseFloat(item.lastPrice),
        indexPrice: parseFloat(item.indexPrice) || null,
        markPrice: parseFloat(item.markPrice) || null,
        prevPrice24h: parseFloat(item.prevPrice24h),
        price24hPcnt: parseFloat(item.price24hPcnt) * 100, // Convert to percentage
        highPrice24h: parseFloat(item.highPrice24h),
        lowPrice24h: parseFloat(item.lowPrice24h),
        volume24h: parseFloat(item.volume24h),
        turnover24h: parseFloat(item.turnover24h),
        bid1Price: parseFloat(item.bid1Price),
        bid1Size: parseFloat(item.bid1Size),
        ask1Price: parseFloat(item.ask1Price),
        ask1Size: parseFloat(item.ask1Size),
        openInterest: parseFloat(item.openInterest) || null,
        openInterestValue: parseFloat(item.openInterestValue) || null,
        fundingRate: parseFloat(item.fundingRate) || null,
        nextFundingTime: item.nextFundingTime ? parseInt(item.nextFundingTime) : null,
        deliveryTime: item.deliveryTime ? parseInt(item.deliveryTime) : null
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get kline/candlestick data
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse', 'spot'
   * @param {string} options.symbol - Trading pair symbol
   * @param {string} options.interval - 1,3,5,15,30,60,120,240,360,720,D,M,W
   * @param {number} options.start - Start timestamp in ms
   * @param {number} options.end - End timestamp in ms
   * @param {number} options.limit - Max results (default: 200, max: 1000)
   * @returns {Promise<Object>}
   */
  async getKlineData({ category = 'linear', symbol, interval, start, end, limit = 200 } = {}) {
    if (!symbol || !interval) {
      throw new Error('symbol and interval are required');
    }

    const params = { category, symbol, interval, limit };
    if (start) params.start = start;
    if (end) params.end = end;

    const result = await makeRequest('/v5/market/kline', params, CACHE_TTL.kline);

    // Normalize response - Bybit returns [startTime, open, high, low, close, volume, turnover]
    return {
      symbol: result.symbol,
      category: result.category,
      list: result.list.map(item => ({
        timestamp: parseInt(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        turnover: parseFloat(item[6])
      })).reverse(), // Bybit returns newest first, reverse to chronological
      timestamp: Date.now()
    };
  }

  /**
   * Get orderbook depth
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse', 'spot'
   * @param {string} options.symbol - Trading pair symbol
   * @param {number} options.limit - Depth limit (1-500, default: 25)
   * @returns {Promise<Object>}
   */
  async getOrderbook({ category = 'linear', symbol, limit = 25 } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const result = await makeRequest('/v5/market/orderbook', { category, symbol, limit }, CACHE_TTL.orderbook);

    return {
      symbol: result.s,
      timestamp: parseInt(result.ts),
      updateId: parseInt(result.u),
      bids: result.b.map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size)
      })),
      asks: result.a.map(([price, size]) => ({
        price: parseFloat(price),
        size: parseFloat(size)
      })),
      // Calculate spread
      spread: result.a.length && result.b.length
        ? parseFloat(result.a[0][0]) - parseFloat(result.b[0][0])
        : null,
      spreadPercent: result.a.length && result.b.length
        ? ((parseFloat(result.a[0][0]) - parseFloat(result.b[0][0])) / parseFloat(result.a[0][0])) * 100
        : null
    };
  }

  /**
   * Get open interest history
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse'
   * @param {string} options.symbol - Trading pair symbol
   * @param {string} options.intervalTime - 5min, 15min, 30min, 1h, 4h, 1d
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @param {number} options.limit - Max results (default: 50, max: 200)
   * @returns {Promise<Object>}
   */
  async getOpenInterest({ category = 'linear', symbol, intervalTime = '1h', startTime, endTime, limit = 50 } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const params = { category, symbol, intervalTime, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/v5/market/open-interest', params, CACHE_TTL.openInterest);

    return {
      symbol: result.symbol,
      category: result.category,
      list: result.list.map(item => ({
        timestamp: parseInt(item.timestamp),
        openInterest: parseFloat(item.openInterest)
      })).reverse(), // Chronological order
      timestamp: Date.now()
    };
  }

  /**
   * Get long/short ratio (account ratio)
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse'
   * @param {string} options.symbol - Trading pair symbol
   * @param {string} options.period - 5min, 15min, 30min, 1h, 4h, 1d
   * @param {number} options.limit - Max results (default: 50, max: 500)
   * @returns {Promise<Object>}
   */
  async getLongShortRatio({ category = 'linear', symbol, period = '1h', limit = 50 } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const result = await makeRequest('/v5/market/account-ratio', {
      category,
      symbol,
      period,
      limit
    }, CACHE_TTL.longShortRatio);

    return {
      list: result.list.map(item => ({
        timestamp: parseInt(item.timestamp),
        buyRatio: parseFloat(item.buyRatio),
        sellRatio: parseFloat(item.sellRatio),
        longShortRatio: parseFloat(item.buyRatio) / parseFloat(item.sellRatio)
      })).reverse(), // Chronological order
      timestamp: Date.now()
    };
  }

  /**
   * Get index price kline
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse'
   * @param {string} options.symbol - Trading pair symbol
   * @param {string} options.interval - 1,3,5,15,30,60,120,240,360,720,D,M,W
   * @param {number} options.start - Start timestamp in ms
   * @param {number} options.end - End timestamp in ms
   * @param {number} options.limit - Max results (default: 200, max: 1000)
   * @returns {Promise<Object>}
   */
  async getIndexPriceKline({ category = 'linear', symbol, interval, start, end, limit = 200 } = {}) {
    if (!symbol || !interval) {
      throw new Error('symbol and interval are required');
    }

    const params = { category, symbol, interval, limit };
    if (start) params.start = start;
    if (end) params.end = end;

    const result = await makeRequest('/v5/market/index-price-kline', params, CACHE_TTL.kline);

    return {
      symbol: result.symbol,
      category: result.category,
      list: result.list.map(item => ({
        timestamp: parseInt(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4])
      })).reverse(),
      timestamp: Date.now()
    };
  }

  /**
   * Get funding rate history
   * @param {Object} options
   * @param {string} options.category - 'linear', 'inverse'
   * @param {string} options.symbol - Trading pair symbol
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @param {number} options.limit - Max results (default: 200, max: 200)
   * @returns {Promise<Object>}
   */
  async getFundingRateHistory({ category = 'linear', symbol, startTime, endTime, limit = 200 } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const params = { category, symbol, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/v5/market/funding/history', params, CACHE_TTL.fundingRate);

    return {
      category: result.category,
      list: result.list.map(item => ({
        symbol: item.symbol,
        timestamp: parseInt(item.fundingRateTimestamp),
        fundingRate: parseFloat(item.fundingRate),
        fundingRatePercent: parseFloat(item.fundingRate) * 100 // Convert to percentage
      })).reverse(), // Chronological order
      timestamp: Date.now()
    };
  }

  /**
   * Get current ticker for a single symbol (convenience method)
   * @param {string} symbol
   * @param {string} category
   * @returns {Promise<Object|null>}
   */
  async getTickerBySymbol(symbol, category = 'linear') {
    const result = await this.getTickers({ category, symbol });
    return result.list.length > 0 ? result.list[0] : null;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    cache.clear();
    logger.info('Bybit cache cleared');
  }
}

// Export singleton instance and class
const bybitClient = new BybitClient();

module.exports = {
  BybitClient,
  bybitClient,
  // Export cache utilities for testing
  clearCache: () => cache.clear(),
  getCacheSize: () => cache.size
};
