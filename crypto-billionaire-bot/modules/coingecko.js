/**
 * COINGECKO API CLIENT
 * =====================
 * Requires CoinGecko Demo API key
 * Implements retry logic and caching for reliability
 */

const logger = require('../utils/logger');

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_URL = 'https://api.coingecko.com/api/v3';

// Cache TTL in milliseconds
const CACHE_TTL = {
  topCoins: 60000,      // 1 minute - market data updates frequently
  coinTickers: 120000,  // 2 minutes
  global: 60000         // 1 minute
};

// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000; // CoinGecko has stricter rate limits

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
  return `coingecko:${endpoint}:${paramStr}`;
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
 * Get API key from environment
 * @returns {string}
 */
function getApiKey() {
  const apiKey = process.env.COINGECKO_API_KEY;
  if (!apiKey) {
    throw new Error('COINGECKO_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Make HTTP request with retry logic
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @param {number} cacheTtl - Cache TTL in ms
 * @returns {Promise<any>}
 */
async function makeRequest(endpoint, params = {}, cacheTtl = 60000) {
  const cacheKey = getCacheKey(endpoint, params);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('CoinGecko cache hit', { endpoint, cacheKey });
    return cached;
  }

  // Get API key
  const apiKey = getApiKey();

  // Build URL with query params (including API key)
  const queryParams = new URLSearchParams();
  queryParams.append('x_cg_demo_api_key', apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      queryParams.append(key, value);
    }
  }

  const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;

  let lastError;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug('CoinGecko API request', { endpoint, attempt });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        logger.warn('CoinGecko rate limited', { retryAfter });
        if (attempt < RETRY_ATTEMPTS) {
          await sleep(retryAfter * 1000);
          continue;
        }
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      // Check for error response
      if (data.error) {
        throw new Error(`CoinGecko API Error: ${data.error}`);
      }

      // Cache successful response
      setCache(cacheKey, data, cacheTtl);

      logger.debug('CoinGecko API success', { endpoint, attempt });
      return data;

    } catch (error) {
      lastError = error;
      logger.warn('CoinGecko API attempt failed', {
        endpoint,
        attempt,
        error: error.message
      });

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  logger.error('CoinGecko API failed after all retries', {
    endpoint,
    error: lastError?.message
  });
  throw lastError;
}

// ============================================================
// COINGECKO CLIENT CLASS
// ============================================================

class CoinGeckoClient {
  /**
   * Fetch top coins by market cap or volume
   * @param {Object} options
   * @param {string} options.vs_currency - Target currency (default: 'usd')
   * @param {number} options.per_page - Results per page (default: 200, max: 250)
   * @param {number} options.page - Page number (default: 1)
   * @param {string} options.order - Sort order: market_cap_desc, volume_desc, id_asc, etc.
   * @returns {Promise<Object>}
   */
  async fetchTopCoins({ vs_currency = 'usd', per_page = 200, page = 1, order = 'volume_desc' } = {}) {
    const result = await makeRequest('/coins/markets', {
      vs_currency,
      per_page,
      page,
      order,
      sparkline: false,
      price_change_percentage: '24h'
    }, CACHE_TTL.topCoins);

    // Normalize response
    const normalized = result.map(coin => ({
      id: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      price: parseFloat(coin.current_price) || 0,
      market_cap: parseFloat(coin.market_cap) || 0,
      market_cap_rank: coin.market_cap_rank,
      total_volume: parseFloat(coin.total_volume) || 0,
      price_change_percentage_24h: parseFloat(coin.price_change_percentage_24h) || 0,
      price_change_24h: parseFloat(coin.price_change_24h) || 0,
      high_24h: parseFloat(coin.high_24h) || 0,
      low_24h: parseFloat(coin.low_24h) || 0,
      circulating_supply: parseFloat(coin.circulating_supply) || 0,
      total_supply: parseFloat(coin.total_supply) || null,
      ath: parseFloat(coin.ath) || 0,
      ath_change_percentage: parseFloat(coin.ath_change_percentage) || 0,
      atl: parseFloat(coin.atl) || 0,
      last_updated: coin.last_updated
    }));

    return {
      coins: normalized,
      count: normalized.length,
      page,
      per_page,
      order,
      vs_currency,
      timestamp: Date.now()
    };
  }

  /**
   * Fetch coin tickers from multiple exchanges (optional method)
   * @param {string} coinId - CoinGecko coin ID (e.g., 'bitcoin')
   * @returns {Promise<Object>}
   */
  async fetchCoinTickers(coinId) {
    if (!coinId) {
      throw new Error('coinId is required');
    }

    const result = await makeRequest(`/coins/${coinId}/tickers`, {
      include_exchange_logo: false,
      depth: false
    }, CACHE_TTL.coinTickers);

    // Normalize tickers
    const normalized = result.tickers?.map(ticker => ({
      exchange: ticker.market?.name,
      exchangeId: ticker.market?.identifier,
      base: ticker.base,
      target: ticker.target,
      last: parseFloat(ticker.last) || 0,
      volume: parseFloat(ticker.volume) || 0,
      convertedVolume: parseFloat(ticker.converted_volume?.usd) || 0,
      bidAskSpreadPercentage: parseFloat(ticker.bid_ask_spread_percentage) || 0,
      timestamp: ticker.timestamp,
      isAnomaly: ticker.is_anomaly,
      isStale: ticker.is_stale,
      tradeUrl: ticker.trade_url
    })) || [];

    return {
      coinId,
      name: result.name,
      tickers: normalized,
      count: normalized.length,
      timestamp: Date.now()
    };
  }

  /**
   * Fetch global crypto market data
   * @returns {Promise<Object>}
   */
  async fetchGlobalData() {
    const result = await makeRequest('/global', {}, CACHE_TTL.global);

    const data = result.data;
    return {
      totalMarketCap: parseFloat(data.total_market_cap?.usd) || 0,
      totalVolume: parseFloat(data.total_volume?.usd) || 0,
      btcDominance: parseFloat(data.market_cap_percentage?.btc) || 0,
      ethDominance: parseFloat(data.market_cap_percentage?.eth) || 0,
      activeCryptocurrencies: data.active_cryptocurrencies,
      markets: data.markets,
      marketCapChangePercentage24h: parseFloat(data.market_cap_change_percentage_24h_usd) || 0,
      updatedAt: data.updated_at,
      timestamp: Date.now()
    };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    cache.clear();
    logger.info('CoinGecko cache cleared');
  }
}

// Export singleton instance and class
const coinGeckoClient = new CoinGeckoClient();

module.exports = {
  CoinGeckoClient,
  coinGeckoClient,
  // Export cache utilities for testing
  clearCache: () => cache.clear(),
  getCacheSize: () => cache.size
};
