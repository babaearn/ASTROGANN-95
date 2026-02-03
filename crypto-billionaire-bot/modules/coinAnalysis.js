/**
 * COMPREHENSIVE COIN ANALYSIS MODULE
 * ====================================
 * Billionaire-level A-Z analysis for any coin
 * Combines: Gann, Planetary, Historical Levels, Reversal Zones
 */

const logger = require('../utils/logger');
const { bybitClient } = require('./bybit');
const gann = require('./gann');
const planetary = require('./planetary');

// ============================================================
// SYMBOL MAPPING - Convert common names to Bybit symbols
// ============================================================

const SYMBOL_MAP = {
  // Major coins
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'XRP': 'XRPUSDT',
  'SOL': 'SOLUSDT',
  'BNB': 'BNBUSDT',
  'ADA': 'ADAUSDT',
  'DOGE': 'DOGEUSDT',
  'AVAX': 'AVAXUSDT',
  'DOT': 'DOTUSDT',
  'LINK': 'LINKUSDT',
  'MATIC': 'MATICUSDT',
  'UNI': 'UNIUSDT',
  'ATOM': 'ATOMUSDT',
  'LTC': 'LTCUSDT',
  'ETC': 'ETCUSDT',
  'XLM': 'XLMUSDT',
  'NEAR': 'NEARUSDT',
  'APT': 'APTUSDT',
  'ARB': 'ARBUSDT',
  'OP': 'OPUSDT',
  'SUI': 'SUIUSDT',
  'PEPE': 'PEPEUSDT',
  'SHIB': 'SHIBUSDT',
  'FIL': 'FILUSDT',
  'INJ': 'INJUSDT',
  'RENDER': 'RENDERUSDT',
  'TIA': 'TIAUSDT',
  'SEI': 'SEIUSDT',
  'JUP': 'JUPUSDT',
  'WIF': 'WIFUSDT',
  'BONK': 'BONKUSDT'
};

/**
 * Normalize symbol input to Bybit format
 */
function normalizeSymbol(input) {
  const upper = input.toUpperCase().trim();

  // If already has USDT suffix
  if (upper.endsWith('USDT')) {
    return upper;
  }

  // Check symbol map
  if (SYMBOL_MAP[upper]) {
    return SYMBOL_MAP[upper];
  }

  // Default: append USDT
  return upper + 'USDT';
}

/**
 * Get display name from symbol
 */
function getDisplayName(symbol) {
  return symbol.replace('USDT', '');
}

// ============================================================
// HISTORICAL LEVEL ANALYSIS
// ============================================================

/**
 * Find swing highs and lows from kline data
 * @param {Array} klines - Array of OHLCV data
 * @param {number} lookback - Bars to look back/forward for swing detection
 */
function findSwingPoints(klines, lookback = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = lookback; i < klines.length - lookback; i++) {
    const current = klines[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    // Check if this is a swing high/low
    for (let j = 1; j <= lookback; j++) {
      if (klines[i - j].high >= current.high || klines[i + j].high >= current.high) {
        isSwingHigh = false;
      }
      if (klines[i - j].low <= current.low || klines[i + j].low <= current.low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swingHighs.push({
        price: current.high,
        timestamp: current.timestamp,
        index: i
      });
    }

    if (isSwingLow) {
      swingLows.push({
        price: current.low,
        timestamp: current.timestamp,
        index: i
      });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Calculate key levels from historical data
 * @param {Array} klines - Kline data
 * @param {number} currentPrice - Current price
 */
function calculateHistoricalLevels(klines, currentPrice) {
  if (!klines || klines.length < 20) {
    return { supports: [], resistances: [], keyZones: [] };
  }

  // Find swing points
  const { swingHighs, swingLows } = findSwingPoints(klines, 3);

  // Get recent swing points (last 50 candles worth)
  const recentHighs = swingHighs.slice(-15);
  const recentLows = swingLows.slice(-15);

  // Calculate support levels (below current price)
  const supports = recentLows
    .filter(s => s.price < currentPrice)
    .map(s => ({
      price: s.price,
      distance: ((currentPrice - s.price) / currentPrice) * 100,
      type: 'swing_low',
      strength: 1
    }))
    .sort((a, b) => b.price - a.price); // Closest first

  // Calculate resistance levels (above current price)
  const resistances = recentHighs
    .filter(r => r.price > currentPrice)
    .map(r => ({
      price: r.price,
      distance: ((r.price - currentPrice) / currentPrice) * 100,
      type: 'swing_high',
      strength: 1
    }))
    .sort((a, b) => a.price - b.price); // Closest first

  // Find clusters (multiple touches = stronger level)
  const allLevels = [...swingHighs.map(h => h.price), ...swingLows.map(l => l.price)];
  const clusters = findPriceClusters(allLevels, currentPrice * 0.005); // 0.5% tolerance

  // Key zones are clusters with multiple touches
  const keyZones = clusters
    .filter(c => c.touches >= 2)
    .map(c => ({
      price: c.avgPrice,
      touches: c.touches,
      type: c.avgPrice > currentPrice ? 'resistance_zone' : 'support_zone',
      strength: Math.min(c.touches, 5) // Cap at 5 for display
    }))
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));

  return { supports, resistances, keyZones };
}

/**
 * Find price clusters (levels with multiple touches)
 */
function findPriceClusters(prices, tolerance) {
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < prices.length; i++) {
    if (used.has(i)) continue;

    const cluster = [prices[i]];
    used.add(i);

    for (let j = i + 1; j < prices.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(prices[j] - prices[i]) <= tolerance) {
        cluster.push(prices[j]);
        used.add(j);
      }
    }

    if (cluster.length > 0) {
      clusters.push({
        avgPrice: cluster.reduce((a, b) => a + b, 0) / cluster.length,
        touches: cluster.length,
        prices: cluster
      });
    }
  }

  return clusters;
}

// ============================================================
// REVERSAL ZONE DETECTION
// ============================================================

/**
 * Calculate potential reversal zones with multi-factor confluence
 */
function calculateReversalZones(currentPrice, gannAnalysis, historicalLevels) {
  const zones = [];
  const tolerance = currentPrice * 0.003; // 0.3% tolerance for confluence

  // Get all Gann levels
  const gannLevels = [
    ...gannAnalysis.sq9.supportLevels.slice(0, 5),
    ...gannAnalysis.sq9.resistanceLevels.slice(0, 5),
    ...gannAnalysis.targets.keyLevels.slice(0, 10)
  ];

  // Get historical levels
  const histLevels = [
    ...historicalLevels.supports.slice(0, 5).map(s => s.price),
    ...historicalLevels.resistances.slice(0, 5).map(r => r.price),
    ...historicalLevels.keyZones.slice(0, 5).map(z => z.price)
  ];

  // Find zones where multiple methods converge
  const allLevels = [...new Set([...gannLevels, ...histLevels])];

  for (const level of allLevels) {
    const factors = [];

    // Check Gann Sq9 confluence
    if (gannAnalysis.sq9.supportLevels.some(s => Math.abs(s - level) <= tolerance)) {
      factors.push('Gann Sq9 Support');
    }
    if (gannAnalysis.sq9.resistanceLevels.some(r => Math.abs(r - level) <= tolerance)) {
      factors.push('Gann Sq9 Resistance');
    }

    // Check Gann targets
    if (gannAnalysis.targets.keyLevels.some(k => Math.abs(k - level) <= tolerance)) {
      factors.push('Gann Target');
    }

    // Check historical levels
    if (historicalLevels.supports.some(s => Math.abs(s.price - level) <= tolerance)) {
      factors.push('Historical Support');
    }
    if (historicalLevels.resistances.some(r => Math.abs(r.price - level) <= tolerance)) {
      factors.push('Historical Resistance');
    }
    if (historicalLevels.keyZones.some(z => Math.abs(z.price - level) <= tolerance)) {
      factors.push('Key Zone');
    }

    // Only include if multiple factors agree
    if (factors.length >= 2) {
      const distancePercent = ((level - currentPrice) / currentPrice) * 100;
      zones.push({
        price: level,
        factors,
        confluenceScore: factors.length,
        type: level > currentPrice ? 'resistance' : 'support',
        distancePercent,
        isNearby: Math.abs(distancePercent) < 2 // Within 2%
      });
    }
  }

  // Sort by proximity to current price
  zones.sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent));

  return zones;
}

// ============================================================
// PLANETARY BIAS CALCULATION
// ============================================================

/**
 * Calculate planetary bias for trading
 */
function calculatePlanetaryBias(planetaryData) {
  let bullishFactors = 0;
  let bearishFactors = 0;
  const signals = [];

  // Moon phase analysis
  const moon = planetaryData.moon;
  if (moon) {
    if (moon.phase === 'New Moon' || moon.phase === 'Waxing Crescent' || moon.phase === 'First Quarter') {
      bullishFactors++;
      signals.push({ factor: `Moon ${moon.phase}`, bias: 'bullish', note: 'Growth phase' });
    } else if (moon.phase === 'Full Moon' || moon.phase === 'Waning Gibbous' || moon.phase === 'Last Quarter') {
      bearishFactors++;
      signals.push({ factor: `Moon ${moon.phase}`, bias: 'bearish', note: 'Distribution phase' });
    }
  }

  // Aspect analysis
  const aspects = planetaryData.aspects?.aspects || [];

  for (const aspect of aspects.slice(0, 10)) {
    // Jupiter aspects = expansion (bullish)
    if (aspect.planet1 === 'Jupiter' || aspect.planet2 === 'Jupiter') {
      if (['conjunction', 'trine', 'sextile'].includes(aspect.aspect)) {
        bullishFactors++;
        signals.push({
          factor: `Jupiter ${aspect.aspect}`,
          bias: 'bullish',
          note: 'Expansion energy'
        });
      }
    }

    // Saturn aspects = restriction (bearish)
    if (aspect.planet1 === 'Saturn' || aspect.planet2 === 'Saturn') {
      if (['conjunction', 'square', 'opposition'].includes(aspect.aspect)) {
        bearishFactors++;
        signals.push({
          factor: `Saturn ${aspect.aspect}`,
          bias: 'bearish',
          note: 'Restriction energy'
        });
      }
    }

    // Mars aspects = volatility
    if (aspect.planet1 === 'Mars' || aspect.planet2 === 'Mars') {
      if (['square', 'opposition'].includes(aspect.aspect)) {
        bearishFactors++;
        signals.push({
          factor: `Mars ${aspect.aspect}`,
          bias: 'volatile',
          note: 'Conflict energy'
        });
      } else if (['trine', 'sextile'].includes(aspect.aspect)) {
        bullishFactors++;
        signals.push({
          factor: `Mars ${aspect.aspect}`,
          bias: 'bullish',
          note: 'Constructive action'
        });
      }
    }

    // Venus aspects = value/money
    if (aspect.planet1 === 'Venus' || aspect.planet2 === 'Venus') {
      if (['conjunction', 'trine', 'sextile'].includes(aspect.aspect)) {
        bullishFactors++;
        signals.push({
          factor: `Venus ${aspect.aspect}`,
          bias: 'bullish',
          note: 'Value appreciation'
        });
      }
    }
  }

  // Check for major events
  const majorEvents = planetaryData.majorEvents?.events || [];
  for (const event of majorEvents.slice(0, 3)) {
    if (event.type === 'retrograde_start') {
      bearishFactors++;
      signals.push({
        factor: `${event.planet} Retrograde`,
        bias: 'bearish',
        note: 'Review period'
      });
    }
  }

  // Calculate overall bias
  const totalFactors = bullishFactors + bearishFactors;
  let bias = 'neutral';
  let biasStrength = 0;

  if (totalFactors > 0) {
    biasStrength = Math.abs(bullishFactors - bearishFactors) / totalFactors;
    if (bullishFactors > bearishFactors && biasStrength > 0.2) {
      bias = 'bullish';
    } else if (bearishFactors > bullishFactors && biasStrength > 0.2) {
      bias = 'bearish';
    }
  }

  return {
    bias,
    biasStrength: Math.round(biasStrength * 100),
    bullishFactors,
    bearishFactors,
    signals: signals.slice(0, 6) // Limit to 6 most relevant
  };
}

// ============================================================
// TREND ANALYSIS FROM KLINES
// ============================================================

/**
 * Analyze trend from multiple timeframes
 */
function analyzeTrend(klines) {
  if (!klines || klines.length < 20) {
    return { trend: 'unknown', strength: 0 };
  }

  // Calculate EMAs
  const closes = klines.map(k => k.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, Math.min(50, closes.length - 1));

  const currentPrice = closes[closes.length - 1];
  const currentEma9 = ema9[ema9.length - 1];
  const currentEma21 = ema21[ema21.length - 1];
  const currentEma50 = ema50[ema50.length - 1];

  // Trend scoring
  let trendScore = 0;

  // Price vs EMAs
  if (currentPrice > currentEma9) trendScore++;
  if (currentPrice > currentEma21) trendScore++;
  if (currentPrice > currentEma50) trendScore++;

  // EMA alignment
  if (currentEma9 > currentEma21) trendScore++;
  if (currentEma21 > currentEma50) trendScore++;

  // Determine trend
  let trend = 'neutral';
  let strength = 0;

  if (trendScore >= 4) {
    trend = 'bullish';
    strength = trendScore === 5 ? 100 : 75;
  } else if (trendScore <= 1) {
    trend = 'bearish';
    strength = trendScore === 0 ? 100 : 75;
  } else {
    trend = 'neutral';
    strength = 50;
  }

  // Higher timeframe bias
  const recentHigh = Math.max(...klines.slice(-20).map(k => k.high));
  const recentLow = Math.min(...klines.slice(-20).map(k => k.low));
  const range = recentHigh - recentLow;
  const positionInRange = ((currentPrice - recentLow) / range) * 100;

  return {
    trend,
    strength,
    ema9: currentEma9,
    ema21: currentEma21,
    ema50: currentEma50,
    positionInRange: Math.round(positionInRange),
    recentHigh,
    recentLow
  };
}

/**
 * Calculate EMA
 */
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];

  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }

  return ema;
}

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

/**
 * Perform comprehensive coin analysis
 * @param {string} symbolInput - Coin symbol (e.g., 'XRP', 'ETH', 'BTCUSDT')
 * @returns {Promise<Object>} Complete analysis
 */
async function analyzeCoin(symbolInput) {
  const symbol = normalizeSymbol(symbolInput);
  const displayName = getDisplayName(symbol);

  logger.info('Starting comprehensive coin analysis', { symbol, displayName });

  try {
    // 1. Fetch current price
    const ticker = await bybitClient.getTickerBySymbol(symbol, 'linear');
    if (!ticker) {
      throw new Error(`Symbol ${symbol} not found on Bybit`);
    }

    const currentPrice = ticker.lastPrice;
    const change24h = ticker.price24hPcnt;
    const high24h = ticker.highPrice24h;
    const low24h = ticker.lowPrice24h;
    const volume24h = ticker.volume24h;
    const openInterest = ticker.openInterest;
    const fundingRate = ticker.fundingRate;

    // 2. Fetch historical klines for multiple timeframes
    const [klines4H, klinesDaily] = await Promise.all([
      bybitClient.getKlineData({ symbol, interval: '240', limit: 100 }), // 4H
      bybitClient.getKlineData({ symbol, interval: 'D', limit: 100 })    // Daily
    ]);

    // 3. Gann Analysis
    const sq9 = gann.squareOf9(currentPrice);
    const wheel24 = gann.wheelOf24(currentPrice);
    const targets = gann.calculateTargets(currentPrice, 0.5, 8);

    const gannAnalysis = { sq9, wheel24, targets };

    // 4. Historical level analysis
    const historicalLevels4H = calculateHistoricalLevels(klines4H.list, currentPrice);
    const historicalLevelsDaily = calculateHistoricalLevels(klinesDaily.list, currentPrice);

    // Merge historical levels
    const historicalLevels = {
      supports: [...historicalLevels4H.supports, ...historicalLevelsDaily.supports]
        .sort((a, b) => b.price - a.price)
        .slice(0, 8),
      resistances: [...historicalLevels4H.resistances, ...historicalLevelsDaily.resistances]
        .sort((a, b) => a.price - b.price)
        .slice(0, 8),
      keyZones: [...historicalLevels4H.keyZones, ...historicalLevelsDaily.keyZones]
        .sort((a, b) => b.touches - a.touches)
        .slice(0, 5)
    };

    // 5. Calculate reversal zones
    const reversalZones = calculateReversalZones(currentPrice, gannAnalysis, historicalLevels);

    // 6. Trend analysis
    const trend4H = analyzeTrend(klines4H.list);
    const trendDaily = analyzeTrend(klinesDaily.list);

    // 7. Planetary analysis
    const planets = planetary.getCurrentPlanets();
    const moonInfo = planetary.getMoonInfo();
    const aspects = planetary.getAspects();
    const majorEvents = planetary.scanMajorEvents(null, 7);

    const planetaryData = { planets, moon: moonInfo, aspects, majorEvents };
    const planetaryBias = calculatePlanetaryBias(planetaryData);

    // 8. Generate trading scenarios
    const scenarios = generateTradingScenarios(
      currentPrice,
      reversalZones,
      trend4H,
      trendDaily,
      planetaryBias
    );

    // 9. Calculate overall confluence score
    const overallConfluence = calculateOverallConfluence(
      gannAnalysis,
      reversalZones,
      planetaryBias,
      trend4H,
      trendDaily
    );

    return {
      symbol,
      displayName,
      timestamp: new Date().toISOString(),

      // Price data
      price: {
        current: currentPrice,
        change24h,
        high24h,
        low24h,
        volume24h,
        openInterest,
        fundingRate: fundingRate ? fundingRate * 100 : null
      },

      // Gann analysis
      gann: {
        squareOf9: {
          degree: sq9.degreePosition,
          inSquare: sq9.percentInSquare,
          flags: sq9.flags,
          supports: sq9.supportLevels.slice(0, 5),
          resistances: sq9.resistanceLevels.slice(0, 5)
        },
        wheelOf24: {
          degree: wheel24.degrees.normalized,
          quadrant: wheel24.wheelPosition.quadrant,
          section: wheel24.wheelPosition.section,
          description: wheel24.wheelPosition.description,
          nearCardinal: wheel24.cardinalAnalysis.nearCardinal,
          cardinalDistance: wheel24.cardinalAnalysis.cardinalProximity?.distance
        },
        targets: {
          closestSupport: targets.closestSupport,
          closestResistance: targets.closestResistance,
          keyLevels: targets.keyLevels.slice(0, 8)
        }
      },

      // Historical levels
      historicalLevels,

      // Reversal zones (multi-factor confluence)
      reversalZones: reversalZones.slice(0, 8),

      // Trend analysis
      trend: {
        timeframe4H: trend4H,
        daily: trendDaily,
        overall: trendDaily.trend === trend4H.trend ? trend4H.trend : 'mixed'
      },

      // Planetary data
      planetary: {
        moon: moonInfo,
        bias: planetaryBias,
        activeAspects: aspects.aspects?.slice(0, 5) || [],
        upcomingEvents: majorEvents.events?.slice(0, 3) || []
      },

      // Trading scenarios
      scenarios,

      // Overall analysis
      overallConfluence
    };

  } catch (error) {
    logger.error('Coin analysis failed', { symbol, error: error.message });
    throw error;
  }
}

/**
 * Generate trading scenarios based on analysis
 */
function generateTradingScenarios(price, reversalZones, trend4H, trendDaily, planetaryBias) {
  const scenarios = [];

  // Find nearest support and resistance zones
  const nearestSupport = reversalZones.find(z => z.type === 'support');
  const nearestResistance = reversalZones.find(z => z.type === 'resistance');

  // Bullish scenario
  if (nearestSupport && trend4H.trend !== 'bearish') {
    scenarios.push({
      type: 'LONG',
      condition: `Price holds above $${nearestSupport.price.toFixed(4)}`,
      entry: nearestSupport.price,
      confluence: nearestSupport.factors,
      htfBias: trendDaily.trend,
      planetaryBias: planetaryBias.bias,
      confidence: nearestSupport.confluenceScore >= 3 ? 'high' : 'medium'
    });
  }

  // Bearish scenario
  if (nearestResistance && trend4H.trend !== 'bullish') {
    scenarios.push({
      type: 'SHORT',
      condition: `Price rejected at $${nearestResistance.price.toFixed(4)}`,
      entry: nearestResistance.price,
      confluence: nearestResistance.factors,
      htfBias: trendDaily.trend,
      planetaryBias: planetaryBias.bias,
      confidence: nearestResistance.confluenceScore >= 3 ? 'high' : 'medium'
    });
  }

  // Breakout scenario
  if (nearestResistance && trendDaily.trend === 'bullish') {
    scenarios.push({
      type: 'BREAKOUT_LONG',
      condition: `Price closes above $${nearestResistance.price.toFixed(4)}`,
      entry: nearestResistance.price * 1.002, // Slightly above for confirmation
      confluence: nearestResistance.factors,
      htfBias: trendDaily.trend,
      planetaryBias: planetaryBias.bias,
      confidence: planetaryBias.bias === 'bullish' ? 'high' : 'medium'
    });
  }

  // Breakdown scenario
  if (nearestSupport && trendDaily.trend === 'bearish') {
    scenarios.push({
      type: 'BREAKDOWN_SHORT',
      condition: `Price closes below $${nearestSupport.price.toFixed(4)}`,
      entry: nearestSupport.price * 0.998,
      confluence: nearestSupport.factors,
      htfBias: trendDaily.trend,
      planetaryBias: planetaryBias.bias,
      confidence: planetaryBias.bias === 'bearish' ? 'high' : 'medium'
    });
  }

  return scenarios;
}

/**
 * Calculate overall confluence score
 */
function calculateOverallConfluence(gannAnalysis, reversalZones, planetaryBias, trend4H, trendDaily) {
  let score = 0;
  let maxScore = 0;
  const factors = [];

  // Gann factors (max 3 points)
  maxScore += 3;
  if (gannAnalysis.sq9.flags?.length > 0) {
    score += 1;
    factors.push('Gann Sq9 flag active');
  }
  if (gannAnalysis.wheel24.nearCardinal) {
    score += 1;
    factors.push('Near Wheel of 24 cardinal');
  }
  if (gannAnalysis.sq9.percentInSquare > 90 || gannAnalysis.sq9.percentInSquare < 10) {
    score += 1;
    factors.push('Sq9 at cycle extreme');
  }

  // Reversal zone factors (max 2 points)
  maxScore += 2;
  const highConfluenceZones = reversalZones.filter(z => z.confluenceScore >= 3);
  if (highConfluenceZones.length > 0) {
    score += 1;
    factors.push(`${highConfluenceZones.length} high-confluence zones`);
  }
  const nearbyZones = reversalZones.filter(z => z.isNearby);
  if (nearbyZones.length > 0) {
    score += 1;
    factors.push('Price near reversal zone');
  }

  // Planetary factors (max 2 points)
  maxScore += 2;
  if (planetaryBias.biasStrength > 50) {
    score += 1;
    factors.push(`Strong planetary ${planetaryBias.bias} bias`);
  }
  if (planetaryBias.signals.length >= 3) {
    score += 1;
    factors.push('Multiple planetary signals');
  }

  // Trend alignment (max 2 points)
  maxScore += 2;
  if (trend4H.trend === trendDaily.trend && trend4H.trend !== 'neutral') {
    score += 2;
    factors.push('4H/Daily trend aligned');
  } else if (trend4H.trend !== 'neutral' || trendDaily.trend !== 'neutral') {
    score += 1;
    factors.push('Partial trend alignment');
  }

  const percentage = Math.round((score / maxScore) * 100);

  let rating = 'LOW';
  if (percentage >= 70) rating = 'HIGH';
  else if (percentage >= 50) rating = 'MEDIUM';

  return {
    score,
    maxScore,
    percentage,
    rating,
    factors
  };
}

module.exports = {
  analyzeCoin,
  normalizeSymbol,
  getDisplayName,
  SYMBOL_MAP
};
