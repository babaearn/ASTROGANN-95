/**
 * GANN ANALYSIS ENGINE
 * ====================
 * Pure deterministic mathematical module for W.D. Gann analysis
 * NO external API calls. NO AI. Pure math only.
 *
 * Implements:
 * 1. Square of 9 (Gann Wheel) calculations
 * 2. Time cycle analysis
 * 3. Geometric angle analysis
 * 4. Wheel of 24 / price-to-degree conversion
 * 5. Target calculations
 */

const logger = require('../utils/logger');
const { validatePrice, validatePriceHistory, validateHistoricalEvents, validateDegree } = require('../utils/validators');

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Gann's sacred cycle lengths in days
 */
const GANN_CYCLES = {
  minor: [7, 14, 30],
  major: [90, 120, 144, 180, 360],
  seasonal: [90, 180, 270, 360],
  squares: [49, 64, 121, 144, 169, 196, 225],  // Perfect squares used by Gann
  fibonacci: [21, 34, 55, 89, 144, 233, 377]   // Fibonacci periods
};

/**
 * Cardinal degrees on the wheel
 */
const CARDINAL_DEGREES = [0, 90, 180, 270, 360];

/**
 * Important aspect degrees for planetary harmony
 */
const ASPECT_DEGREES = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
  quincunx: 150
};

/**
 * Default angle configuration (price units per time unit)
 */
const DEFAULT_ANGLE_CONFIG = {
  oneByOne: 1,        // 1x1 angle (45 degrees)
  twoByOne: 2,        // 2x1 angle (steeper)
  oneByTwo: 0.5,      // 1x2 angle (flatter)
  fourByOne: 4,       // 4x1 angle
  oneByFour: 0.25     // 1x4 angle
};

// ============================================================
// SQUARE OF 9 (GANN WHEEL)
// ============================================================

/**
 * Calculate Square of 9 analysis for a given price
 *
 * The Square of 9 places numbers in a spiral pattern, with 1 at center.
 * Key levels occur at cardinal crosses (0°, 90°, 180°, 270°) and
 * at 1/8 divisions (45° intervals).
 *
 * @param {number} price - Current price
 * @returns {Object} Square of 9 analysis
 */
function squareOf9(price) {
  // Validate input
  const validation = validatePrice(price);
  if (!validation.valid) {
    throw new Error(`squareOf9: ${validation.error}`);
  }

  const p = validation.value;

  // Base calculations
  const sqrtPrice = Math.sqrt(p);
  const baseRoot = Math.floor(sqrtPrice);
  const nextRoot = baseRoot + 1;

  // Position within current square (0 to 1)
  const percentInSquare = (sqrtPrice - baseRoot) / (nextRoot - baseRoot);

  // Current square boundaries
  const lowerSquare = baseRoot * baseRoot;
  const upperSquare = nextRoot * nextRoot;

  // Calculate 1/8 division levels (45° intervals on the wheel)
  const eighthDivisions = [];
  for (let i = 0; i <= 8; i++) {
    const fraction = i / 8;
    const rootAtFraction = baseRoot + fraction;
    eighthDivisions.push({
      division: i,
      degrees: i * 45,
      level: Math.round(rootAtFraction * rootAtFraction * 100) / 100
    });
  }

  // Half-square level (important Gann concept)
  const halfSquareRoot = baseRoot + 0.5;
  const halfSquareLevel = halfSquareRoot * halfSquareRoot;

  // Calculate support levels (below current price)
  const supportLevels = [];
  for (let i = 1; i <= 5; i++) {
    const supportRoot = sqrtPrice - (i * 0.125);  // Each 1/8 = 0.125 of a rotation
    if (supportRoot > 0) {
      const level = supportRoot * supportRoot;
      supportLevels.push({
        level: Math.round(level * 100) / 100,
        eighthsBelow: i,
        degreesBelow: i * 45,
        percentFromPrice: Math.round(((p - level) / p) * 10000) / 100
      });
    }
  }

  // Calculate resistance levels (above current price)
  const resistanceLevels = [];
  for (let i = 1; i <= 5; i++) {
    const resistanceRoot = sqrtPrice + (i * 0.125);
    const level = resistanceRoot * resistanceRoot;
    resistanceLevels.push({
      level: Math.round(level * 100) / 100,
      eighthsAbove: i,
      degreesAbove: i * 45,
      percentFromPrice: Math.round(((level - p) / p) * 10000) / 100
    });
  }

  // Full rotation levels (360° intervals = full squares)
  const fullRotationLevels = [];
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const rotatedRoot = sqrtPrice + i;
    if (rotatedRoot > 0) {
      const level = rotatedRoot * rotatedRoot;
      fullRotationLevels.push({
        rotations: i,
        level: Math.round(level * 100) / 100,
        percentFromPrice: Math.round(((level - p) / p) * 10000) / 100
      });
    }
  }

  // Proximity flags
  const distanceToTop = (upperSquare - p) / (upperSquare - lowerSquare);
  const distanceToBottom = (p - lowerSquare) / (upperSquare - lowerSquare);

  const nearTop = distanceToTop < 0.15;     // Within 15% of upper square
  const nearBottom = distanceToBottom < 0.15; // Within 15% of lower square
  const nearHalfSquare = Math.abs(p - halfSquareLevel) / p < 0.02; // Within 2%

  // Degree position on the wheel (0-360)
  const degreePosition = Math.round(percentInSquare * 360 * 100) / 100;

  // Cardinal cross proximity (0°, 90°, 180°, 270°)
  const nearCardinal = CARDINAL_DEGREES.some(deg => {
    const diff = Math.abs((degreePosition % 360) - deg);
    return diff < 10 || diff > 350; // Within 10 degrees
  });

  return {
    price: p,
    squareRoot: Math.round(sqrtPrice * 10000) / 10000,
    baseRoot,
    nextRoot,
    percentInSquare: Math.round(percentInSquare * 10000) / 100,
    degreePosition,
    currentSquare: {
      lower: lowerSquare,
      upper: upperSquare,
      halfSquare: Math.round(halfSquareLevel * 100) / 100
    },
    eighthDivisions,
    supportLevels,
    resistanceLevels,
    fullRotationLevels,
    flags: {
      nearTop,
      nearBottom,
      nearHalfSquare,
      nearCardinal
    },
    meta: {
      method: 'gann_square_of_9',
      inputPrice: p
    }
  };
}

// ============================================================
// CYCLE ANALYSIS
// ============================================================

/**
 * Analyze time cycles from a current date against historical events
 *
 * Checks how many days have elapsed since each historical event and
 * identifies if we're near any significant Gann cycle numbers.
 *
 * @param {Date|string} currentDate - Current date to analyze
 * @param {Array} historicalEvents - Array of historical events with dates
 * @returns {Object} Cycle analysis results
 */
function analyzeCycles(currentDate, historicalEvents) {
  // Validate inputs
  const current = currentDate instanceof Date ? currentDate : new Date(currentDate);
  if (isNaN(current.getTime())) {
    throw new Error('analyzeCycles: Invalid currentDate');
  }

  const validation = validateHistoricalEvents(historicalEvents);
  if (!validation.valid) {
    throw new Error(`analyzeCycles: ${validation.error}`);
  }

  const cyclesToCheck = [7, 14, 30, 90, 120, 144, 180, 360];
  const toleranceDays = 3; // Days tolerance for cycle hit

  const majorHits = [];
  const minorHits = [];
  const allCycleData = [];

  for (const event of historicalEvents) {
    const eventDate = new Date(event.event_date || event.eventDate || event.date);
    const daysSinceEvent = Math.floor((current - eventDate) / (1000 * 60 * 60 * 24));

    if (daysSinceEvent < 0) continue; // Skip future events

    const eventCycles = {
      event: {
        date: eventDate.toISOString().split('T')[0],
        type: event.event_type || event.eventType || event.type || 'unknown',
        description: event.description || '',
        significance: event.significance || 5
      },
      daysSince: daysSinceEvent,
      cycleHits: []
    };

    // Check each cycle
    for (const cycleLength of cyclesToCheck) {
      // Check multiples of the cycle
      for (let multiplier = 1; multiplier <= 10; multiplier++) {
        const targetDays = cycleLength * multiplier;

        // Skip if target is way beyond our days since event
        if (targetDays > daysSinceEvent + toleranceDays) break;

        const difference = Math.abs(daysSinceEvent - targetDays);

        if (difference <= toleranceDays) {
          const isMajor = GANN_CYCLES.major.includes(cycleLength) || multiplier === 1;
          const cycleHit = {
            cycleLength,
            multiplier,
            targetDays,
            actualDays: daysSinceEvent,
            difference,
            isMajor,
            strength: calculateCycleStrength(cycleLength, multiplier, difference, event.significance || 5)
          };

          eventCycles.cycleHits.push(cycleHit);

          if (isMajor && cycleHit.strength >= 0.6) {
            majorHits.push({
              ...cycleHit,
              event: eventCycles.event
            });
          } else if (cycleHit.strength >= 0.4) {
            minorHits.push({
              ...cycleHit,
              event: eventCycles.event
            });
          }
        }
      }
    }

    if (eventCycles.cycleHits.length > 0) {
      allCycleData.push(eventCycles);
    }
  }

  // Sort by strength
  majorHits.sort((a, b) => b.strength - a.strength);
  minorHits.sort((a, b) => b.strength - a.strength);

  // Calculate convergence score (multiple cycles hitting at once)
  const convergenceScore = calculateConvergenceScore(majorHits, minorHits);

  // Determine overall cycle bias
  const cycleBias = determineCycleBias(majorHits, minorHits, historicalEvents);

  return {
    currentDate: current.toISOString().split('T')[0],
    majorHits: majorHits.slice(0, 10), // Top 10
    minorHits: minorHits.slice(0, 10), // Top 10
    totalMajorHits: majorHits.length,
    totalMinorHits: minorHits.length,
    convergenceScore,
    cycleBias,
    upcomingCycles: calculateUpcomingCycles(current, historicalEvents, cyclesToCheck),
    allCycleData,
    meta: {
      method: 'gann_cycle_analysis',
      eventsAnalyzed: historicalEvents.length,
      cyclesChecked: cyclesToCheck
    }
  };
}

/**
 * Calculate strength of a cycle hit
 */
function calculateCycleStrength(cycleLength, multiplier, difference, significance) {
  // Base strength from cycle importance
  let strength = GANN_CYCLES.major.includes(cycleLength) ? 0.8 : 0.5;

  // First occurrence is stronger
  strength *= (1 / Math.sqrt(multiplier));

  // Closer to exact is stronger
  strength *= (1 - (difference / 5)); // 0 diff = full, 3 diff = 40%

  // Event significance factor
  strength *= (significance / 10);

  // Special bonus for sacred numbers
  if ([144, 360].includes(cycleLength)) {
    strength *= 1.2;
  }

  return Math.min(1, Math.max(0, Math.round(strength * 100) / 100));
}

/**
 * Calculate convergence score
 */
function calculateConvergenceScore(majorHits, minorHits) {
  if (majorHits.length === 0 && minorHits.length === 0) {
    return 0;
  }

  const majorWeight = majorHits.reduce((sum, h) => sum + h.strength, 0);
  const minorWeight = minorHits.reduce((sum, h) => sum + h.strength * 0.5, 0);

  const totalWeight = majorWeight + minorWeight;
  const count = majorHits.length + minorHits.length;

  // Normalized score (0-1)
  const score = Math.min(1, (totalWeight / 3) * (Math.log2(count + 1) / 3));

  return Math.round(score * 100) / 100;
}

/**
 * Determine cycle bias based on historical patterns
 */
function determineCycleBias(majorHits, minorHits, events) {
  // Check the nature of events that are hitting cycles
  let bullishEvents = 0;
  let bearishEvents = 0;

  const allHits = [...majorHits, ...minorHits];

  for (const hit of allHits) {
    const eventType = hit.event?.type?.toLowerCase() || '';

    if (['ath', 'halving', 'launch', 'regulation'].includes(eventType)) {
      bullishEvents += hit.strength;
    } else if (['crash', 'hack'].includes(eventType)) {
      bearishEvents += hit.strength;
    }
  }

  const total = bullishEvents + bearishEvents;
  if (total === 0) return 'neutral';

  const bullRatio = bullishEvents / total;

  if (bullRatio > 0.65) return 'bullish';
  if (bullRatio < 0.35) return 'bearish';
  return 'neutral';
}

/**
 * Calculate upcoming cycle dates
 */
function calculateUpcomingCycles(currentDate, events, cycles) {
  const upcoming = [];
  const lookAheadDays = 30;

  for (const event of events) {
    const eventDate = new Date(event.event_date || event.eventDate || event.date);

    for (const cycleLength of cycles) {
      for (let mult = 1; mult <= 20; mult++) {
        const targetDate = new Date(eventDate);
        targetDate.setDate(targetDate.getDate() + (cycleLength * mult));

        const daysUntil = Math.floor((targetDate - currentDate) / (1000 * 60 * 60 * 24));

        if (daysUntil > 0 && daysUntil <= lookAheadDays) {
          upcoming.push({
            date: targetDate.toISOString().split('T')[0],
            daysUntil,
            cycleLength,
            multiplier: mult,
            fromEvent: event.description || event.event_type || 'historical event',
            isMajor: GANN_CYCLES.major.includes(cycleLength)
          });
        }
      }
    }
  }

  // Sort by days until
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  // Remove duplicates (same date)
  const seen = new Set();
  return upcoming.filter(u => {
    const key = u.date;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);
}

// ============================================================
// ANGLE ANALYSIS
// ============================================================

/**
 * Analyze Gann geometric angles from price history
 *
 * Gann angles represent the relationship between price and time.
 * The 1x1 angle (45°) is the most important - price moving 1 unit per time unit.
 *
 * @param {Array} priceHistory - Array of price objects with timestamp and close_price
 * @param {Object} options - Configuration options
 * @returns {Object} Angle analysis results
 */
function analyzeAngles(priceHistory, options = {}) {
  const validation = validatePriceHistory(priceHistory, { minLength: 2 });
  if (!validation.valid) {
    throw new Error(`analyzeAngles: ${validation.error}`);
  }

  const {
    oneByOneUnit = 'auto',  // Price units per time unit for 1x1, or 'auto'
    timeUnit = 'hour'       // 'minute', 'hour', 'day'
  } = options;

  // Sort by timestamp (oldest first)
  const sorted = [...priceHistory].sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    return tA - tB;
  });

  // Get price values
  const prices = sorted.map(p => parseFloat(p.close_price || p.closePrice || p.price));
  const timestamps = sorted.map(p => new Date(p.timestamp).getTime());

  const currentPrice = prices[prices.length - 1];
  const startPrice = prices[0];
  const highPrice = Math.max(...prices);
  const lowPrice = Math.min(...prices);

  // Calculate time span
  const timeSpanMs = timestamps[timestamps.length - 1] - timestamps[0];
  const timeSpanUnits = convertTimeSpan(timeSpanMs, timeUnit);

  // Calculate price change
  const priceChange = currentPrice - startPrice;
  const priceChangePercent = (priceChange / startPrice) * 100;

  // Calculate actual slope (price units per time unit)
  const actualSlope = timeSpanUnits > 0 ? priceChange / timeSpanUnits : 0;

  // Determine 1x1 reference (auto-calculate if needed)
  let oneByOne;
  if (oneByOneUnit === 'auto') {
    // Use average price volatility as 1x1 reference
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    oneByOne = avgPrice * 0.001; // 0.1% per time unit as baseline
  } else {
    oneByOne = parseFloat(oneByOneUnit);
  }

  // Calculate angle in degrees
  // tan(angle) = slope / oneByOne
  const normalizedSlope = actualSlope / oneByOne;
  const angleRadians = Math.atan(normalizedSlope);
  const angleDegrees = angleRadians * (180 / Math.PI);

  // Determine relationship to key angles
  const gannAngles = [
    { name: '8x1', ratio: 8, degrees: 82.5 },
    { name: '4x1', ratio: 4, degrees: 75 },
    { name: '3x1', ratio: 3, degrees: 71.25 },
    { name: '2x1', ratio: 2, degrees: 63.75 },
    { name: '1x1', ratio: 1, degrees: 45 },
    { name: '1x2', ratio: 0.5, degrees: 26.25 },
    { name: '1x3', ratio: 0.333, degrees: 18.75 },
    { name: '1x4', ratio: 0.25, degrees: 15 },
    { name: '1x8', ratio: 0.125, degrees: 7.5 }
  ];

  // Find nearest angle
  let nearestAngle = gannAngles[0];
  let minDiff = Infinity;
  for (const ga of gannAngles) {
    const diff = Math.abs(Math.abs(angleDegrees) - ga.degrees);
    if (diff < minDiff) {
      minDiff = diff;
      nearestAngle = ga;
    }
  }

  // Calculate 1x1 support/resistance lines from high and low
  const oneByOneSupportFromLow = calculateAngleLine(lowPrice, oneByOne, timeSpanUnits, 'up');
  const oneByOneResistanceFromHigh = calculateAngleLine(highPrice, oneByOne, timeSpanUnits, 'down');

  // Determine if price is above or below the 1x1 angle
  const referenceAngleLine = startPrice + (oneByOne * timeSpanUnits);
  const aboveAngle = currentPrice > referenceAngleLine;

  // Detect angle breaking (price breaking through angle lines)
  const angleBreaking = detectAngleBreaking(prices, startPrice, oneByOne, timeSpanUnits);

  // Trend strength based on angle
  let trendStrength;
  if (Math.abs(angleDegrees) >= 63.75) {
    trendStrength = 'strong';
  } else if (Math.abs(angleDegrees) >= 45) {
    trendStrength = 'moderate';
  } else if (Math.abs(angleDegrees) >= 26.25) {
    trendStrength = 'weak';
  } else {
    trendStrength = 'flat';
  }

  return {
    currentPrice,
    startPrice,
    priceChange: Math.round(priceChange * 100) / 100,
    priceChangePercent: Math.round(priceChangePercent * 100) / 100,
    timeSpan: {
      units: Math.round(timeSpanUnits * 100) / 100,
      timeUnit
    },
    slope: {
      actual: Math.round(actualSlope * 10000) / 10000,
      normalized: Math.round(normalizedSlope * 10000) / 10000,
      oneByOneReference: oneByOne
    },
    angle: {
      degrees: Math.round(angleDegrees * 100) / 100,
      direction: angleDegrees >= 0 ? 'up' : 'down',
      nearestGannAngle: nearestAngle,
      deviationFromNearest: Math.round(minDiff * 100) / 100
    },
    signals: {
      aboveAngle,
      angleBreaking,
      trendStrength,
      trend: angleDegrees >= 0 ? 'bullish' : 'bearish'
    },
    angleLines: {
      oneByOneSupportFromLow,
      oneByOneResistanceFromHigh,
      referenceAngleLine: Math.round(referenceAngleLine * 100) / 100
    },
    gannAngles,
    meta: {
      method: 'gann_angle_analysis',
      dataPoints: prices.length,
      timeUnit
    }
  };
}

/**
 * Convert time span to specified units
 */
function convertTimeSpan(ms, unit) {
  switch (unit) {
    case 'minute':
      return ms / (1000 * 60);
    case 'hour':
      return ms / (1000 * 60 * 60);
    case 'day':
      return ms / (1000 * 60 * 60 * 24);
    default:
      return ms / (1000 * 60 * 60); // default to hours
  }
}

/**
 * Calculate angle line projection
 */
function calculateAngleLine(startPrice, slopePerUnit, timeUnits, direction) {
  const projections = [];
  const multiplier = direction === 'up' ? 1 : -1;

  for (let t = 0; t <= timeUnits; t += timeUnits / 10) {
    projections.push({
      timeUnits: Math.round(t * 100) / 100,
      price: Math.round((startPrice + (multiplier * slopePerUnit * t)) * 100) / 100
    });
  }

  return projections;
}

/**
 * Detect if price is breaking through angle lines
 */
function detectAngleBreaking(prices, startPrice, oneByOne, timeSpan) {
  if (prices.length < 3) return { detected: false };

  const recentPrices = prices.slice(-5);
  const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const currentPrice = prices[prices.length - 1];

  // Calculate expected price at 1x1 angle
  const expectedAt1x1 = startPrice + (oneByOne * timeSpan);

  // Check if recent prices crossed the angle line
  const wasBelow = avgRecent < expectedAt1x1;
  const isAbove = currentPrice > expectedAt1x1;
  const wasAbove = avgRecent > expectedAt1x1;
  const isBelow = currentPrice < expectedAt1x1;

  const breakingUp = wasBelow && isAbove;
  const breakingDown = wasAbove && isBelow;

  return {
    detected: breakingUp || breakingDown,
    direction: breakingUp ? 'up' : (breakingDown ? 'down' : null),
    breakingUp,
    breakingDown
  };
}

// ============================================================
// WHEEL OF 24
// ============================================================

/**
 * Calculate Wheel of 24 analysis
 *
 * Converts price to degrees using the fractional part of sqrt(price) * 360.
 * This creates a 360-degree wheel where prices cycle through degrees.
 *
 * @param {number} price - Current price
 * @param {number|null} planetDegree - Optional planetary degree for aspect analysis
 * @returns {Object} Wheel of 24 analysis
 */
function wheelOf24(price, planetDegree = null) {
  const validation = validatePrice(price);
  if (!validation.valid) {
    throw new Error(`wheelOf24: ${validation.error}`);
  }

  const p = validation.value;

  // Convert price to degrees
  // Method: fractional part of sqrt(price) * 360
  const sqrtPrice = Math.sqrt(p);
  const fractional = sqrtPrice - Math.floor(sqrtPrice);
  const priceDegrees = fractional * 360;

  // Normalize to 0-360
  const normalizedDegrees = ((priceDegrees % 360) + 360) % 360;

  // Determine position on the wheel (24 segments of 15 degrees each)
  const segment = Math.floor(normalizedDegrees / 15);
  const positionInSegment = normalizedDegrees % 15;

  // Check proximity to cardinal points (0, 90, 180, 270)
  const nearestCardinal = CARDINAL_DEGREES.reduce((nearest, deg) => {
    const diff = Math.min(
      Math.abs(normalizedDegrees - deg),
      Math.abs(normalizedDegrees - (deg + 360)),
      Math.abs(normalizedDegrees + 360 - deg)
    );
    if (diff < nearest.difference) {
      return { degree: deg, difference: diff };
    }
    return nearest;
  }, { degree: 0, difference: Infinity });

  const nearCardinal = nearestCardinal.difference <= 10;

  // Calculate prices at cardinal points
  const cardinalPrices = calculateCardinalPrices(p, normalizedDegrees);

  // Planetary aspect analysis (if planet degree provided)
  let aspectAnalysis = null;
  if (planetDegree !== null) {
    const degreeValidation = validateDegree(planetDegree, { allowNull: false, fieldName: 'planetDegree' });
    if (degreeValidation.valid) {
      aspectAnalysis = analyzeAspects(normalizedDegrees, degreeValidation.value);
    }
  }

  // Calculate harmonic levels (important degree positions)
  const harmonicLevels = calculateHarmonicLevels(p, normalizedDegrees);

  return {
    price: p,
    degrees: {
      raw: Math.round(priceDegrees * 100) / 100,
      normalized: Math.round(normalizedDegrees * 100) / 100,
      segment,
      positionInSegment: Math.round(positionInSegment * 100) / 100
    },
    cardinalAnalysis: {
      nearCardinal,
      nearestCardinal: nearestCardinal.degree,
      degreesToNearest: Math.round(nearestCardinal.difference * 100) / 100,
      cardinalPrices
    },
    harmonicLevels,
    aspectAnalysis,
    wheelPosition: {
      quadrant: Math.floor(normalizedDegrees / 90) + 1,
      octant: Math.floor(normalizedDegrees / 45) + 1,
      description: getWheelDescription(normalizedDegrees)
    },
    meta: {
      method: 'gann_wheel_of_24',
      sqrtPrice: Math.round(sqrtPrice * 10000) / 10000,
      fractional: Math.round(fractional * 10000) / 10000
    }
  };
}

/**
 * Calculate prices at cardinal degree positions
 */
function calculateCardinalPrices(currentPrice, currentDegrees) {
  const sqrtPrice = Math.sqrt(currentPrice);
  const baseRoot = Math.floor(sqrtPrice);
  const fractional = currentDegrees / 360;

  const cardinals = {};

  for (const deg of [0, 90, 180, 270]) {
    // Calculate how many degrees to get to this cardinal
    let degreesToCardinal = deg - currentDegrees;
    if (degreesToCardinal < -180) degreesToCardinal += 360;
    if (degreesToCardinal > 180) degreesToCardinal -= 360;

    // Convert degrees to sqrt units
    const sqrtUnits = degreesToCardinal / 360;

    // Calculate price at this cardinal
    const targetSqrt = sqrtPrice + sqrtUnits;
    const targetPrice = targetSqrt * targetSqrt;

    cardinals[deg] = {
      price: Math.round(targetPrice * 100) / 100,
      degreesAway: Math.round(Math.abs(degreesToCardinal) * 100) / 100,
      direction: degreesToCardinal >= 0 ? 'higher' : 'lower',
      percentAway: Math.round(((targetPrice - currentPrice) / currentPrice) * 10000) / 100
    };
  }

  return cardinals;
}

/**
 * Analyze aspects between price degree and planet degree
 */
function analyzeAspects(priceDegrees, planetDegrees) {
  const aspects = [];

  for (const [aspectName, aspectDegrees] of Object.entries(ASPECT_DEGREES)) {
    const diff = Math.abs(priceDegrees - planetDegrees);
    const normalizedDiff = Math.min(diff, 360 - diff);

    const deviation = Math.abs(normalizedDiff - aspectDegrees);
    const orb = 8; // Degrees of tolerance

    if (deviation <= orb) {
      aspects.push({
        aspect: aspectName,
        exactDegrees: aspectDegrees,
        actualDiff: Math.round(normalizedDiff * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        strength: Math.round((1 - deviation / orb) * 100) / 100,
        isExact: deviation <= 2
      });
    }
  }

  // Sort by strength
  aspects.sort((a, b) => b.strength - a.strength);

  return {
    hasAspect: aspects.length > 0,
    aspects,
    priceDegrees: Math.round(priceDegrees * 100) / 100,
    planetDegrees,
    harmony: aspects.length > 0 ? (aspects[0].strength > 0.7 ? 'strong' : 'moderate') : 'none'
  };
}

/**
 * Calculate harmonic price levels
 */
function calculateHarmonicLevels(currentPrice, currentDegrees) {
  const levels = [];
  const sqrtPrice = Math.sqrt(currentPrice);

  // Key harmonic degrees
  const harmonicDegrees = [0, 45, 90, 120, 135, 180, 225, 270, 315, 360];

  for (const targetDeg of harmonicDegrees) {
    let degreeDiff = targetDeg - currentDegrees;
    if (degreeDiff < 0) degreeDiff += 360;

    const sqrtUnits = degreeDiff / 360;
    const targetSqrt = sqrtPrice + sqrtUnits;
    const targetPrice = targetSqrt * targetSqrt;

    levels.push({
      degrees: targetDeg,
      price: Math.round(targetPrice * 100) / 100,
      percentAway: Math.round(((targetPrice - currentPrice) / currentPrice) * 10000) / 100,
      type: getHarmonicType(targetDeg)
    });
  }

  return levels;
}

/**
 * Get harmonic type description
 */
function getHarmonicType(degrees) {
  if (degrees === 0 || degrees === 360) return 'full_rotation';
  if (degrees === 180) return 'opposition';
  if (degrees === 90 || degrees === 270) return 'square';
  if (degrees === 120 || degrees === 240) return 'trine';
  if (degrees === 45 || degrees === 135 || degrees === 225 || degrees === 315) return 'octile';
  return 'other';
}

/**
 * Get wheel position description
 */
function getWheelDescription(degrees) {
  if (degrees < 45) return 'Rising from 0° cardinal';
  if (degrees < 90) return 'Approaching 90° square';
  if (degrees < 135) return 'Past 90° square';
  if (degrees < 180) return 'Approaching 180° opposition';
  if (degrees < 225) return 'Past 180° opposition';
  if (degrees < 270) return 'Approaching 270° square';
  if (degrees < 315) return 'Past 270° square';
  return 'Approaching 360° full rotation';
}

// ============================================================
// TARGET CALCULATIONS
// ============================================================

/**
 * Calculate price targets based on Gann methods
 *
 * @param {number} currentPrice - Current price
 * @param {number} minPercent - Minimum target percentage (default 0.5%)
 * @param {number} maxPercent - Maximum target percentage (default 5%)
 * @returns {Object} Target calculations
 */
function calculateTargets(currentPrice, minPercent = 0.5, maxPercent = 5) {
  const validation = validatePrice(currentPrice);
  if (!validation.valid) {
    throw new Error(`calculateTargets: ${validation.error}`);
  }

  const p = validation.value;

  // Get Square of 9 analysis for support/resistance
  const sq9 = squareOf9(p);

  // Filter levels within percentage range
  const filterByPercent = (levels, direction) => {
    return levels.filter(level => {
      const pct = Math.abs(level.percentFromPrice);
      return pct >= minPercent && pct <= maxPercent;
    }).map(level => ({
      ...level,
      direction,
      source: 'square_of_9'
    }));
  };

  const sq9Supports = filterByPercent(sq9.supportLevels, 'support');
  const sq9Resistances = filterByPercent(sq9.resistanceLevels, 'resistance');

  // Get Wheel of 24 harmonic levels
  const wheel = wheelOf24(p);
  const harmonicTargets = wheel.harmonicLevels
    .filter(level => {
      const pct = Math.abs(level.percentAway);
      return pct >= minPercent && pct <= maxPercent;
    })
    .map(level => ({
      level: level.price,
      percentFromPrice: level.percentAway,
      direction: level.percentAway >= 0 ? 'resistance' : 'support',
      source: 'wheel_of_24',
      type: level.type,
      degrees: level.degrees
    }));

  // Calculate percentage-based targets
  const percentTargets = [];
  const percentIncrements = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

  for (const pct of percentIncrements) {
    if (pct >= minPercent && pct <= maxPercent) {
      percentTargets.push({
        level: Math.round(p * (1 + pct / 100) * 100) / 100,
        percentFromPrice: pct,
        direction: 'resistance',
        source: 'percentage'
      });
      percentTargets.push({
        level: Math.round(p * (1 - pct / 100) * 100) / 100,
        percentFromPrice: -pct,
        direction: 'support',
        source: 'percentage'
      });
    }
  }

  // Combine and sort all targets
  const allTargets = [
    ...sq9Supports,
    ...sq9Resistances,
    ...harmonicTargets,
    ...percentTargets
  ];

  // Separate into support and resistance
  const supports = allTargets
    .filter(t => t.direction === 'support')
    .sort((a, b) => b.level - a.level); // Closest first

  const resistances = allTargets
    .filter(t => t.direction === 'resistance')
    .sort((a, b) => a.level - b.level); // Closest first

  // Find key levels (where multiple methods agree)
  const keyLevels = findKeyLevels(allTargets, p);

  return {
    currentPrice: p,
    range: { minPercent, maxPercent },
    supports: supports.slice(0, 10),
    resistances: resistances.slice(0, 10),
    keyLevels,
    closestSupport: supports[0] || null,
    closestResistance: resistances[0] || null,
    meta: {
      method: 'gann_targets',
      sq9Levels: sq9Supports.length + sq9Resistances.length,
      harmonicLevels: harmonicTargets.length,
      percentLevels: percentTargets.length
    }
  };
}

/**
 * Find key levels where multiple methods converge
 */
function findKeyLevels(allTargets, currentPrice) {
  const tolerance = 0.005; // 0.5% tolerance for convergence
  const keyLevels = [];
  const checked = new Set();

  for (let i = 0; i < allTargets.length; i++) {
    if (checked.has(i)) continue;

    const target = allTargets[i];
    const convergingTargets = [target];
    checked.add(i);

    for (let j = i + 1; j < allTargets.length; j++) {
      if (checked.has(j)) continue;

      const other = allTargets[j];
      const pctDiff = Math.abs((target.level - other.level) / currentPrice);

      if (pctDiff <= tolerance) {
        convergingTargets.push(other);
        checked.add(j);
      }
    }

    if (convergingTargets.length >= 2) {
      // Multiple methods agree on this level
      const avgLevel = convergingTargets.reduce((sum, t) => sum + t.level, 0) / convergingTargets.length;
      const sources = [...new Set(convergingTargets.map(t => t.source))];

      keyLevels.push({
        level: Math.round(avgLevel * 100) / 100,
        convergence: convergingTargets.length,
        sources,
        direction: convergingTargets[0].direction,
        percentFromPrice: Math.round(((avgLevel - currentPrice) / currentPrice) * 10000) / 100,
        strength: Math.min(1, convergingTargets.length * 0.25 + sources.length * 0.15)
      });
    }
  }

  // Sort by strength
  keyLevels.sort((a, b) => b.strength - a.strength);

  return keyLevels;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Core functions
  squareOf9,
  analyzeCycles,
  analyzeAngles,
  wheelOf24,
  calculateTargets,

  // Constants (for external use)
  GANN_CYCLES,
  CARDINAL_DEGREES,
  ASPECT_DEGREES,
  DEFAULT_ANGLE_CONFIG
};


// ============================================================
// EXAMPLE USAGE (for testing)
// ============================================================

if (require.main === module) {
  console.log('\n=== GANN ENGINE EXAMPLES ===\n');

  // Example 1: Square of 9
  console.log('--- Square of 9 Analysis ---');
  const sq9Result = squareOf9(45000);
  console.log('Price: $45,000');
  console.log('Square Root:', sq9Result.squareRoot);
  console.log('Degree Position:', sq9Result.degreePosition + '°');
  console.log('Support Levels:');
  sq9Result.supportLevels.slice(0, 3).forEach(s =>
    console.log(`  $${s.level} (-${s.percentFromPrice}%)`)
  );
  console.log('Resistance Levels:');
  sq9Result.resistanceLevels.slice(0, 3).forEach(r =>
    console.log(`  $${r.level} (+${r.percentFromPrice}%)`)
  );
  console.log('Flags:', sq9Result.flags);

  // Example 2: Cycle Analysis
  console.log('\n--- Cycle Analysis ---');
  const historicalEvents = [
    { event_date: '2024-04-20', event_type: 'halving', description: 'BTC Halving', significance: 10 },
    { event_date: '2024-03-14', event_type: 'ath', description: 'Post-ETF ATH', significance: 8 },
    { event_date: '2022-11-09', event_type: 'crash', description: 'FTX Collapse', significance: 9 }
  ];
  const cycleResult = analyzeCycles(new Date(), historicalEvents);
  console.log('Major Cycle Hits:', cycleResult.totalMajorHits);
  console.log('Minor Cycle Hits:', cycleResult.totalMinorHits);
  console.log('Convergence Score:', cycleResult.convergenceScore);
  console.log('Cycle Bias:', cycleResult.cycleBias);

  // Example 3: Angle Analysis
  console.log('\n--- Angle Analysis ---');
  const mockPriceHistory = [
    { timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), close_price: 44000 },
    { timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000), close_price: 44200 },
    { timestamp: new Date(Date.now() - 16 * 60 * 60 * 1000), close_price: 44500 },
    { timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), close_price: 44800 },
    { timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), close_price: 44700 },
    { timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), close_price: 45100 },
    { timestamp: new Date(), close_price: 45000 }
  ];
  const angleResult = analyzeAngles(mockPriceHistory);
  console.log('Angle:', angleResult.angle.degrees + '°', angleResult.angle.direction);
  console.log('Nearest Gann Angle:', angleResult.angle.nearestGannAngle.name);
  console.log('Trend Strength:', angleResult.signals.trendStrength);
  console.log('Above 1x1 Angle:', angleResult.signals.aboveAngle);

  // Example 4: Wheel of 24
  console.log('\n--- Wheel of 24 ---');
  const wheelResult = wheelOf24(45000, 120); // With planet at 120°
  console.log('Price Degrees:', wheelResult.degrees.normalized + '°');
  console.log('Near Cardinal:', wheelResult.cardinalAnalysis.nearCardinal);
  console.log('Quadrant:', wheelResult.wheelPosition.quadrant);
  if (wheelResult.aspectAnalysis?.hasAspect) {
    console.log('Planetary Aspect:', wheelResult.aspectAnalysis.aspects[0]?.aspect);
    console.log('Harmony:', wheelResult.aspectAnalysis.harmony);
  }

  // Example 5: Calculate Targets
  console.log('\n--- Price Targets ---');
  const targets = calculateTargets(45000, 0.5, 3);
  console.log('Closest Support:', targets.closestSupport?.level);
  console.log('Closest Resistance:', targets.closestResistance?.level);
  console.log('Key Convergence Levels:', targets.keyLevels.length);
  if (targets.keyLevels[0]) {
    console.log('Strongest Key Level:', targets.keyLevels[0].level, 'from', targets.keyLevels[0].sources.join(', '));
  }

  console.log('\n=== END EXAMPLES ===\n');
}
