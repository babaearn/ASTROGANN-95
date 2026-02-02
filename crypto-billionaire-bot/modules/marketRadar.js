/**
 * MARKET RADAR MODULE
 * ====================
 * Builds whole-market radar snapshot from CoinGecko data
 * Analyzes breadth, leaders, and calculates regime score
 */

const logger = require('../utils/logger');
const { coinGeckoClient } = require('./coingecko');

// ============================================================
// CONFIGURATION
// ============================================================

// Minimum volume threshold for liquidity filtering (USD)
const MIN_VOLUME_THRESHOLD = 10000000; // $10M

// Top movers count
const TOP_MOVERS_COUNT = 20;

// Regime score weights
const REGIME_WEIGHTS = {
  breadth: 0.35,           // Advancers/Decliners ratio
  dispersion: 0.25,        // How spread out returns are
  volumeConcentration: 0.20, // Top 10 % of total volume
  momentum: 0.20           // Average return strength
};

// ============================================================
// STATISTICAL HELPERS
// ============================================================

/**
 * Calculate median of an array
 * @param {number[]} arr
 * @returns {number}
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate standard deviation
 * @param {number[]} arr
 * @returns {number}
 */
function standardDeviation(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate percentile
 * @param {number[]} arr
 * @param {number} p - Percentile (0-100)
 * @returns {number}
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// ============================================================
// MARKET RADAR CLASS
// ============================================================

class MarketRadar {
  /**
   * Generate a complete market radar snapshot
   * @param {Object} options
   * @param {number} options.topCoinsCount - Number of top coins to analyze (default: 200)
   * @returns {Promise<Object>}
   */
  async generateSnapshot({ topCoinsCount = 200 } = {}) {
    const startTime = Date.now();
    logger.info('Generating market radar snapshot', { topCoinsCount });

    try {
      // Fetch top coins data
      const marketData = await coinGeckoClient.fetchTopCoins({
        per_page: topCoinsCount,
        order: 'market_cap_desc'
      });

      // Fetch global data
      let globalData;
      try {
        globalData = await coinGeckoClient.fetchGlobalData();
      } catch (error) {
        logger.warn('Failed to fetch global data, continuing without it', { error: error.message });
        globalData = null;
      }

      // Filter for liquid coins
      const liquidCoins = marketData.coins.filter(
        coin => coin.total_volume >= MIN_VOLUME_THRESHOLD
      );

      logger.debug('Liquid coins filtered', {
        total: marketData.coins.length,
        liquid: liquidCoins.length
      });

      // Calculate breadth metrics
      const breadth = this.calculateBreadth(liquidCoins);

      // Calculate leaders (top movers)
      const leaders = this.calculateLeaders(liquidCoins);

      // Calculate regime score
      const regimeScore = this.calculateRegimeScore(breadth, leaders, liquidCoins);

      // Build snapshot
      const snapshot = {
        timestamp: Date.now(),
        timestampIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        meta: {
          coinsAnalyzed: marketData.coins.length,
          liquidCoins: liquidCoins.length,
          minVolumeThreshold: MIN_VOLUME_THRESHOLD,
          generationTimeMs: Date.now() - startTime
        },
        global: globalData ? {
          totalMarketCap: globalData.totalMarketCap,
          totalVolume: globalData.totalVolume,
          btcDominance: globalData.btcDominance,
          ethDominance: globalData.ethDominance,
          marketCapChange24h: globalData.marketCapChangePercentage24h
        } : null,
        breadth,
        leaders,
        regimeScore,
        regimeLabel: this.getRegimeLabel(regimeScore),
        summary: this.generateSummary(breadth, leaders, regimeScore)
      };

      logger.info('Market radar snapshot generated', {
        regimeScore,
        regimeLabel: snapshot.regimeLabel,
        advancers: breadth.advancers,
        decliners: breadth.decliners,
        generationTimeMs: snapshot.meta.generationTimeMs
      });

      return snapshot;

    } catch (error) {
      logger.error('Failed to generate market radar snapshot', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate market breadth metrics
   * @param {Array} coins - Liquid coins data
   * @returns {Object}
   */
  calculateBreadth(coins) {
    const returns = coins.map(c => c.price_change_percentage_24h).filter(r => !isNaN(r));

    const advancers = returns.filter(r => r > 0).length;
    const decliners = returns.filter(r => r < 0).length;
    const unchanged = returns.filter(r => r === 0).length;

    const advancersDeclinerRatio = decliners > 0 ? advancers / decliners : advancers;
    const medianReturn = median(returns);
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const dispersion = standardDeviation(returns);

    // Calculate percentiles
    const p10 = percentile(returns, 10);
    const p25 = percentile(returns, 25);
    const p75 = percentile(returns, 75);
    const p90 = percentile(returns, 90);

    return {
      advancers,
      decliners,
      unchanged,
      total: coins.length,
      advancersDeclinerRatio: Math.round(advancersDeclinerRatio * 100) / 100,
      advancersPercent: Math.round((advancers / coins.length) * 10000) / 100,
      declinersPercent: Math.round((decliners / coins.length) * 10000) / 100,
      medianReturn: Math.round(medianReturn * 100) / 100,
      meanReturn: Math.round(meanReturn * 100) / 100,
      dispersion: Math.round(dispersion * 100) / 100,
      percentiles: {
        p10: Math.round(p10 * 100) / 100,
        p25: Math.round(p25 * 100) / 100,
        p75: Math.round(p75 * 100) / 100,
        p90: Math.round(p90 * 100) / 100
      }
    };
  }

  /**
   * Calculate market leaders (top movers)
   * @param {Array} coins - Liquid coins data
   * @returns {Object}
   */
  calculateLeaders(coins) {
    // Sort by 24h return (both directions)
    const sortedByReturn = [...coins].sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h
    );

    // Top gainers
    const topGainers = sortedByReturn
      .filter(c => c.price_change_percentage_24h > 0)
      .slice(0, TOP_MOVERS_COUNT)
      .map(c => ({
        symbol: c.symbol,
        name: c.name,
        price: c.price,
        change24h: Math.round(c.price_change_percentage_24h * 100) / 100,
        volume: c.total_volume,
        marketCap: c.market_cap
      }));

    // Top losers
    const topLosers = sortedByReturn
      .filter(c => c.price_change_percentage_24h < 0)
      .slice(-TOP_MOVERS_COUNT)
      .reverse()
      .map(c => ({
        symbol: c.symbol,
        name: c.name,
        price: c.price,
        change24h: Math.round(c.price_change_percentage_24h * 100) / 100,
        volume: c.total_volume,
        marketCap: c.market_cap
      }));

    // Sort by volume
    const sortedByVolume = [...coins].sort(
      (a, b) => b.total_volume - a.total_volume
    );

    // Top by volume
    const topByVolume = sortedByVolume
      .slice(0, TOP_MOVERS_COUNT)
      .map(c => ({
        symbol: c.symbol,
        name: c.name,
        price: c.price,
        change24h: Math.round(c.price_change_percentage_24h * 100) / 100,
        volume: c.total_volume,
        marketCap: c.market_cap
      }));

    // Volume concentration (top 10 coins as % of total)
    const totalVolume = coins.reduce((sum, c) => sum + c.total_volume, 0);
    const top10Volume = sortedByVolume.slice(0, 10).reduce((sum, c) => sum + c.total_volume, 0);
    const volumeConcentration = totalVolume > 0 ? (top10Volume / totalVolume) * 100 : 0;

    return {
      topGainers,
      topLosers,
      topByVolume,
      volumeConcentration: Math.round(volumeConcentration * 100) / 100,
      totalVolume,
      averageGainerReturn: topGainers.length > 0
        ? Math.round((topGainers.reduce((sum, c) => sum + c.change24h, 0) / topGainers.length) * 100) / 100
        : 0,
      averageLoserReturn: topLosers.length > 0
        ? Math.round((topLosers.reduce((sum, c) => sum + c.change24h, 0) / topLosers.length) * 100) / 100
        : 0
    };
  }

  /**
   * Calculate regime score (0-100)
   * @param {Object} breadth - Breadth metrics
   * @param {Object} leaders - Leaders metrics
   * @param {Array} coins - Liquid coins data
   * @returns {number}
   */
  calculateRegimeScore(breadth, leaders, coins) {
    // Breadth score (0-100): Based on A/D ratio and advancers %
    // Ratio of 2.0 = 66, ratio of 0.5 = 33, etc.
    const adRatioScore = Math.min(100, Math.max(0,
      (breadth.advancersDeclinerRatio / 2) * 50 + 25
    ));
    const advancersScore = breadth.advancersPercent;
    const breadthScore = (adRatioScore + advancersScore) / 2;

    // Dispersion score (0-100): Lower dispersion = more orderly market
    // High dispersion (>10%) = chaotic, low dispersion (<3%) = orderly
    const dispersionScore = Math.min(100, Math.max(0,
      100 - (breadth.dispersion * 5) // 20% dispersion = 0 score
    ));

    // Volume concentration score (0-100)
    // High concentration = more institutional/orderly
    const volumeScore = Math.min(100, leaders.volumeConcentration);

    // Momentum score (0-100): Based on median return
    // +5% median = 100, 0% = 50, -5% = 0
    const momentumScore = Math.min(100, Math.max(0,
      (breadth.medianReturn + 5) * 10
    ));

    // Weighted combination
    const regimeScore =
      breadthScore * REGIME_WEIGHTS.breadth +
      dispersionScore * REGIME_WEIGHTS.dispersion +
      volumeScore * REGIME_WEIGHTS.volumeConcentration +
      momentumScore * REGIME_WEIGHTS.momentum;

    return Math.round(regimeScore);
  }

  /**
   * Get regime label from score
   * @param {number} score
   * @returns {string}
   */
  getRegimeLabel(score) {
    if (score >= 75) return 'STRONG_BULL';
    if (score >= 60) return 'BULL';
    if (score >= 45) return 'NEUTRAL';
    if (score >= 30) return 'BEAR';
    return 'STRONG_BEAR';
  }

  /**
   * Generate human-readable summary
   * @param {Object} breadth
   * @param {Object} leaders
   * @param {number} regimeScore
   * @returns {string}
   */
  generateSummary(breadth, leaders, regimeScore) {
    const regime = this.getRegimeLabel(regimeScore);

    const regimeText = {
      'STRONG_BULL': 'strongly bullish',
      'BULL': 'bullish',
      'NEUTRAL': 'neutral',
      'BEAR': 'bearish',
      'STRONG_BEAR': 'strongly bearish'
    }[regime];

    const breadthText = breadth.advancersDeclinerRatio > 1.5
      ? 'broad participation with strong breadth'
      : breadth.advancersDeclinerRatio < 0.67
        ? 'weak breadth with more decliners'
        : 'mixed breadth';

    const volumeText = leaders.volumeConcentration > 60
      ? 'Volume concentrated in top coins'
      : 'Volume well distributed';

    const topGainer = leaders.topGainers[0];
    const topLoser = leaders.topLosers[0];

    let moversText = '';
    if (topGainer) {
      moversText += `Top gainer: ${topGainer.symbol} (+${topGainer.change24h}%)`;
    }
    if (topLoser) {
      moversText += moversText ? `. Top loser: ${topLoser.symbol} (${topLoser.change24h}%)` : '';
    }

    return `Market regime is ${regimeText} (score: ${regimeScore}/100). ` +
      `${breadth.advancers} advancers vs ${breadth.decliners} decliners (${breadthText}). ` +
      `Median return: ${breadth.medianReturn}%. ${volumeText}. ${moversText}`;
  }
}

// Create singleton instance
const marketRadar = new MarketRadar();

module.exports = {
  MarketRadar,
  marketRadar,
  // Export helpers for testing
  median,
  standardDeviation,
  percentile
};
