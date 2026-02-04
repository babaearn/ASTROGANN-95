/**
 * REVERSAL SCANNER MODULE
 * =======================
 * Billionaire-Level Multi-Ticker Reversal Detection
 *
 * Scans ALL Bybit perpetual tickers for:
 * - Gann Square of 9 cardinal angles (0°, 90°, 180°, 270°, 360°)
 * - Wheel of 24 quadrant boundaries
 * - Price-Time Square alignment (Time = Price)
 * - Planetary price level touches
 * - Multi-factor confluence zones
 */

const logger = require('../utils/logger');
const { bybitClient } = require('./bybit');
const gann = require('./gann');
const planetaryPrice = require('./planetaryPrice');

// ============================================================
// CONFIGURATION
// ============================================================

// Cardinal angle tolerance (degrees)
const CARDINAL_TOLERANCE = 5; // Within 5° of cardinal angle

// Price-Time alignment tolerance
const PRICE_TIME_TOLERANCE = 2; // 2% tolerance for price=time match

// Minimum 24h volume to consider (USD)
const MIN_VOLUME_24H = 10000000; // $10M

// Top coins to always include (even if low volume)
const PRIORITY_COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'BNB', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK'];

// Historical events for Price-Time Square (days since)
const MAJOR_EVENTS = [
  { name: 'BTC Halving 2024', date: new Date('2024-04-20'), asset: 'BTC' },
  { name: 'BTC ATH 2024', date: new Date('2024-03-14'), asset: 'BTC' },
  { name: 'FTX Crash', date: new Date('2022-11-09'), asset: 'ALL' },
  { name: 'Luna Crash', date: new Date('2022-05-09'), asset: 'ALL' },
  { name: 'COVID Crash', date: new Date('2020-03-12'), asset: 'ALL' },
  { name: 'BTC Halving 2020', date: new Date('2020-05-11'), asset: 'BTC' },
  { name: 'ETH Merge', date: new Date('2022-09-15'), asset: 'ETH' },
  { name: '2021 Bull Top', date: new Date('2021-11-10'), asset: 'ALL' },
  { name: '2017 Bull Top', date: new Date('2017-12-17'), asset: 'BTC' }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if degree is near a cardinal angle
 */
function isNearCardinal(degree, tolerance = CARDINAL_TOLERANCE) {
  const cardinals = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  const normalizedDeg = ((degree % 360) + 360) % 360;

  for (const cardinal of cardinals) {
    const diff = Math.abs(normalizedDeg - cardinal);
    const adjustedDiff = Math.min(diff, 360 - diff);
    if (adjustedDiff <= tolerance) {
      return {
        isNear: true,
        cardinal,
        distance: adjustedDiff,
        significance: cardinal % 90 === 0 ? 'major' : 'minor' // 0,90,180,270 are major
      };
    }
  }

  return { isNear: false };
}

/**
 * Calculate Price-Time Square for a given price and date
 * When Price = Time (days from event), major reversals occur
 */
function calculatePriceTimeSquare(price, eventDate, multiplier = 1) {
  const now = new Date();
  const daysSince = Math.floor((now - eventDate) / (1000 * 60 * 60 * 24));

  // Price-Time equivalents using various multipliers
  const priceTimeTargets = [
    { multiplier: 1, target: daysSince },
    { multiplier: 10, target: daysSince * 10 },
    { multiplier: 100, target: daysSince * 100 },
    { multiplier: 1000, target: daysSince * 1000 },
    { multiplier: 0.1, target: daysSince * 0.1 }
  ];

  // Check if current price is near any Price-Time target
  for (const pt of priceTimeTargets) {
    const percentDiff = Math.abs((price - pt.target) / pt.target * 100);
    if (percentDiff <= PRICE_TIME_TOLERANCE) {
      return {
        hasAlignment: true,
        daysSince,
        targetPrice: pt.target,
        multiplier: pt.multiplier,
        accuracy: 100 - percentDiff
      };
    }
  }

  // Find closest alignment
  const closest = priceTimeTargets.reduce((best, current) => {
    const diff = Math.abs(price - current.target);
    return diff < Math.abs(price - best.target) ? current : best;
  });

  return {
    hasAlignment: false,
    daysSince,
    closestTarget: closest.target,
    closestMultiplier: closest.multiplier,
    percentFromTarget: ((price - closest.target) / closest.target * 100)
  };
}

/**
 * Calculate reversal score for a coin
 */
function calculateReversalScore(analysis) {
  let score = 0;
  const factors = [];

  // 1. Gann Sq9 Cardinal (major: +30, minor: +15)
  if (analysis.gannCardinal?.isNear) {
    const points = analysis.gannCardinal.significance === 'major' ? 30 : 15;
    score += points;
    factors.push(`Sq9 ${analysis.gannCardinal.cardinal}° (${analysis.gannCardinal.distance.toFixed(1)}° away)`);
  }

  // 2. Wheel of 24 near boundary (+15)
  if (analysis.wheel24?.nearBoundary) {
    score += 15;
    factors.push(`W24 Q${analysis.wheel24.quadrant} edge`);
  }

  // 3. Price-Time Square alignment (+25)
  if (analysis.priceTimeSquare?.hasAlignment) {
    score += 25;
    factors.push(`PT Square: ${analysis.priceTimeSquare.daysSince}d = $${analysis.priceTimeSquare.targetPrice.toFixed(0)}`);
  }

  // 4. Planetary price level (+20)
  if (analysis.planetaryLevel?.isActive) {
    score += 20;
    factors.push(`${analysis.planetaryLevel.planet} @ ${analysis.planetaryLevel.longitude.toFixed(0)}°`);
  }

  // 5. High 24h change (volatility signal) (+10)
  if (Math.abs(analysis.change24h) > 5) {
    score += 10;
    factors.push(`Volatile: ${analysis.change24h.toFixed(1)}%`);
  }

  // 6. Near swing high/low on Sq9 (+15)
  if (analysis.gannFlags?.nearTop || analysis.gannFlags?.nearBottom) {
    score += 15;
    const flag = analysis.gannFlags.nearTop ? 'Near Top' : 'Near Bottom';
    factors.push(flag);
  }

  return {
    score,
    percentage: Math.min(100, score),
    factors,
    rating: score >= 60 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW'
  };
}

// ============================================================
// MAIN SCANNER
// ============================================================

/**
 * Scan all Bybit perpetual tickers for potential reversals
 */
async function scanAllTickers(options = {}) {
  const {
    minScore = 40,           // Minimum reversal score to include
    maxResults = 20,         // Maximum results to return
    includeAll = false       // Include all tickers regardless of volume
  } = options;

  logger.info('Starting multi-ticker reversal scan');
  const startTime = Date.now();

  try {
    // 1. Fetch all linear perpetual tickers
    const tickersData = await bybitClient.getTickers({ category: 'linear' });

    if (!tickersData?.list || tickersData.list.length === 0) {
      throw new Error('No tickers returned from Bybit');
    }

    // 2. Filter for USDT perpetuals with sufficient volume
    const eligibleTickers = tickersData.list.filter(ticker => {
      const symbol = ticker.symbol;
      if (!symbol.endsWith('USDT')) return false;

      // Always include priority coins
      const baseCoin = symbol.replace('USDT', '');
      if (PRIORITY_COINS.includes(baseCoin)) return true;

      // Check volume threshold
      if (includeAll) return true;
      return ticker.turnover24h >= MIN_VOLUME_24H;
    });

    logger.info(`Analyzing ${eligibleTickers.length} tickers`);

    // 3. Analyze each ticker
    const results = [];

    for (const ticker of eligibleTickers) {
      try {
        const symbol = ticker.symbol;
        const baseCoin = symbol.replace('USDT', '');
        const price = ticker.lastPrice;

        if (!price || price <= 0) continue;

        // Gann Square of 9 analysis
        const sq9 = gann.squareOf9(price);
        const gannCardinal = isNearCardinal(sq9.degreePosition);

        // Wheel of 24 analysis
        const wheel24 = gann.wheelOf24(price);
        const nearBoundary = wheel24.cardinalAnalysis?.nearCardinal || false;

        // Price-Time Square (check against relevant events)
        let bestPTSquare = null;
        for (const event of MAJOR_EVENTS) {
          if (event.asset !== 'ALL' && event.asset !== baseCoin) continue;

          const ptSquare = calculatePriceTimeSquare(price, event.date);
          if (ptSquare.hasAlignment) {
            bestPTSquare = { ...ptSquare, event: event.name };
            break;
          }
        }

        // Planetary price levels
        let planetaryLevel = { isActive: false };
        try {
          const ppLevels = planetaryPrice.calculatePlanetaryPriceLevels(price, baseCoin);
          if (ppLevels.activeZones?.length > 0) {
            const active = ppLevels.activeZones[0];
            planetaryLevel = {
              isActive: true,
              planet: active.planet,
              longitude: active.longitude,
              level: active.level
            };
          }
        } catch (e) {
          // Planetary module might not be available for all coins
        }

        // Build analysis object
        const analysis = {
          symbol,
          baseCoin,
          price,
          change24h: ticker.price24hPcnt,
          volume24h: ticker.turnover24h,
          gannCardinal,
          wheel24: {
            degree: wheel24.degrees?.normalized,
            quadrant: wheel24.wheelPosition?.quadrant,
            nearBoundary
          },
          priceTimeSquare: bestPTSquare,
          planetaryLevel,
          gannFlags: sq9.flags
        };

        // Calculate reversal score
        const reversalScore = calculateReversalScore(analysis);

        if (reversalScore.score >= minScore) {
          results.push({
            ...analysis,
            reversalScore
          });
        }

      } catch (err) {
        logger.debug(`Error analyzing ${ticker.symbol}`, { error: err.message });
      }
    }

    // 4. Sort by reversal score
    results.sort((a, b) => b.reversalScore.score - a.reversalScore.score);

    // 5. Limit results
    const topResults = results.slice(0, maxResults);

    const duration = Date.now() - startTime;
    logger.info('Reversal scan complete', {
      tickersAnalyzed: eligibleTickers.length,
      reversalsFound: results.length,
      topResultsReturned: topResults.length,
      durationMs: duration
    });

    return {
      timestamp: new Date().toISOString(),
      tickersScanned: eligibleTickers.length,
      reversalsFound: results.length,
      results: topResults,
      scanDurationMs: duration
    };

  } catch (error) {
    logger.error('Reversal scan failed', { error: error.message });
    throw error;
  }
}

/**
 * Scan for Price-Time Square alignments across all tickers
 */
async function scanPriceTimeAlignments() {
  logger.info('Scanning for Price-Time Square alignments');

  try {
    const tickersData = await bybitClient.getTickers({ category: 'linear' });
    const alignments = [];

    for (const ticker of tickersData.list) {
      if (!ticker.symbol.endsWith('USDT')) continue;

      const baseCoin = ticker.symbol.replace('USDT', '');
      const price = ticker.lastPrice;

      for (const event of MAJOR_EVENTS) {
        if (event.asset !== 'ALL' && event.asset !== baseCoin) continue;

        const ptSquare = calculatePriceTimeSquare(price, event.date);

        if (ptSquare.hasAlignment) {
          alignments.push({
            symbol: ticker.symbol,
            baseCoin,
            price,
            event: event.name,
            daysSince: ptSquare.daysSince,
            targetPrice: ptSquare.targetPrice,
            multiplier: ptSquare.multiplier,
            accuracy: ptSquare.accuracy.toFixed(1) + '%'
          });
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      alignmentsFound: alignments.length,
      alignments
    };

  } catch (error) {
    logger.error('Price-Time alignment scan failed', { error: error.message });
    throw error;
  }
}

/**
 * Get explanation of Gann methods
 */
function getGannExplanation() {
  return {
    squareOf9: {
      title: 'Square of 9 (Sq9)',
      description: 'Gann\'s spiral where price moves in 360° cycles around a central point.',
      keyPoints: [
        'Price at 0°/360° = Cycle completion → Major reversal zone',
        'Price at 90° = First quarter → Resistance turning point',
        'Price at 180° = Halfway point → Major support/resistance',
        'Price at 270° = Third quarter → Support turning point',
        'Cardinal angles (0, 90, 180, 270) are the MOST significant',
        '45° angles (45, 135, 225, 315) are secondary inflection points'
      ],
      trading: 'When price is within 5° of a cardinal angle, expect increased volatility and potential reversal.'
    },
    wheelOf24: {
      title: 'Wheel of 24',
      description: 'Divides the 360° price cycle into 24 equal sectors of 15° each.',
      quadrants: [
        'Q1 (0-90°): ACCUMULATION - Smart money buying, low volatility',
        'Q2 (90-180°): MARKUP - Trend accelerates, momentum builds',
        'Q3 (180-270°): DISTRIBUTION - Smart money selling, choppy',
        'Q4 (270-360°): DECLINE - Trend exhaustion, capitulation'
      ],
      trading: 'Quadrant boundaries (90°, 180°, 270°) often mark trend changes.'
    },
    priceTimeSquare: {
      title: 'Price-Time Square',
      description: 'Gann\'s most powerful concept: When PRICE = TIME, major reversals occur.',
      method: [
        'Count days from a major market event (halving, ATH, crash)',
        'Convert days to price using multipliers (1x, 10x, 100x, etc.)',
        'When current price equals the time value, price and time are "squared"',
        'This creates a powerful harmonic convergence for reversals'
      ],
      example: '300 days from halving × 100 = $30,000 target. If price hits $30,000 on day 300, major reversal likely.'
    }
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  scanAllTickers,
  scanPriceTimeAlignments,
  calculatePriceTimeSquare,
  calculateReversalScore,
  isNearCardinal,
  getGannExplanation,
  // Configuration
  CARDINAL_TOLERANCE,
  PRICE_TIME_TOLERANCE,
  MAJOR_EVENTS
};
