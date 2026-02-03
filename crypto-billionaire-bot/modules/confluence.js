/**
 * CONFLUENCE SCORING MODULE
 * =========================
 * Weighted multi-factor confluence scoring
 *
 * Weights are loaded from DB and calibrated weekly
 * All scoring is deterministic - no AI/ML black boxes
 */

const logger = require('../utils/logger');
const gann = require('./gann');
const planetary = require('./planetary');
const db = require('../database/models');

// ============================================================
// DEFAULT WEIGHTS (overridden by DB)
// ============================================================

const DEFAULT_WEIGHTS = {
  // Gann components
  gann_sq9_cardinal: 0.15,      // Near cardinal angle (0°, 90°, 180°, 270°)
  gann_sq9_position: 0.10,     // Position in square
  gann_level_proximity: 0.15,  // Close to key level

  // Cycle components
  cycle_convergence: 0.15,     // Multiple cycles aligning
  cycle_major_hit: 0.10,       // Major cycle hit (halving, etc.)

  // Planetary components
  planetary_aspect_tight: 0.10, // Tight aspects (low orb)
  planetary_major_event: 0.10, // Major planetary event
  planetary_moon_phase: 0.05,  // Full/New moon proximity

  // Market components
  market_regime: 0.05,         // Fear/Greed alignment
  market_momentum: 0.05        // OI/Volume signals
};

// Bias thresholds
const BIAS_THRESHOLDS = {
  bullish: 0.6,   // Score > 0.6 with bullish signals
  bearish: 0.6,   // Score > 0.6 with bearish signals
  neutral: 0.4    // Score < 0.4 or mixed signals
};

// In-memory weight cache
let weightCache = null;
let weightCacheTime = 0;
const WEIGHT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ============================================================
// WEIGHT MANAGEMENT
// ============================================================

/**
 * Get current weights (from DB or defaults)
 */
async function getWeights() {
  // Check cache
  if (weightCache && Date.now() - weightCacheTime < WEIGHT_CACHE_TTL) {
    return weightCache;
  }

  try {
    const dbWeights = await db.getCurrentWeights();

    if (dbWeights && Object.keys(dbWeights).length > 0) {
      weightCache = { ...DEFAULT_WEIGHTS, ...dbWeights };
      weightCacheTime = Date.now();
      logger.debug('Loaded weights from DB', { count: Object.keys(dbWeights).length });
      return weightCache;
    }
  } catch (error) {
    logger.debug('Failed to load weights from DB', { error: error.message });
  }

  // Use defaults
  weightCache = { ...DEFAULT_WEIGHTS };
  weightCacheTime = Date.now();
  return weightCache;
}

/**
 * Update weights in DB
 */
async function updateWeights(newWeights, version = null) {
  try {
    // Validate weights sum approximately to 1.0
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (sum < 0.9 || sum > 1.1) {
      logger.warn('Weights do not sum to ~1.0', { sum });
    }

    // Save to DB
    await db.saveWeightVersion(newWeights, version);

    // Clear cache
    weightCache = null;
    weightCacheTime = 0;

    logger.info('Weights updated', { version });
    return true;
  } catch (error) {
    logger.error('Failed to update weights', { error: error.message });
    return false;
  }
}

/**
 * Clear weight cache (force reload from DB)
 */
function clearWeightCache() {
  weightCache = null;
  weightCacheTime = 0;
}

// ============================================================
// COMPONENT SCORING
// ============================================================

/**
 * Score Gann analysis
 */
function scoreGann(price, gannAnalysis) {
  const scores = {
    gann_sq9_cardinal: 0,
    gann_sq9_position: 0,
    gann_level_proximity: 0
  };

  let bullishSignals = 0;
  let bearishSignals = 0;

  if (!gannAnalysis) {
    return { scores, bullishSignals, bearishSignals };
  }

  // Square of 9 cardinal proximity
  if (gannAnalysis.sq9) {
    const degree = gannAnalysis.sq9.degreePosition || 0;
    const cardinals = [0, 90, 180, 270, 360];
    const minDistance = Math.min(...cardinals.map(c => Math.abs(degree - c)));

    if (minDistance < 5) {
      scores.gann_sq9_cardinal = 1.0;
    } else if (minDistance < 15) {
      scores.gann_sq9_cardinal = 0.7;
    } else if (minDistance < 30) {
      scores.gann_sq9_cardinal = 0.3;
    }

    // Position in square (near top/bottom)
    if (gannAnalysis.sq9.flags?.nearTop) {
      scores.gann_sq9_position = 0.8;
      bearishSignals++;
    } else if (gannAnalysis.sq9.flags?.nearBottom) {
      scores.gann_sq9_position = 0.8;
      bullishSignals++;
    } else if (gannAnalysis.sq9.flags?.nearCardinal) {
      scores.gann_sq9_position = 0.5;
    }
  }

  // Level proximity
  if (gannAnalysis.targets) {
    const { closestSupport, closestResistance } = gannAnalysis.targets;

    if (closestSupport) {
      const supportDist = Math.abs(closestSupport.percentFromPrice || 0);
      if (supportDist < 0.5) {
        scores.gann_level_proximity = 1.0;
        bullishSignals++;
      } else if (supportDist < 1.0) {
        scores.gann_level_proximity = 0.7;
      }
    }

    if (closestResistance) {
      const resistDist = Math.abs(closestResistance.percentFromPrice || 0);
      if (resistDist < 0.5) {
        scores.gann_level_proximity = Math.max(scores.gann_level_proximity, 1.0);
        bearishSignals++;
      } else if (resistDist < 1.0) {
        scores.gann_level_proximity = Math.max(scores.gann_level_proximity, 0.7);
      }
    }
  }

  return { scores, bullishSignals, bearishSignals };
}

/**
 * Score cycle analysis
 */
function scoreCycles(cycleAnalysis) {
  const scores = {
    cycle_convergence: 0,
    cycle_major_hit: 0
  };

  let bullishSignals = 0;
  let bearishSignals = 0;

  if (!cycleAnalysis) {
    return { scores, bullishSignals, bearishSignals };
  }

  // Convergence score
  scores.cycle_convergence = cycleAnalysis.convergenceScore || 0;

  // Major cycle hits
  if (cycleAnalysis.majorHits?.length > 0) {
    const topHit = cycleAnalysis.majorHits[0];
    scores.cycle_major_hit = topHit.strength || 0.5;

    // Determine bias from historical event type
    if (topHit.event?.type === 'ath' || topHit.event?.type === 'crash') {
      // ATH and crash cycles often mark reversals
      if (topHit.event.type === 'crash') {
        bullishSignals++; // Recovery from crash
      } else {
        bearishSignals++; // Potential top
      }
    }
  }

  // Overall cycle bias
  if (cycleAnalysis.cycleBias === 'bullish') {
    bullishSignals++;
  } else if (cycleAnalysis.cycleBias === 'bearish') {
    bearishSignals++;
  }

  return { scores, bullishSignals, bearishSignals };
}

/**
 * Score planetary analysis
 */
function scorePlanetary(planetaryData) {
  const scores = {
    planetary_aspect_tight: 0,
    planetary_major_event: 0,
    planetary_moon_phase: 0
  };

  let bullishSignals = 0;
  let bearishSignals = 0;

  if (!planetaryData) {
    return { scores, bullishSignals, bearishSignals };
  }

  // Tight aspects
  if (planetaryData.aspects?.length > 0) {
    const tightAspects = planetaryData.aspects.filter(a => (a.orb || 10) < 2);

    if (tightAspects.length >= 3) {
      scores.planetary_aspect_tight = 1.0;
    } else if (tightAspects.length >= 2) {
      scores.planetary_aspect_tight = 0.7;
    } else if (tightAspects.length >= 1) {
      scores.planetary_aspect_tight = 0.4;
    }

    // Check for traditionally bullish/bearish aspects
    tightAspects.forEach(asp => {
      const aspectName = asp.aspect?.name?.toLowerCase() || '';
      if (aspectName.includes('trine') || aspectName.includes('sextile')) {
        bullishSignals++;
      } else if (aspectName.includes('square') || aspectName.includes('opposition')) {
        bearishSignals++;
      }
    });
  }

  // Major events
  if (planetaryData.majorEvents?.length > 0) {
    const imminentEvents = planetaryData.majorEvents.filter(e => {
      if (!e.date) return false;
      const daysUntil = (new Date(e.date) - new Date()) / (1000 * 60 * 60 * 24);
      return daysUntil >= 0 && daysUntil <= 3;
    });

    if (imminentEvents.length >= 2) {
      scores.planetary_major_event = 1.0;
    } else if (imminentEvents.length === 1) {
      scores.planetary_major_event = 0.6;
    }
  }

  // Moon phase
  if (planetaryData.moon) {
    const phase = planetaryData.moon.phase?.toLowerCase() || '';
    const illumination = planetaryData.moon.illumination || 50;

    if (phase.includes('new') || illumination < 5) {
      scores.planetary_moon_phase = 1.0;
      bullishSignals++; // New moon traditionally bullish
    } else if (phase.includes('full') || illumination > 95) {
      scores.planetary_moon_phase = 1.0;
      bearishSignals++; // Full moon traditionally bearish
    } else if (illumination < 15 || illumination > 85) {
      scores.planetary_moon_phase = 0.5;
    }
  }

  return { scores, bullishSignals, bearishSignals };
}

/**
 * Score market data
 */
function scoreMarket(marketData) {
  const scores = {
    market_regime: 0,
    market_momentum: 0
  };

  let bullishSignals = 0;
  let bearishSignals = 0;

  if (!marketData) {
    return { scores, bullishSignals, bearishSignals };
  }

  // Regime (Fear/Greed)
  const regime = marketData.regimeLabel || marketData.regime;
  if (regime) {
    const regimeLower = regime.toLowerCase();
    if (regimeLower.includes('extreme_fear')) {
      scores.market_regime = 1.0;
      bullishSignals++; // Contrarian - extreme fear is bullish
    } else if (regimeLower.includes('fear')) {
      scores.market_regime = 0.6;
      bullishSignals++;
    } else if (regimeLower.includes('extreme_greed')) {
      scores.market_regime = 1.0;
      bearishSignals++; // Contrarian - extreme greed is bearish
    } else if (regimeLower.includes('greed')) {
      scores.market_regime = 0.6;
      bearishSignals++;
    } else {
      scores.market_regime = 0.3; // Neutral
    }
  }

  // Momentum (OI, Volume)
  if (marketData.oiChange !== undefined) {
    const oiChange = marketData.oiChange;
    if (Math.abs(oiChange) > 5) {
      scores.market_momentum = 0.8;
      if (oiChange > 0) {
        bullishSignals++;
      } else {
        bearishSignals++;
      }
    } else if (Math.abs(oiChange) > 2) {
      scores.market_momentum = 0.5;
    }
  }

  return { scores, bullishSignals, bearishSignals };
}

// ============================================================
// MAIN CALCULATION
// ============================================================

/**
 * Calculate full confluence score
 */
async function calculate(price, options = {}) {
  const weights = await getWeights();
  const timestamp = new Date();

  // Gather all analyses
  let gannAnalysis = options.gann;
  let cycleAnalysis = options.cycles;
  let planetaryData = options.planetary;
  let marketData = options.market;

  // Calculate missing analyses
  if (!gannAnalysis) {
    try {
      const sq9 = gann.squareOf9(price);
      const wheel24 = gann.wheelOf24(price);
      const targets = gann.calculateTargets(price, 0.5, 5);
      gannAnalysis = { sq9, wheel24, targets };
    } catch (e) {
      logger.debug('Gann analysis failed', { error: e.message });
    }
  }

  if (!cycleAnalysis) {
    try {
      // Get historical events for cycle analysis
      let events = [];
      try {
        events = await db.getHistoricalEvents('BTC');
      } catch (e) {
        // Use fallback events
        events = [
          { event_date: '2024-04-20', event_type: 'halving', significance: 10 },
          { event_date: '2024-03-14', event_type: 'ath', significance: 8 },
          { event_date: '2022-11-09', event_type: 'crash', significance: 9 }
        ];
      }
      cycleAnalysis = gann.analyzeCycles(timestamp, events);
    } catch (e) {
      logger.debug('Cycle analysis failed', { error: e.message });
    }
  }

  if (!planetaryData) {
    try {
      const planets = planetary.getCurrentPlanets();
      const moon = planetary.getMoonInfo();
      const aspectData = planetary.getAspects();
      const majorEvents = planetary.scanMajorEvents(null, 7);
      planetaryData = {
        planets,
        moon,
        aspects: aspectData.aspects,
        majorEvents: majorEvents.events
      };
    } catch (e) {
      logger.debug('Planetary analysis failed', { error: e.message });
    }
  }

  // Score each component
  const gannScore = scoreGann(price, gannAnalysis);
  const cycleScore = scoreCycles(cycleAnalysis);
  const planetaryScore = scorePlanetary(planetaryData);
  const marketScore = scoreMarket(marketData);

  // Combine all scores
  const allScores = {
    ...gannScore.scores,
    ...cycleScore.scores,
    ...planetaryScore.scores,
    ...marketScore.scores
  };

  // Calculate weighted total
  let totalScore = 0;
  let totalWeight = 0;

  Object.entries(allScores).forEach(([key, score]) => {
    const weight = weights[key] || 0;
    totalScore += score * weight;
    totalWeight += weight;
  });

  // Normalize score
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  // Count bias signals
  const bullishSignals =
    gannScore.bullishSignals +
    cycleScore.bullishSignals +
    planetaryScore.bullishSignals +
    marketScore.bullishSignals;

  const bearishSignals =
    gannScore.bearishSignals +
    cycleScore.bearishSignals +
    planetaryScore.bearishSignals +
    marketScore.bearishSignals;

  // Determine bias
  let bias = 'neutral';
  if (normalizedScore >= BIAS_THRESHOLDS.bullish && bullishSignals > bearishSignals) {
    bias = 'bullish';
  } else if (normalizedScore >= BIAS_THRESHOLDS.bearish && bearishSignals > bullishSignals) {
    bias = 'bearish';
  } else if (normalizedScore < BIAS_THRESHOLDS.neutral) {
    bias = 'neutral';
  } else if (bullishSignals > bearishSignals + 1) {
    bias = 'bullish';
  } else if (bearishSignals > bullishSignals + 1) {
    bias = 'bearish';
  }

  // Calculate component summaries
  const components = {
    gannScore: (gannScore.scores.gann_sq9_cardinal + gannScore.scores.gann_sq9_position + gannScore.scores.gann_level_proximity) / 3,
    cycleScore: (cycleScore.scores.cycle_convergence + cycleScore.scores.cycle_major_hit) / 2,
    planetaryScore: (planetaryScore.scores.planetary_aspect_tight + planetaryScore.scores.planetary_major_event + planetaryScore.scores.planetary_moon_phase) / 3,
    momentumScore: (marketScore.scores.market_regime + marketScore.scores.market_momentum) / 2
  };

  return {
    score: normalizedScore,
    bias,
    components,
    detailedScores: allScores,
    weights,
    signals: {
      bullish: bullishSignals,
      bearish: bearishSignals
    },
    timestamp,
    price
  };
}

/**
 * Check if confluence is high enough for alert
 */
function isAlertWorthy(confluenceResult, threshold = 0.7) {
  return confluenceResult.score >= threshold;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Main calculation
  calculate,
  isAlertWorthy,

  // Weight management
  getWeights,
  updateWeights,
  clearWeightCache,

  // Component scoring (for testing)
  scoreGann,
  scoreCycles,
  scorePlanetary,
  scoreMarket,

  // Constants
  DEFAULT_WEIGHTS,
  BIAS_THRESHOLDS
};
