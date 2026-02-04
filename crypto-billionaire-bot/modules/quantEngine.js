/**
 * QUANT ENGINE - MODEL 2
 * ======================
 * Hybrid Multi-Confirmation Market Analysis Engine
 *
 * Philosophy:
 * - Time does NOT predict direction
 * - Time only permits attention
 * - Price + Structure decide direction
 *
 * Timeframe Rules:
 * - 1D = Governing layer (law)
 * - 1H = Execution/evaluation layer
 * - Lower TFs NOT allowed to decide logic
 *
 * Time Anchor: 00:00 UTC is the ONLY daily origin
 */

const logger = require('../utils/logger');
const { bybitClient } = require('./bybit');
const gann = require('./gann');
const gemini = require('./gemini');

// ============================================================
// CONFIGURATION - No magic numbers
// ============================================================

const CONFIG = {
  // Time Windows (Wheel of 24) - hours from midnight UTC
  TIME_WINDOWS: {
    PRIMARY: [6, 12, 18, 24],        // Major time sensitivity windows
    SECONDARY: [3, 9, 15, 21],       // Minor windows
    TOLERANCE_HOURS: 1               // ±1 hour tolerance
  },

  // Price Zones (Square of 9)
  PRICE_ZONES: {
    CARDINAL_TOLERANCE_DEG: 5,       // Within 5° of cardinal (0, 90, 180, 270)
    SIGNIFICANT_ANGLES: [0, 45, 90, 135, 180, 225, 270, 315, 360]
  },

  // Natural Time Ratios (Fibonacci)
  TIME_RATIOS: {
    RATIOS: [0.382, 0.5, 0.618, 1.0, 1.272, 1.618, 2.0, 2.618],
    TOLERANCE_PERCENT: 3             // 3% tolerance for ratio match
  },

  // Market Breath
  BREATH: {
    COMPRESSION_ATR_RATIO: 0.5,      // ATR < 50% of avg = compression
    EXPANSION_ATR_RATIO: 1.5         // ATR > 150% of avg = expansion
  },

  // Odd-Even Impulse
  IMPULSE: {
    SIGNIFICANT_COUNTS: [3, 5, 7],   // 3rd, 5th, 7th push
    LOOKBACK_BARS: 20                // Bars to count impulses
  },

  // Time-Price Equality
  TIME_PRICE: {
    TOLERANCE_PERCENT: 2,            // Price within 2% of time value
    MULTIPLIERS: [1, 10, 100, 1000]  // Price-time conversion factors
  },

  // Midnight Memory
  MIDNIGHT: {
    PROXIMITY_PERCENT: 0.5,          // Within 0.5% of midnight open
    SESSION_HOURS: [0, 8, 16]        // Session boundaries (UTC)
  },

  // Decision Thresholds
  DECISION: {
    MIN_CONFIRMATIONS: 1,            // At least 1 conditioning module true
    ACTIONABLE_THRESHOLD: 3,         // 3+ confirmations = ACTIONABLE
    WAIT_THRESHOLD: 1                // 1-2 confirmations = WAIT
  }
};

// ============================================================
// DAILY ENGINE (LAW LAYER)
// ============================================================

/**
 * Build Daily Context - runs once per day at 00:00 UTC
 * This is the "law layer" that governs intraday decisions
 */
async function buildDailyContext(symbol) {
  logger.info('Building daily context', { symbol });

  try {
    // Fetch daily candles
    const dailyKlines = await bybitClient.getKlineData({
      symbol,
      interval: 'D',
      limit: 30  // Last 30 days
    });

    if (!dailyKlines?.list || dailyKlines.list.length < 2) {
      throw new Error('Insufficient daily data');
    }

    // Sort by timestamp (newest first in Bybit)
    const candles = dailyKlines.list.map(k => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).filter(c => !isNaN(c.open) && !isNaN(c.close) && c.open > 0 && c.close > 0);

    if (candles.length < 2) {
      throw new Error('Invalid candle data - prices are not valid numbers');
    }

    // Today's candle (forming)
    const today = candles[0];
    // Previous day (completed)
    const yesterday = candles[1];

    // Validate prices
    if (!today.open || !today.close || isNaN(today.open) || isNaN(today.close)) {
      throw new Error('Invalid today candle data');
    }

    // Calculate ATR for breath analysis
    const atrValues = [];
    for (let i = 1; i < Math.min(15, candles.length); i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1]?.close || candles[i].high),
        Math.abs(candles[i].low - candles[i - 1]?.close || candles[i].low)
      );
      atrValues.push(tr);
    }
    const avgATR = atrValues.length > 0 ? atrValues.reduce((a, b) => a + b, 0) / atrValues.length : today.high - today.low;

    // Daily bias determination
    const dailyBias = determineDailyBias(today, yesterday, candles.slice(0, 5));

    // Square of 9 levels from daily base
    const basePrice = today.open;  // Midnight open is the anchor

    // Validate basePrice before Gann calculation
    if (!basePrice || isNaN(basePrice) || basePrice <= 0) {
      throw new Error(`Invalid base price: ${basePrice}`);
    }

    const sq9 = gann.squareOf9(basePrice);

    // Wheel of 24 time windows for today
    const wheel24Windows = calculateWheel24Windows(new Date());

    // Previous day high/low for reference
    const pdh = yesterday.high;
    const pdl = yesterday.low;

    // Find significant swing points from recent history
    const swingPoints = findSwingPoints(candles.slice(0, 20));

    const context = {
      symbol,
      timestamp: new Date().toISOString(),
      anchorTime: getMidnightUTC().toISOString(),

      // Price anchors
      dailyOpen: today.open,
      pdh,  // Previous Day High
      pdl,  // Previous Day Low
      currentPrice: today.close,

      // Bias
      dailyBias: dailyBias.direction,
      biasStrength: dailyBias.strength,
      biasReason: dailyBias.reason,

      // Gann levels from daily anchor
      sq9Levels: {
        degree: sq9.degreePosition,
        nearCardinal: sq9.flags?.nearCardinal || false,
        supports: sq9.supportLevels.slice(0, 5).map(s => s.level),
        resistances: sq9.resistanceLevels.slice(0, 5).map(r => r.level)
      },

      // Time windows
      wheel24Windows,

      // Volatility context
      avgATR,
      todayRange: today.high - today.low,
      isCompressed: (today.high - today.low) < avgATR * CONFIG.BREATH.COMPRESSION_ATR_RATIO,
      isExpanded: (today.high - today.low) > avgATR * CONFIG.BREATH.EXPANSION_ATR_RATIO,

      // Swing reference
      swingPoints,

      // Raw data for conditioning modules
      recentCandles: candles.slice(0, 10)
    };

    logger.info('Daily context built', {
      symbol,
      dailyBias: context.dailyBias,
      dailyOpen: context.dailyOpen
    });

    return context;

  } catch (error) {
    logger.error('Failed to build daily context', { error: error.message, symbol });
    throw error;
  }
}

/**
 * Determine daily bias from price action
 */
function determineDailyBias(today, yesterday, recentCandles) {
  const reasons = [];
  let bullishScore = 0;
  let bearishScore = 0;

  // 1. Today's open vs yesterday's close
  if (today.open > yesterday.close) {
    bullishScore += 1;
    reasons.push('Gap up open');
  } else if (today.open < yesterday.close) {
    bearishScore += 1;
    reasons.push('Gap down open');
  }

  // 2. Yesterday's candle character
  if (yesterday.close > yesterday.open) {
    bullishScore += 1;
    reasons.push('Previous day bullish');
  } else {
    bearishScore += 1;
    reasons.push('Previous day bearish');
  }

  // 3. Position within yesterday's range
  const ydRange = yesterday.high - yesterday.low;
  const positionInRange = (today.open - yesterday.low) / ydRange;
  if (positionInRange > 0.7) {
    bullishScore += 1;
    reasons.push('Open in upper range');
  } else if (positionInRange < 0.3) {
    bearishScore += 1;
    reasons.push('Open in lower range');
  }

  // 4. Higher highs / Lower lows trend
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  if (highs[0] > highs[1] && highs[1] > highs[2]) {
    bullishScore += 2;
    reasons.push('Higher highs');
  }
  if (lows[0] < lows[1] && lows[1] < lows[2]) {
    bearishScore += 2;
    reasons.push('Lower lows');
  }

  const totalScore = bullishScore - bearishScore;
  let direction, strength;

  if (totalScore >= 3) {
    direction = 'UP';
    strength = 'strong';
  } else if (totalScore >= 1) {
    direction = 'UP';
    strength = 'moderate';
  } else if (totalScore <= -3) {
    direction = 'DOWN';
    strength = 'strong';
  } else if (totalScore <= -1) {
    direction = 'DOWN';
    strength = 'moderate';
  } else {
    direction = 'BALANCE';
    strength = 'neutral';
  }

  return {
    direction,
    strength,
    reason: reasons.join(', '),
    bullishScore,
    bearishScore
  };
}

/**
 * Calculate Wheel of 24 time windows for today
 */
function calculateWheel24Windows(date) {
  const midnight = getMidnightUTC(date);
  const windows = [];

  // Primary windows (6h, 12h, 18h, 24h from midnight)
  CONFIG.TIME_WINDOWS.PRIMARY.forEach(hours => {
    const windowTime = new Date(midnight.getTime() + hours * 60 * 60 * 1000);
    windows.push({
      hour: hours,
      time: windowTime.toISOString(),
      type: 'primary',
      active: false  // Will be set during intraday check
    });
  });

  // Secondary windows
  CONFIG.TIME_WINDOWS.SECONDARY.forEach(hours => {
    const windowTime = new Date(midnight.getTime() + hours * 60 * 60 * 1000);
    windows.push({
      hour: hours,
      time: windowTime.toISOString(),
      type: 'secondary',
      active: false
    });
  });

  return windows.sort((a, b) => a.hour - b.hour);
}

/**
 * Find swing high/low points
 */
function findSwingPoints(candles, lookback = 3) {
  const swings = { highs: [], lows: [] };

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) swings.highs.push({ price: candles[i].high, index: i });
    if (isSwingLow) swings.lows.push({ price: candles[i].low, index: i });
  }

  return swings;
}

/**
 * Get midnight UTC for a given date
 */
function getMidnightUTC(date = new Date()) {
  const midnight = new Date(date);
  midnight.setUTCHours(0, 0, 0, 0);
  return midnight;
}

// ============================================================
// INTRADAY ENGINE (EXECUTION LAYER - 1H)
// ============================================================

/**
 * Analyze current 1H candle against daily context
 */
async function analyzeIntraday(symbol, dailyContext) {
  logger.info('Running intraday analysis', { symbol });

  try {
    // Fetch 1H candles
    const hourlyKlines = await bybitClient.getKlineData({
      symbol,
      interval: '60',
      limit: 50
    });

    if (!hourlyKlines?.list || hourlyKlines.list.length < 10) {
      throw new Error('Insufficient hourly data');
    }

    const candles = hourlyKlines.list.map(k => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).filter(c => !isNaN(c.open) && !isNaN(c.close) && c.open > 0 && c.close > 0);

    if (candles.length < 10) {
      throw new Error('Insufficient valid hourly candle data');
    }

    const current = candles[0];
    const currentPrice = current.close;

    // Validate current price
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid current price: ${currentPrice}`);
    }
    const currentTime = new Date(current.timestamp);

    // ─────────────────────────────────────────────────────────
    // A. TIME SENSITIVITY
    // ─────────────────────────────────────────────────────────
    const timeSensitivity = checkTimeSensitivity(currentTime, dailyContext.wheel24Windows);

    // ─────────────────────────────────────────────────────────
    // B. PRICE LOCATION
    // ─────────────────────────────────────────────────────────
    const priceLocation = checkPriceLocation(currentPrice, dailyContext);

    // ─────────────────────────────────────────────────────────
    // C. CONDITIONING MODULES
    // ─────────────────────────────────────────────────────────
    const confirmations = {
      naturalTimeRatio: checkNaturalTimeRatio(candles, dailyContext),
      marketBreath: checkMarketBreath(candles, dailyContext),
      oddEvenImpulse: checkOddEvenImpulse(candles),
      timePriceEquality: checkTimePriceEquality(currentPrice, currentTime, dailyContext),
      midnightMemory: checkMidnightMemory(currentPrice, candles, dailyContext)
    };

    // ─────────────────────────────────────────────────────────
    // D. DECISION AGGREGATOR
    // ─────────────────────────────────────────────────────────
    const decision = aggregateDecision(timeSensitivity, priceLocation, confirmations);

    const result = {
      asset: symbol,
      timeframe: '1H',
      timestamp: currentTime.toISOString(),
      currentPrice,

      // Daily context reference
      dailyBias: dailyContext.dailyBias,
      dailyOpen: dailyContext.dailyOpen,
      pdh: dailyContext.pdh,
      pdl: dailyContext.pdl,

      // Time analysis
      timeSensitive: timeSensitivity.isActive,
      timeWindow: timeSensitivity.activeWindow,
      timeDetails: timeSensitivity,

      // Price analysis
      priceLocation: priceLocation.zone,
      priceDetails: priceLocation,

      // Confirmations
      confirmations: {
        naturalTimeRatio: confirmations.naturalTimeRatio.confirmed,
        marketBreath: confirmations.marketBreath.confirmed,
        oddEvenImpulse: confirmations.oddEvenImpulse.confirmed,
        timePriceEquality: confirmations.timePriceEquality.confirmed,
        midnightMemory: confirmations.midnightMemory.confirmed
      },

      confirmationDetails: confirmations,

      // Final decision
      finalState: decision.state,
      confidence: decision.confidence,
      reason: decision.reason,
      actionGuidance: decision.guidance
    };

    logger.info('Intraday analysis complete', {
      symbol,
      finalState: result.finalState,
      confirmations: Object.values(result.confirmations).filter(Boolean).length
    });

    return result;

  } catch (error) {
    logger.error('Intraday analysis failed', { error: error.message, symbol });
    throw error;
  }
}

// ============================================================
// CONDITIONING MODULES
// ============================================================

/**
 * A. Check Time Sensitivity (Wheel of 24 windows)
 */
function checkTimeSensitivity(currentTime, windows) {
  const currentHour = currentTime.getUTCHours();
  const tolerance = CONFIG.TIME_WINDOWS.TOLERANCE_HOURS;

  let activeWindow = null;
  let windowType = null;

  for (const window of windows) {
    const windowHour = window.hour % 24;
    const diff = Math.abs(currentHour - windowHour);
    const wrappedDiff = Math.min(diff, 24 - diff);

    if (wrappedDiff <= tolerance) {
      activeWindow = window;
      windowType = window.type;
      break;
    }
  }

  return {
    isActive: activeWindow !== null,
    activeWindow: activeWindow ? `${activeWindow.hour}h (${activeWindow.type})` : null,
    windowType,
    currentHour,
    hoursFromMidnight: currentHour,
    reason: activeWindow
      ? `Inside ${activeWindow.type} time window (${activeWindow.hour}h)`
      : 'Outside major time windows'
  };
}

/**
 * B. Check Price Location
 */
function checkPriceLocation(price, dailyContext) {
  const zones = [];
  let primaryZone = 'NEUTRAL';

  // Validate price
  if (!price || isNaN(price) || price <= 0) {
    return {
      confirmed: false,
      zone: 'NEUTRAL',
      zones: [],
      reason: 'Invalid price for zone calculation',
      isAtDecisionZone: false
    };
  }

  // Check Square of 9 zone
  const sq9 = gann.squareOf9(price);
  const degPos = sq9.degreePosition || 0;
  const nearCardinal = CONFIG.PRICE_ZONES.SIGNIFICANT_ANGLES.some(angle => {
    const diff = Math.abs(degPos - angle);
    return Math.min(diff, 360 - diff) <= CONFIG.PRICE_ZONES.CARDINAL_TOLERANCE_DEG;
  });

  if (nearCardinal) {
    zones.push('SQUARE_OF_9_ZONE');
    primaryZone = 'SQUARE_OF_9_ZONE';
  }

  // Check near Daily Open
  const doProximity = Math.abs(price - dailyContext.dailyOpen) / dailyContext.dailyOpen * 100;
  if (doProximity < 0.5) {
    zones.push('DAILY_OPEN');
    if (primaryZone === 'NEUTRAL') primaryZone = 'DAILY_OPEN';
  }

  // Check near PDH
  const pdhProximity = Math.abs(price - dailyContext.pdh) / dailyContext.pdh * 100;
  if (pdhProximity < 0.3) {
    zones.push('PDH');
    if (primaryZone === 'NEUTRAL') primaryZone = 'PDH';
  }

  // Check near PDL
  const pdlProximity = Math.abs(price - dailyContext.pdl) / dailyContext.pdl * 100;
  if (pdlProximity < 0.3) {
    zones.push('PDL');
    if (primaryZone === 'NEUTRAL') primaryZone = 'PDL';
  }

  // Check near Sq9 support/resistance
  for (const support of dailyContext.sq9Levels.supports.slice(0, 3)) {
    const proximity = Math.abs(price - support) / support * 100;
    if (proximity < 0.5) {
      zones.push('SQ9_SUPPORT');
      break;
    }
  }

  for (const resist of dailyContext.sq9Levels.resistances.slice(0, 3)) {
    const proximity = Math.abs(price - resist) / resist * 100;
    if (proximity < 0.5) {
      zones.push('SQ9_RESISTANCE');
      break;
    }
  }

  return {
    zone: primaryZone,
    allZones: zones,
    isAtDecisionZone: zones.length > 0,
    sq9Degree: degPos,
    nearCardinal,
    distanceFromDailyOpen: doProximity,
    reason: zones.length > 0
      ? `Price at ${zones.join(' + ')}`
      : 'Price in no-man\'s land'
  };
}

/**
 * C1. Natural Time Ratios (Fibonacci applied to time)
 */
function checkNaturalTimeRatio(candles, dailyContext) {
  // Find the last significant swing
  const swings = findSwingPoints(candles.slice(0, 30), 2);

  if (swings.highs.length === 0 && swings.lows.length === 0) {
    return {
      confirmed: false,
      confidence: 0,
      ratio: null,
      reason: 'No clear swing structure'
    };
  }

  // Count bars since last swing
  const lastSwingIndex = Math.min(
    swings.highs[0]?.index || 999,
    swings.lows[0]?.index || 999
  );

  // Check if current bar count matches a Fibonacci ratio of recent move duration
  for (const ratio of CONFIG.TIME_RATIOS.RATIOS) {
    const targetBars = Math.round(lastSwingIndex * ratio);
    const currentBars = 0; // Current bar

    // Check if we're at a ratio extension point
    const tolerance = Math.max(1, Math.round(lastSwingIndex * CONFIG.TIME_RATIOS.TOLERANCE_PERCENT / 100));

    if (Math.abs(targetBars - candles.length) <= tolerance) {
      return {
        confirmed: true,
        confidence: 0.7,
        ratio,
        barsFromSwing: lastSwingIndex,
        reason: `At ${ratio} time extension from swing (${lastSwingIndex} bars)`
      };
    }
  }

  return {
    confirmed: false,
    confidence: 0,
    ratio: null,
    barsFromSwing: lastSwingIndex,
    reason: 'Not at significant time ratio'
  };
}

/**
 * C2. Market Breath (Compression → Expansion)
 */
function checkMarketBreath(candles, dailyContext) {
  // Calculate recent ATR
  const recentATR = [];
  for (let i = 0; i < Math.min(10, candles.length - 1); i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i + 1].close),
      Math.abs(candles[i].low - candles[i + 1].close)
    );
    recentATR.push(tr);
  }

  const currentATR = recentATR[0];
  const avgATR = recentATR.reduce((a, b) => a + b, 0) / recentATR.length;

  const isCompressed = currentATR < avgATR * CONFIG.BREATH.COMPRESSION_ATR_RATIO;
  const isExpanding = currentATR > avgATR * CONFIG.BREATH.EXPANSION_ATR_RATIO;

  // Look for compression → expansion transition
  const wasCompressed = recentATR.slice(1, 4).every(atr => atr < avgATR * 0.7);
  const nowExpanding = currentATR > avgATR;

  const transitionDetected = wasCompressed && nowExpanding;

  return {
    confirmed: transitionDetected,
    confidence: transitionDetected ? 0.8 : 0.3,
    state: isCompressed ? 'COMPRESSED' : (isExpanding ? 'EXPANDING' : 'NORMAL'),
    currentATR,
    avgATR,
    ratio: currentATR / avgATR,
    reason: transitionDetected
      ? 'Compression → Expansion transition detected'
      : (isCompressed ? 'In compression phase' : 'Normal volatility')
  };
}

/**
 * C3. Odd-Even Impulse (counting 3rd, 5th, 7th pushes)
 */
function checkOddEvenImpulse(candles) {
  const lookback = CONFIG.IMPULSE.LOOKBACK_BARS;
  let upPushes = 0;
  let downPushes = 0;

  // Count consecutive impulses
  for (let i = 0; i < Math.min(lookback, candles.length - 1); i++) {
    if (candles[i].close > candles[i + 1].close) {
      upPushes++;
    } else if (candles[i].close < candles[i + 1].close) {
      downPushes++;
    }
  }

  const dominantDirection = upPushes > downPushes ? 'UP' : 'DOWN';
  const pushCount = Math.max(upPushes, downPushes);

  const isSignificantCount = CONFIG.IMPULSE.SIGNIFICANT_COUNTS.includes(pushCount);
  const isExhaustion = pushCount >= 5;

  return {
    confirmed: isSignificantCount,
    confidence: isExhaustion ? 0.85 : 0.6,
    direction: dominantDirection,
    pushCount,
    upPushes,
    downPushes,
    isExhaustion,
    reason: isSignificantCount
      ? `${pushCount}${getOrdinal(pushCount)} ${dominantDirection} push (${isExhaustion ? 'exhaustion' : 'momentum'})`
      : `${pushCount} pushes - not at significant count`
  };
}

/**
 * C4. Time-Price Equality (Gann Balance Rule)
 */
function checkTimePriceEquality(price, currentTime, dailyContext) {
  const hoursFromMidnight = currentTime.getUTCHours() + currentTime.getUTCMinutes() / 60;

  // Try different multipliers to find price-time match
  for (const multiplier of CONFIG.TIME_PRICE.MULTIPLIERS) {
    const timeAsPrice = hoursFromMidnight * multiplier;
    const percentDiff = Math.abs(price - timeAsPrice) / price * 100;

    if (percentDiff <= CONFIG.TIME_PRICE.TOLERANCE_PERCENT) {
      return {
        confirmed: true,
        confidence: 0.75,
        multiplier,
        timeValue: hoursFromMidnight,
        priceEquivalent: timeAsPrice,
        percentDiff,
        reason: `Price ($${price.toFixed(2)}) ≈ Time (${hoursFromMidnight.toFixed(1)}h × ${multiplier})`
      };
    }
  }

  return {
    confirmed: false,
    confidence: 0,
    reason: 'No time-price equality found'
  };
}

/**
 * C5. Midnight Memory (Session Anchoring)
 */
function checkMidnightMemory(currentPrice, candles, dailyContext) {
  const midnightOpen = dailyContext.dailyOpen;

  // Check if price has revisited midnight open
  const proximity = Math.abs(currentPrice - midnightOpen) / midnightOpen * 100;
  const isNearMidnight = proximity <= CONFIG.MIDNIGHT.PROXIMITY_PERCENT;

  // Check if price previously moved away and is now returning
  let movedAway = false;
  let maxDistance = 0;

  for (let i = 1; i < Math.min(candles.length, 20); i++) {
    const dist = Math.abs(candles[i].close - midnightOpen) / midnightOpen * 100;
    if (dist > 1) {
      movedAway = true;
      maxDistance = Math.max(maxDistance, dist);
    }
  }

  const isRevisit = movedAway && isNearMidnight;

  return {
    confirmed: isRevisit,
    confidence: isRevisit ? 0.7 : 0.2,
    midnightOpen,
    currentDistance: proximity,
    maxDistanceReached: maxDistance,
    movedAway,
    reason: isRevisit
      ? `Price returned to midnight open ($${midnightOpen.toFixed(2)}) after ${maxDistance.toFixed(1)}% move`
      : (isNearMidnight ? 'Near midnight open (no significant move away)' : 'Away from midnight open')
  };
}

// ============================================================
// DECISION AGGREGATOR
// ============================================================

/**
 * Aggregate all signals into final decision
 * Rules:
 * - NO decision without time sensitivity
 * - NO decision without price at decision zone
 * - Require at least ONE conditioning module true
 */
function aggregateDecision(timeSensitivity, priceLocation, confirmations) {
  // Count true confirmations
  const confirmationCount = Object.values(confirmations)
    .filter(c => c.confirmed).length;

  // Collect active factors
  const activeFactors = [];
  for (const [name, result] of Object.entries(confirmations)) {
    if (result.confirmed) {
      activeFactors.push(name);
    }
  }

  // Calculate average confidence
  const avgConfidence = Object.values(confirmations)
    .filter(c => c.confirmed)
    .reduce((sum, c) => sum + c.confidence, 0) / Math.max(1, confirmationCount);

  // ─────────────────────────────────────────────────────────
  // DECISION LOGIC (Strict Rules)
  // ─────────────────────────────────────────────────────────

  // Rule 1: No decision without time sensitivity
  if (!timeSensitivity.isActive) {
    return {
      state: 'IGNORE',
      confidence: 0,
      reason: 'Outside time sensitivity window - market noise period',
      guidance: 'WAIT for next time window. Current price action is not significant.',
      activeFactors: [],
      confirmationCount: 0
    };
  }

  // Rule 2: No decision without price at decision zone
  if (!priceLocation.isAtDecisionZone) {
    return {
      state: 'WAIT',
      confidence: avgConfidence * 0.5,
      reason: 'Time sensitive but price not at decision zone',
      guidance: 'MONITOR - Time is right but price needs to reach a key level.',
      activeFactors,
      confirmationCount
    };
  }

  // Rule 3: Need at least one confirmation
  if (confirmationCount < CONFIG.DECISION.MIN_CONFIRMATIONS) {
    return {
      state: 'WAIT',
      confidence: avgConfidence * 0.3,
      reason: 'Time + Price aligned but no confirmation from conditioning modules',
      guidance: 'WAIT for confirmation. Setup forming but not ready.',
      activeFactors: [],
      confirmationCount: 0
    };
  }

  // ─────────────────────────────────────────────────────────
  // ACTIONABLE or WAIT based on confirmation count
  // ─────────────────────────────────────────────────────────

  if (confirmationCount >= CONFIG.DECISION.ACTIONABLE_THRESHOLD) {
    return {
      state: 'ACTIONABLE',
      confidence: Math.min(0.95, avgConfidence + 0.1),
      reason: `Strong setup: Time window + ${priceLocation.zone} + ${confirmationCount} confirmations`,
      guidance: generateActionGuidance(priceLocation, confirmations),
      activeFactors,
      confirmationCount
    };
  }

  // 1-2 confirmations = WAIT with attention
  return {
    state: 'WAIT',
    confidence: avgConfidence,
    reason: `Developing setup: ${confirmationCount} confirmation(s) active`,
    guidance: `WATCH closely. ${activeFactors.join(' + ')} suggest attention.`,
    activeFactors,
    confirmationCount
  };
}

/**
 * Generate specific action guidance
 */
function generateActionGuidance(priceLocation, confirmations) {
  const guidance = [];

  // Check for reversal signals
  if (confirmations.oddEvenImpulse.confirmed && confirmations.oddEvenImpulse.isExhaustion) {
    guidance.push(`REVERSAL likely - ${confirmations.oddEvenImpulse.pushCount}th push exhaustion`);
  }

  // Check breath transition
  if (confirmations.marketBreath.confirmed) {
    guidance.push('Volatility expansion starting - expect directional move');
  }

  // Check midnight memory
  if (confirmations.midnightMemory.confirmed) {
    guidance.push('Price anchored to midnight open - watch for rejection or break');
  }

  // Price zone specific
  if (priceLocation.zone === 'PDH') {
    guidance.push('At Previous Day High - key breakout/rejection level');
  } else if (priceLocation.zone === 'PDL') {
    guidance.push('At Previous Day Low - key breakdown/bounce level');
  } else if (priceLocation.zone === 'SQUARE_OF_9_ZONE') {
    guidance.push('At Gann Sq9 cardinal - natural turning point');
  }

  return guidance.join('. ') || 'Multiple confirmations aligned - prepare for move';
}

// ============================================================
// GEMINI AI EXPLANATION
// ============================================================

/**
 * Generate AI-powered crystal clear explanation
 */
async function generateAIExplanation(analysisResult) {
  if (!gemini.isEnabled()) {
    return generateFallbackExplanation(analysisResult);
  }

  const prompt = buildQuantEnginePrompt(analysisResult);

  try {
    const aiExplanation = await gemini.generate(prompt, {
      maxOutputTokens: 600,
      temperature: 0.4
    });

    return aiExplanation || generateFallbackExplanation(analysisResult);
  } catch (error) {
    logger.error('Gemini explanation failed', { error: error.message });
    return generateFallbackExplanation(analysisResult);
  }
}

/**
 * Build prompt for Gemini
 */
function buildQuantEnginePrompt(result) {
  return `You are an elite quantitative trading analyst. Explain this market analysis in CRYSTAL CLEAR language that a trader can act on.

ASSET: ${result.asset}
PRICE: $${result.currentPrice.toLocaleString()}
DAILY BIAS: ${result.dailyBias}

TIME ANALYSIS:
- Time Sensitive: ${result.timeSensitive ? 'YES - ' + result.timeWindow : 'NO'}
- Hours from midnight: ${result.timeDetails.hoursFromMidnight}h

PRICE LOCATION:
- Zone: ${result.priceLocation}
- ${result.priceDetails.reason}

CONFIRMATIONS:
- Natural Time Ratio: ${result.confirmations.naturalTimeRatio ? '✅' : '❌'} - ${result.confirmationDetails.naturalTimeRatio.reason}
- Market Breath: ${result.confirmations.marketBreath ? '✅' : '❌'} - ${result.confirmationDetails.marketBreath.reason}
- Odd-Even Impulse: ${result.confirmations.oddEvenImpulse ? '✅' : '❌'} - ${result.confirmationDetails.oddEvenImpulse.reason}
- Time-Price Equality: ${result.confirmations.timePriceEquality ? '✅' : '❌'} - ${result.confirmationDetails.timePriceEquality.reason}
- Midnight Memory: ${result.confirmations.midnightMemory ? '✅' : '❌'} - ${result.confirmationDetails.midnightMemory.reason}

FINAL STATE: ${result.finalState}
CONFIDENCE: ${(result.confidence * 100).toFixed(0)}%

Write a 4-5 sentence explanation that:
1. States the CURRENT SITUATION clearly
2. Explains WHY this matters (which confirmations are firing)
3. Gives SPECIFIC ACTION: Should trader WAIT, look for REVERSAL, or look for CONTINUATION?
4. Identifies the KEY LEVEL to watch
5. States what would INVALIDATE this analysis

Be direct. No fluff. Trader needs to know EXACTLY what to do.`;
}

/**
 * Fallback explanation when Gemini unavailable
 */
function generateFallbackExplanation(result) {
  const activeConfirmations = Object.entries(result.confirmations)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  let explanation = '';

  // Current situation
  explanation += `${result.asset} at $${result.currentPrice.toLocaleString()} with ${result.dailyBias} daily bias. `;

  // Time-Price status
  if (result.timeSensitive && result.priceDetails.isAtDecisionZone) {
    explanation += `ATTENTION: Price at ${result.priceLocation} during ${result.timeWindow} window. `;
  } else if (result.timeSensitive) {
    explanation += `Time window active but price not at key level. `;
  } else {
    explanation += `Outside significant time window - low probability period. `;
  }

  // Confirmations
  if (activeConfirmations.length > 0) {
    explanation += `Active signals: ${activeConfirmations.join(', ')}. `;
  }

  // Action guidance
  if (result.finalState === 'ACTIONABLE') {
    explanation += `HIGH PROBABILITY setup. ${result.actionGuidance}`;
  } else if (result.finalState === 'WAIT') {
    explanation += `Setup developing. Wait for more confirmation before acting.`;
  } else {
    explanation += `No actionable setup. Wait for next time window.`;
  }

  return explanation;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Run full Quant Engine analysis
 */
async function analyze(symbol) {
  logger.info('Starting Quant Engine analysis', { symbol });

  try {
    // 1. Build daily context
    const dailyContext = await buildDailyContext(symbol);

    // 2. Run intraday analysis
    const intradayResult = await analyzeIntraday(symbol, dailyContext);

    // 3. Generate AI explanation
    const aiExplanation = await generateAIExplanation(intradayResult);

    // 4. Combine into final output
    return {
      ...intradayResult,
      aiExplanation,
      dailyContext: {
        dailyOpen: dailyContext.dailyOpen,
        pdh: dailyContext.pdh,
        pdl: dailyContext.pdl,
        dailyBias: dailyContext.dailyBias,
        biasStrength: dailyContext.biasStrength,
        isCompressed: dailyContext.isCompressed,
        isExpanded: dailyContext.isExpanded
      }
    };

  } catch (error) {
    logger.error('Quant Engine analysis failed', { error: error.message, symbol });
    throw error;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Main
  analyze,

  // Components (for testing)
  buildDailyContext,
  analyzeIntraday,
  generateAIExplanation,

  // Conditioning modules (for testing)
  checkTimeSensitivity,
  checkPriceLocation,
  checkNaturalTimeRatio,
  checkMarketBreath,
  checkOddEvenImpulse,
  checkTimePriceEquality,
  checkMidnightMemory,

  // Decision
  aggregateDecision,

  // Config
  CONFIG
};
