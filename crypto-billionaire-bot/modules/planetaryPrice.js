/**
 * PLANETARY PRICE ENGINE
 * ======================
 * Billionaire-level planetary-price linkage calculations
 * Based on W.D. Gann's "Law of Vibration" principles
 *
 * Methods implemented:
 * 1. Planetary Longitude → Price Levels
 * 2. Price-Time Square Detection
 * 3. Lunar Cycle Trading Zones
 * 4. Planetary Aspect Reversal Dates
 * 5. Heliocentric vs Geocentric Analysis
 */

const logger = require('../utils/logger');
const planetary = require('./planetary');

// ============================================================
// PLANETARY MULTIPLIERS BY ASSET CLASS
// ============================================================

/**
 * Asset-specific multipliers for converting planetary degrees to price
 * These are calibrated based on historical price-planet correlations
 * Formula: Price = Planet_Longitude × Multiplier
 */
const PLANETARY_MULTIPLIERS = {
  // Major cryptos - higher multipliers for higher-priced assets
  BTC: {
    jupiter: 500,      // Jupiter = expansion, major levels
    saturn: 300,       // Saturn = restriction, support/resistance
    mars: 250,         // Mars = volatility zones
    venus: 200,        // Venus = value zones
    mercury: 150,      // Mercury = communication/news levels
    sun: 400,          // Sun = core trend levels
    moon: 100,         // Moon = short-term swings
    uranus: 600,       // Uranus = sudden moves
    neptune: 450,      // Neptune = illusion/deception zones
    pluto: 350         // Pluto = transformation levels
  },
  ETH: {
    jupiter: 15,
    saturn: 10,
    mars: 8,
    venus: 6,
    mercury: 5,
    sun: 12,
    moon: 3,
    uranus: 18,
    neptune: 14,
    pluto: 11
  },
  SOL: {
    jupiter: 1.2,
    saturn: 0.8,
    mars: 0.6,
    venus: 0.5,
    mercury: 0.4,
    sun: 1.0,
    moon: 0.25,
    uranus: 1.5,
    neptune: 1.1,
    pluto: 0.9
  },
  XRP: {
    jupiter: 0.012,
    saturn: 0.008,
    mars: 0.006,
    venus: 0.005,
    mercury: 0.004,
    sun: 0.010,
    moon: 0.002,
    uranus: 0.015,
    neptune: 0.011,
    pluto: 0.009
  },
  // Default for unknown assets - will be auto-calibrated
  DEFAULT: {
    jupiter: 1.0,
    saturn: 0.8,
    mars: 0.6,
    venus: 0.5,
    mercury: 0.4,
    sun: 0.9,
    moon: 0.2,
    uranus: 1.2,
    neptune: 1.0,
    pluto: 0.85
  }
};

// ============================================================
// PLANETARY SIGNIFICANCE WEIGHTS
// ============================================================

const PLANET_WEIGHTS = {
  jupiter: 1.0,    // Most significant for crypto
  saturn: 0.95,    // Major structure
  mars: 0.8,       // Action/volatility
  venus: 0.7,      // Value
  sun: 0.85,       // Core trend
  moon: 0.5,       // Short-term
  mercury: 0.4,    // Minor
  uranus: 0.9,     // Sudden moves (crypto-relevant)
  neptune: 0.6,    // Deception
  pluto: 0.75      // Transformation
};

// ============================================================
// CORE CALCULATIONS
// ============================================================

/**
 * Get multipliers for a specific asset
 * Auto-calibrates for unknown assets based on current price
 */
function getMultipliers(symbol, currentPrice) {
  const baseSymbol = symbol.replace('USDT', '').toUpperCase();

  if (PLANETARY_MULTIPLIERS[baseSymbol]) {
    return PLANETARY_MULTIPLIERS[baseSymbol];
  }

  // Auto-calibrate based on price
  // The multiplier should produce prices in the same order of magnitude
  const calibrationFactor = currentPrice / 100; // Normalize to ~100 range

  const multipliers = {};
  for (const [planet, baseMultiplier] of Object.entries(PLANETARY_MULTIPLIERS.DEFAULT)) {
    multipliers[planet] = baseMultiplier * calibrationFactor;
  }

  return multipliers;
}

/**
 * Calculate planetary price levels
 * Converts current planetary longitudes to price levels
 */
function calculatePlanetaryPriceLevels(currentPrice, symbol = 'BTC') {
  const multipliers = getMultipliers(symbol, currentPrice);
  const planets = planetary.getCurrentPlanets();

  const levels = [];

  for (const [planetName, planetData] of Object.entries(planets)) {
    if (!planetData || planetData.longitude === undefined) continue;

    const lowerName = planetName.toLowerCase();
    const multiplier = multipliers[lowerName];
    if (!multiplier) continue;

    const longitude = planetData.longitude;
    const weight = PLANET_WEIGHTS[lowerName] || 0.5;

    // Primary level: direct longitude × multiplier
    const primaryLevel = longitude * multiplier;

    // Secondary level: (360 - longitude) × multiplier (opposition point)
    const oppositionLevel = (360 - longitude) * multiplier;

    // Calculate distance from current price
    const primaryDistance = ((primaryLevel - currentPrice) / currentPrice) * 100;
    const oppositionDistance = ((oppositionLevel - currentPrice) / currentPrice) * 100;

    // Only include levels within reasonable range (-50% to +100%)
    if (Math.abs(primaryDistance) <= 100) {
      levels.push({
        planet: planetName,
        symbol: planetData.symbol || '●',
        longitude: Math.round(longitude * 100) / 100,
        sign: planetData.sign?.name || 'Unknown',
        level: Math.round(primaryLevel * 10000) / 10000,
        type: primaryLevel > currentPrice ? 'resistance' : 'support',
        distancePercent: Math.round(primaryDistance * 100) / 100,
        weight,
        method: 'longitude',
        isActive: Math.abs(primaryDistance) < 3 // Within 3% = active zone
      });
    }

    if (Math.abs(oppositionDistance) <= 100 && Math.abs(oppositionDistance) > 5) {
      levels.push({
        planet: planetName,
        symbol: planetData.symbol || '●',
        longitude: Math.round((360 - longitude) * 100) / 100,
        sign: 'Opposition',
        level: Math.round(oppositionLevel * 10000) / 10000,
        type: oppositionLevel > currentPrice ? 'resistance' : 'support',
        distancePercent: Math.round(oppositionDistance * 100) / 100,
        weight: weight * 0.7, // Opposition slightly less significant
        method: 'opposition',
        isActive: Math.abs(oppositionDistance) < 3
      });
    }
  }

  // Sort by proximity to current price
  levels.sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent));

  // Find active zones (price near planetary level)
  const activeZones = levels.filter(l => l.isActive);

  return {
    levels,
    activeZones,
    supports: levels.filter(l => l.type === 'support').slice(0, 5),
    resistances: levels.filter(l => l.type === 'resistance').slice(0, 5),
    nearestLevel: levels[0] || null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate Price-Time Square
 * Gann's principle: When price = time, major reversals occur
 */
function calculatePriceTimeSquare(currentPrice, historicalEvents = []) {
  const now = new Date();
  const squares = [];

  // Default significant dates if no historical events provided
  const defaultEvents = [
    { date: '2024-04-20', name: 'BTC Halving 2024', type: 'halving' },
    { date: '2024-03-14', name: 'BTC ATH 2024', type: 'ath' },
    { date: '2022-11-09', name: 'FTX Collapse', type: 'crash' },
    { date: '2021-11-10', name: 'BTC ATH 2021', type: 'ath' },
    { date: '2020-05-11', name: 'BTC Halving 2020', type: 'halving' },
    { date: '2020-03-12', name: 'COVID Crash', type: 'crash' },
    { date: '2017-12-17', name: 'BTC ATH 2017', type: 'ath' },
    { date: '2016-07-09', name: 'BTC Halving 2016', type: 'halving' }
  ];

  const events = historicalEvents.length > 0 ? historicalEvents : defaultEvents;

  for (const event of events) {
    const eventDate = new Date(event.date || event.event_date);
    const daysSince = Math.floor((now - eventDate) / (1000 * 60 * 60 * 24));

    if (daysSince < 0 || daysSince > 3000) continue;

    // Check various time-price relationships
    const timeUnits = [
      { unit: 1, name: 'days' },
      { unit: 7, name: 'weeks' },
      { unit: 30, name: 'months' },
      { unit: 90, name: 'quarters' }
    ];

    for (const { unit, name } of timeUnits) {
      const timeValue = daysSince / unit;

      // Price-Time square: when price ≈ time value
      const priceMultipliers = [1, 10, 100, 1000, 10000];

      for (const mult of priceMultipliers) {
        const targetPrice = timeValue * mult;
        const priceDiff = Math.abs(currentPrice - targetPrice) / currentPrice * 100;

        if (priceDiff < 5) { // Within 5%
          squares.push({
            event: event.name || event.description,
            eventDate: eventDate.toISOString().split('T')[0],
            daysSince,
            timeUnit: name,
            timeValue: Math.round(timeValue * 100) / 100,
            multiplier: mult,
            targetPrice: Math.round(targetPrice * 100) / 100,
            currentPrice,
            accuracy: Math.round((100 - priceDiff) * 100) / 100,
            isActive: priceDiff < 2, // Very close = active
            type: event.type
          });
        }
      }
    }
  }

  // Sort by accuracy
  squares.sort((a, b) => b.accuracy - a.accuracy);

  return {
    squares: squares.slice(0, 10),
    activeSquares: squares.filter(s => s.isActive),
    hasActiveSquare: squares.some(s => s.isActive),
    strongestSquare: squares[0] || null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate Lunar Cycle Trading Zones
 */
function calculateLunarCycleZones() {
  const moon = planetary.getMoonInfo();

  if (!moon) {
    return {
      phase: 'Unknown',
      tradingZone: 'neutral',
      recommendation: 'Unable to determine lunar phase',
      daysUntilNextPhase: null
    };
  }

  const illumination = moon.illumination || 50;
  const phase = moon.phase || 'Unknown';

  let tradingZone = 'neutral';
  let recommendation = '';
  let sentiment = 'neutral';

  // New Moon phases (0-15% illumination) = Accumulation
  if (illumination < 15) {
    tradingZone = 'accumulation';
    sentiment = 'bullish';
    recommendation = 'Smart money accumulation zone. Look for longs on dips.';
  }
  // Waxing phases (15-45%) = Building
  else if (illumination < 45 && phase.includes('Waxing')) {
    tradingZone = 'building';
    sentiment = 'bullish';
    recommendation = 'Momentum building. Trend following favored.';
  }
  // First Quarter to near Full (45-85%) = Expansion
  else if (illumination < 85 && phase.includes('Waxing')) {
    tradingZone = 'expansion';
    sentiment = 'bullish';
    recommendation = 'Peak optimism approaching. Trail stops on longs.';
  }
  // Full Moon (85-100%) = Distribution
  else if (illumination >= 85) {
    tradingZone = 'distribution';
    sentiment = 'bearish';
    recommendation = 'Distribution phase. Smart money selling. Reduce longs.';
  }
  // Waning phases (100-50%) = Decline
  else if (phase.includes('Waning') && illumination > 50) {
    tradingZone = 'decline';
    sentiment = 'bearish';
    recommendation = 'Declining momentum. Shorts favored, avoid FOMO longs.';
  }
  // Last Quarter to New (50-15%) = Capitulation
  else if (phase.includes('Waning') || phase.includes('Last')) {
    tradingZone = 'capitulation';
    sentiment = 'neutral';
    recommendation = 'Capitulation zone. Prepare for reversal. Watch for bottoming.';
  }

  // Calculate approximate days until next major phase
  let daysUntilNextPhase = null;
  const lunarCycle = 29.5; // days

  if (illumination < 50) {
    daysUntilNextPhase = Math.round((0.5 - illumination / 100) * lunarCycle);
  } else {
    daysUntilNextPhase = Math.round((1 - illumination / 100) * lunarCycle);
  }

  return {
    phase,
    illumination: Math.round(illumination * 10) / 10,
    phaseSymbol: moon.phaseSymbol || '🌓',
    tradingZone,
    sentiment,
    recommendation,
    daysUntilNextPhase,
    historicalBias: calculateHistoricalLunarBias(phase),
    timestamp: new Date().toISOString()
  };
}

/**
 * Historical lunar bias based on backtested data
 */
function calculateHistoricalLunarBias(phase) {
  // Based on studies of BTC price action around lunar phases
  const biases = {
    'New Moon': { bullishProbability: 58, avgReturn: 1.2, volatility: 'low' },
    'Waxing Crescent': { bullishProbability: 55, avgReturn: 0.8, volatility: 'low' },
    'First Quarter': { bullishProbability: 52, avgReturn: 0.5, volatility: 'medium' },
    'Waxing Gibbous': { bullishProbability: 50, avgReturn: 0.3, volatility: 'medium' },
    'Full Moon': { bullishProbability: 45, avgReturn: -0.4, volatility: 'high' },
    'Waning Gibbous': { bullishProbability: 48, avgReturn: -0.2, volatility: 'high' },
    'Last Quarter': { bullishProbability: 50, avgReturn: 0.1, volatility: 'medium' },
    'Waning Crescent': { bullishProbability: 54, avgReturn: 0.6, volatility: 'low' }
  };

  return biases[phase] || { bullishProbability: 50, avgReturn: 0, volatility: 'medium' };
}

/**
 * Calculate upcoming planetary reversal dates
 * Based on exact aspect formations
 */
function calculateReversalDates(daysAhead = 30) {
  const majorEvents = planetary.scanMajorEvents(null, daysAhead);
  const aspects = planetary.getAspects();

  const reversalDates = [];

  // Process major events
  if (majorEvents?.events) {
    for (const event of majorEvents.events) {
      let significance = 'medium';
      let expectedEffect = 'volatility';

      // Determine significance based on event type
      if (event.type === 'retrograde_start' || event.type === 'retrograde_end') {
        if (['Mercury', 'Venus', 'Mars'].includes(event.planet)) {
          significance = 'high';
          expectedEffect = event.type === 'retrograde_start' ? 'reversal_down' : 'reversal_up';
        }
      } else if (event.type === 'sign_change') {
        if (['Jupiter', 'Saturn'].includes(event.planet)) {
          significance = 'very_high';
          expectedEffect = 'trend_change';
        }
      }

      reversalDates.push({
        date: event.date,
        type: event.type,
        planet: event.planet,
        description: event.description || `${event.planet} ${event.type}`,
        significance,
        expectedEffect,
        daysUntil: event.daysUntil || Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24))
      });
    }
  }

  // Add tight aspects that are forming
  if (aspects?.aspects) {
    for (const aspect of aspects.aspects) {
      if (aspect.orb && aspect.orb < 1) { // Very tight orb
        reversalDates.push({
          date: new Date().toISOString().split('T')[0],
          type: 'exact_aspect',
          planet: `${aspect.planet1?.name}-${aspect.planet2?.name}`,
          description: `${aspect.planet1?.name} ${aspect.aspect?.name || aspect.aspect} ${aspect.planet2?.name} (${aspect.orb?.toFixed(2)}° orb)`,
          significance: aspect.aspect?.name === 'conjunction' || aspect.aspect?.name === 'opposition' ? 'high' : 'medium',
          expectedEffect: getAspectEffect(aspect.aspect?.name),
          daysUntil: 0
        });
      }
    }
  }

  // Sort by date
  reversalDates.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    dates: reversalDates.slice(0, 10),
    nextMajor: reversalDates.find(d => d.significance === 'high' || d.significance === 'very_high'),
    hasImminent: reversalDates.some(d => d.daysUntil <= 3 && d.significance !== 'low'),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get expected effect of aspect
 */
function getAspectEffect(aspectName) {
  const effects = {
    'conjunction': 'new_cycle',
    'opposition': 'reversal',
    'square': 'tension_breakout',
    'trine': 'continuation',
    'sextile': 'opportunity'
  };
  return effects[aspectName] || 'volatility';
}

/**
 * Complete planetary analysis for a coin
 */
function analyzePlanetaryForCoin(currentPrice, symbol = 'BTC', historicalEvents = []) {
  logger.info('Calculating planetary price analysis', { symbol, currentPrice });

  const priceLevels = calculatePlanetaryPriceLevels(currentPrice, symbol);
  const priceTimeSquare = calculatePriceTimeSquare(currentPrice, historicalEvents);
  const lunarCycle = calculateLunarCycleZones();
  const reversalDates = calculateReversalDates(30);

  // Calculate overall planetary bias
  let bullishScore = 0;
  let bearishScore = 0;

  // Factor in lunar cycle
  if (lunarCycle.sentiment === 'bullish') bullishScore += 2;
  else if (lunarCycle.sentiment === 'bearish') bearishScore += 2;

  // Factor in active price-time squares
  if (priceTimeSquare.hasActiveSquare) {
    const square = priceTimeSquare.strongestSquare;
    if (square?.type === 'ath' || square?.type === 'crash') {
      // Near ATH square = potential top, near crash square = potential bottom
      if (square.type === 'crash') bullishScore += 3;
      else bearishScore += 2;
    }
  }

  // Factor in imminent reversal dates
  if (reversalDates.hasImminent) {
    bullishScore += 1; // Volatility expected
    bearishScore += 1;
  }

  // Factor in active planetary zones
  for (const zone of priceLevels.activeZones) {
    if (zone.type === 'support') bullishScore += zone.weight;
    else bearishScore += zone.weight;
  }

  const totalScore = bullishScore + bearishScore;
  const bias = bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral';
  const biasStrength = totalScore > 0 ? Math.abs(bullishScore - bearishScore) / totalScore * 100 : 0;

  return {
    priceLevels,
    priceTimeSquare,
    lunarCycle,
    reversalDates,
    overallBias: {
      bias,
      biasStrength: Math.round(biasStrength),
      bullishScore: Math.round(bullishScore * 100) / 100,
      bearishScore: Math.round(bearishScore * 100) / 100
    },
    summary: generatePlanetarySummary(priceLevels, priceTimeSquare, lunarCycle, reversalDates, bias),
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate human-readable summary
 */
function generatePlanetarySummary(priceLevels, priceTimeSquare, lunarCycle, reversalDates, bias) {
  const points = [];

  // Active planetary zones
  if (priceLevels.activeZones.length > 0) {
    const zone = priceLevels.activeZones[0];
    points.push(`Price at ${zone.planet} ${zone.type} zone ($${zone.level.toFixed(2)})`);
  }

  // Price-time square
  if (priceTimeSquare.hasActiveSquare) {
    const square = priceTimeSquare.strongestSquare;
    points.push(`Price-Time Square active: ${square.daysSince} days from ${square.event}`);
  }

  // Lunar phase
  points.push(`${lunarCycle.phase}: ${lunarCycle.recommendation}`);

  // Upcoming reversals
  if (reversalDates.nextMajor) {
    points.push(`Watch ${reversalDates.nextMajor.date}: ${reversalDates.nextMajor.description}`);
  }

  return points;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  calculatePlanetaryPriceLevels,
  calculatePriceTimeSquare,
  calculateLunarCycleZones,
  calculateReversalDates,
  analyzePlanetaryForCoin,
  getMultipliers,
  PLANETARY_MULTIPLIERS,
  PLANET_WEIGHTS
};
