/**
 * BINANCE USD-M FUTURES API CLIENT
 * =================================
 * Public market data endpoints only (no authentication required)
 * Implements retry logic and caching for reliability
 */

const logger = require('../utils/logger');

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_URL = process.env.BINANCE_FUTURES_BASE_URL || 'https://fapi.binance.com';

// Cache TTL in milliseconds per endpoint type
const CACHE_TTL = {
  ticker24h: 5000,       // 5 seconds - real-time data
  klines: 60000,         // 1 minute - historical data
  depth: 3000,           // 3 seconds - very dynamic
  openInterest: 30000,   // 30 seconds
  longShortRatio: 60000, // 1 minute
  takerBuySell: 60000    // 1 minute
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
  return `binance:${endpoint}:${paramStr}`;
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
 * @returns {Promise<any>}
 */
async function makeRequest(endpoint, params = {}, cacheTtl = 30000) {
  const cacheKey = getCacheKey(endpoint, params);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('Binance cache hit', { endpoint, cacheKey });
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
      logger.debug('Binance API request', { endpoint, attempt, url });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        logger.warn('Binance rate limited', { retryAfter });
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      // Check for Binance error response
      if (data.code && data.code !== 0) {
        throw new Error(`Binance API Error ${data.code}: ${data.msg}`);
      }

      // Cache successful response
      setCache(cacheKey, data, cacheTtl);

      logger.debug('Binance API success', { endpoint, attempt });
      return data;

    } catch (error) {
      lastError = error;
      logger.warn('Binance API attempt failed', {
        endpoint,
        attempt,
        error: error.message
      });

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  logger.error('Binance API failed after all retries', {
    endpoint,
    error: lastError?.message
  });
  throw lastError;
}

// ============================================================
// BINANCE FUTURES CLIENT CLASS
// ============================================================

class BinanceFuturesClient {
  /**
   * Get 24hr ticker price change statistics
   * @param {Object} options
   * @param {string} options.symbol - Symbol filter (optional, returns all if not provided)
   * @returns {Promise<Object|Array>}
   */
  async get24hTicker({ symbol } = {}) {
    const params = {};
    if (symbol) params.symbol = symbol;

    const result = await makeRequest('/fapi/v1/ticker/24hr', params, CACHE_TTL.ticker24h);

    // Normalize single result or array
    const normalize = (item) => ({
      symbol: item.symbol,
      priceChange: parseFloat(item.priceChange),
      priceChangePercent: parseFloat(item.priceChangePercent),
      weightedAvgPrice: parseFloat(item.weightedAvgPrice),
      lastPrice: parseFloat(item.lastPrice),
      lastQty: parseFloat(item.lastQty),
      openPrice: parseFloat(item.openPrice),
      highPrice: parseFloat(item.highPrice),
      lowPrice: parseFloat(item.lowPrice),
      volume: parseFloat(item.volume),
      quoteVolume: parseFloat(item.quoteVolume),
      openTime: parseInt(item.openTime),
      closeTime: parseInt(item.closeTime),
      firstId: parseInt(item.firstId),
      lastId: parseInt(item.lastId),
      count: parseInt(item.count)
    });

    if (Array.isArray(result)) {
      return {
        list: result.map(normalize),
        timestamp: Date.now()
      };
    }

    return {
      ...normalize(result),
      timestamp: Date.now()
    };
  }

  /**
   * Get kline/candlestick data
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @param {string} options.interval - 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @param {number} options.limit - Max results (default: 500, max: 1500)
   * @returns {Promise<Object>}
   */
  async getKlines({ symbol, interval, startTime, endTime, limit = 500 } = {}) {
    if (!symbol || !interval) {
      throw new Error('symbol and interval are required');
    }

    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/fapi/v1/klines', params, CACHE_TTL.klines);

    // Binance returns [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBaseVol, takerBuyQuoteVol, ignore]
    return {
      symbol,
      interval,
      list: result.map(item => ({
        timestamp: parseInt(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        closeTime: parseInt(item[6]),
        quoteVolume: parseFloat(item[7]),
        trades: parseInt(item[8]),
        takerBuyBaseVolume: parseFloat(item[9]),
        takerBuyQuoteVolume: parseFloat(item[10])
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get orderbook depth
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @param {number} options.limit - Depth limit (5, 10, 20, 50, 100, 500, 1000)
   * @returns {Promise<Object>}
   */
  async getDepth({ symbol, limit = 20 } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const result = await makeRequest('/fapi/v1/depth', { symbol, limit }, CACHE_TTL.depth);

    return {
      symbol,
      lastUpdateId: result.lastUpdateId,
      messageTime: result.E,
      transactionTime: result.T,
      bids: result.bids.map(([price, qty]) => ({
        price: parseFloat(price),
        quantity: parseFloat(qty)
      })),
      asks: result.asks.map(([price, qty]) => ({
        price: parseFloat(price),
        quantity: parseFloat(qty)
      })),
      // Calculate spread
      spread: result.asks.length && result.bids.length
        ? parseFloat(result.asks[0][0]) - parseFloat(result.bids[0][0])
        : null,
      spreadPercent: result.asks.length && result.bids.length
        ? ((parseFloat(result.asks[0][0]) - parseFloat(result.bids[0][0])) / parseFloat(result.asks[0][0])) * 100
        : null,
      timestamp: Date.now()
    };
  }

  /**
   * Get current open interest
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @returns {Promise<Object>}
   */
  async getOpenInterest({ symbol } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const result = await makeRequest('/fapi/v1/openInterest', { symbol }, CACHE_TTL.openInterest);

    return {
      symbol: result.symbol,
      openInterest: parseFloat(result.openInterest),
      time: parseInt(result.time),
      timestamp: Date.now()
    };
  }

  /**
   * Get global long/short account ratio
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @param {string} options.period - 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d
   * @param {number} options.limit - Max results (default: 30, max: 500)
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @returns {Promise<Object>}
   */
  async getGlobalLongShortRatio({ symbol, period = '1h', limit = 30, startTime, endTime } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const params = { symbol, period, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/futures/data/globalLongShortAccountRatio', params, CACHE_TTL.longShortRatio);

    return {
      symbol,
      period,
      list: result.map(item => ({
        timestamp: parseInt(item.timestamp),
        longAccount: parseFloat(item.longAccount),
        shortAccount: parseFloat(item.shortAccount),
        longShortRatio: parseFloat(item.longShortRatio)
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get taker buy/sell volume ratio
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @param {string} options.period - 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d
   * @param {number} options.limit - Max results (default: 30, max: 500)
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @returns {Promise<Object>}
   */
  async getTakerBuySellVol({ symbol, period = '1h', limit = 30, startTime, endTime } = {}) {
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const params = { symbol, period, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/futures/data/takerlongshortRatio', params, CACHE_TTL.takerBuySell);

    return {
      symbol,
      period,
      list: result.map(item => ({
        timestamp: parseInt(item.timestamp),
        buySellRatio: parseFloat(item.buySellRatio),
        buyVol: parseFloat(item.buyVol),
        sellVol: parseFloat(item.sellVol)
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get mark price klines
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required)
   * @param {string} options.interval - 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @param {number} options.limit - Max results (default: 500, max: 1500)
   * @returns {Promise<Object>}
   */
  async getMarkPriceKlines({ symbol, interval, startTime, endTime, limit = 500 } = {}) {
    if (!symbol || !interval) {
      throw new Error('symbol and interval are required');
    }

    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/fapi/v1/markPriceKlines', params, CACHE_TTL.klines);

    return {
      symbol,
      interval,
      list: result.map(item => ({
        timestamp: parseInt(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        // Mark price klines don't have volume
        closeTime: parseInt(item[6])
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get index price klines
   * @param {Object} options
   * @param {string} options.symbol - Trading pair symbol (required, e.g., BTCUSDT)
   * @param {string} options.interval - 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
   * @param {number} options.startTime - Start timestamp in ms
   * @param {number} options.endTime - End timestamp in ms
   * @param {number} options.limit - Max results (default: 500, max: 1500)
   * @returns {Promise<Object>}
   */
  async getIndexPriceKlines({ symbol, interval, startTime, endTime, limit = 500 } = {}) {
    if (!symbol || !interval) {
      throw new Error('symbol and interval are required');
    }

    const params = { pair: symbol.replace('USDT', ''), interval, limit }; // Binance uses pair without quote
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const result = await makeRequest('/fapi/v1/indexPriceKlines', params, CACHE_TTL.klines);

    return {
      symbol,
      interval,
      list: result.map(item => ({
        timestamp: parseInt(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        closeTime: parseInt(item[6])
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Get premium index (mark price, index price, funding rate)
   * @param {Object} options
   * @param {string} options.symbol - Symbol filter (optional)
   * @returns {Promise<Object>}
   */
  async getPremiumIndex({ symbol } = {}) {
    const params = {};
    if (symbol) params.symbol = symbol;

    const result = await makeRequest('/fapi/v1/premiumIndex', params, CACHE_TTL.ticker24h);

    const normalize = (item) => ({
      symbol: item.symbol,
      markPrice: parseFloat(item.markPrice),
      indexPrice: parseFloat(item.indexPrice),
      estimatedSettlePrice: parseFloat(item.estimatedSettlePrice),
      lastFundingRate: parseFloat(item.lastFundingRate),
      lastFundingRatePercent: parseFloat(item.lastFundingRate) * 100,
      nextFundingTime: parseInt(item.nextFundingTime),
      interestRate: parseFloat(item.interestRate),
      time: parseInt(item.time)
    });

    if (Array.isArray(result)) {
      return {
        list: result.map(normalize),
        timestamp: Date.now()
      };
    }

    return {
      ...normalize(result),
      timestamp: Date.now()
    };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    cache.clear();
    logger.info('Binance cache cleared');
  }
}

// Export singleton instance and class
const binanceFuturesClient = new BinanceFuturesClient();

module.exports = {
  BinanceFuturesClient,
  binanceFuturesClient,
  // Export cache utilities for testing
  clearCache: () => cache.clear(),
  getCacheSize: () => cache.size
};
