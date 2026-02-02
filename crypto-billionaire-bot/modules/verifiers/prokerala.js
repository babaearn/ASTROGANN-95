/**
 * PROKERALA VERIFIER
 * ===================
 * Human-facing verification using Prokerala Astrology API
 * Provides secondary verification for planetary positions
 *
 * API: https://api.prokerala.com/
 * This is a graceful fallback - if it fails, verification continues without it
 */

const logger = require('../../utils/logger');
const { PLANETS, VERIFICATION_TOLERANCES, ZODIAC_SIGNS } = require('../../config/constants');

// ============================================================
// CONFIGURATION
// ============================================================

const PROKERALA_API_URL = 'https://api.prokerala.com/v2/astrology';
const ENABLED = process.env.PROKERALA_ENABLED !== 'false';
const API_KEY = process.env.PROKERALA_API_KEY;

// Cache configuration
const CACHE_TTL = 1800000; // 30 minutes cache (Prokerala has rate limits)

// Retry configuration
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;

// In-memory cache
const cache = new Map();

// Default location (for calculations - using Mumbai/IST)
const DEFAULT_LOCATION = {
  latitude: 19.0760,
  longitude: 72.8777,
  timezone: 'Asia/Kolkata'
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if Prokerala is enabled and configured
 */
function isEnabled() {
  return ENABLED && !!API_KEY;
}

/**
 * Get cached data if not expired
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
 */
function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl
  });
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format date for Prokerala API (ISO format)
 */
function formatProkeralaDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * Convert Prokerala sign/degree to absolute longitude
 */
function signDegreeToLongitude(sign, degree, minute = 0) {
  // Find sign index
  const signIndex = ZODIAC_SIGNS.findIndex(
    s => s.name.toLowerCase() === sign.toLowerCase()
  );
  if (signIndex === -1) return null;

  return (signIndex * 30) + degree + (minute / 60);
}

/**
 * Parse planet data from Prokerala response
 */
function parsePlanetData(planetInfo) {
  if (!planetInfo) return null;

  try {
    // Prokerala returns position in sign + degree format
    const sign = planetInfo.sign?.name || planetInfo.rpiasi?.name;
    const degree = planetInfo.degree || 0;
    const minute = planetInfo.minute || 0;

    if (sign) {
      const longitude = signDegreeToLongitude(sign, degree, minute);
      return {
        sign,
        degreeInSign: degree + (minute / 60),
        longitude,
        isRetrograde: planetInfo.is_retrograde || false
      };
    }

    // Alternative: direct longitude if provided
    if (planetInfo.longitude !== undefined) {
      return {
        longitude: planetInfo.longitude,
        isRetrograde: planetInfo.is_retrograde || false
      };
    }

    return null;
  } catch (error) {
    logger.debug('Failed to parse Prokerala planet data', { error: error.message });
    return null;
  }
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Query Prokerala for planetary positions
 * @param {Date} date - Date/time for query
 * @param {Object} location - Optional location override
 * @returns {Promise<Object|null>}
 */
async function queryPlanetPositions(date, location = DEFAULT_LOCATION) {
  if (!isEnabled()) {
    logger.debug('Prokerala verification disabled or not configured');
    return null;
  }

  const cacheKey = `prokerala:planets:${date.toISOString()}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const datetime = formatProkeralaDate(date);

  // Build request params
  const params = new URLSearchParams({
    ayanamsa: '1', // Lahiri ayanamsa
    datetime,
    coordinates: `${location.latitude},${location.longitude}`,
    la: location.latitude.toString(),
    lo: location.longitude.toString()
  });

  const url = `${PROKERALA_API_URL}/planet-position?${params.toString()}`;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug('Prokerala API request', { attempt, datetime });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      if (response.status === 401) {
        logger.error('Prokerala API authentication failed');
        return null;
      }

      if (response.status === 429) {
        logger.warn('Prokerala rate limited');
        await sleep(5000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'ok' && !data.data) {
        throw new Error(data.message || 'Invalid response');
      }

      // Parse planet positions
      const positions = {};
      const planetData = data.data?.planet_position || data.data?.planets || [];

      for (const planet of planetData) {
        const name = planet.name?.toUpperCase() || planet.planet?.toUpperCase();
        if (name && PLANETS[name]) {
          const parsed = parsePlanetData(planet);
          if (parsed) {
            positions[name] = parsed;
          }
        }
      }

      const result = {
        source: 'prokerala',
        timestamp: datetime,
        positions,
        raw: data.data
      };

      setCache(cacheKey, result);
      logger.debug('Prokerala query successful', {
        planetsFound: Object.keys(positions).length
      });
      return result;

    } catch (error) {
      logger.warn('Prokerala API attempt failed', {
        attempt,
        error: error.message
      });

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  logger.warn('Prokerala verification unavailable');
  return null;
}

/**
 * Query Prokerala for Moon phase information
 * @param {Date} date - Date/time for query
 * @returns {Promise<Object|null>}
 */
async function queryMoonPhase(date) {
  if (!isEnabled()) {
    return null;
  }

  const cacheKey = `prokerala:moon:${date.toISOString().split('T')[0]}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const datetime = formatProkeralaDate(date);
  const params = new URLSearchParams({
    datetime,
    coordinates: `${DEFAULT_LOCATION.latitude},${DEFAULT_LOCATION.longitude}`
  });

  const url = `${PROKERALA_API_URL}/moon-phase?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const result = {
      source: 'prokerala',
      timestamp: datetime,
      phase: data.data?.phase || data.data?.moon_phase,
      illumination: data.data?.illumination,
      age: data.data?.age
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    logger.warn('Prokerala moon phase query failed', { error: error.message });
    return null;
  }
}

/**
 * Verify a planetary position against Prokerala
 * @param {string} planetKey - Planet key
 * @param {Date} date - Date/time
 * @param {number} expectedLongitude - Expected longitude from primary source
 * @returns {Promise<Object>}
 */
async function verifyPosition(planetKey, date, expectedLongitude) {
  if (!isEnabled()) {
    return {
      source: 'prokerala',
      status: 'disabled',
      confidence: null,
      delta: null,
      message: 'Prokerala verification is disabled or not configured'
    };
  }

  try {
    const prokeralaResult = await queryPlanetPositions(date);

    if (!prokeralaResult || !prokeralaResult.positions[planetKey]) {
      return {
        source: 'prokerala',
        status: 'unavailable',
        confidence: null,
        delta: null,
        message: `Could not fetch ${planetKey} data from Prokerala`
      };
    }

    const planetData = prokeralaResult.positions[planetKey];
    if (planetData.longitude === null || planetData.longitude === undefined) {
      return {
        source: 'prokerala',
        status: 'parse_error',
        confidence: null,
        delta: null,
        message: 'Could not parse longitude from Prokerala response'
      };
    }

    // Calculate difference
    let delta = Math.abs(planetData.longitude - expectedLongitude);
    // Handle wrap-around at 360°
    if (delta > 180) {
      delta = 360 - delta;
    }

    // Determine confidence level
    let confidence;
    if (delta <= VERIFICATION_TOLERANCES.HIGH) {
      confidence = 'HIGH';
    } else if (delta <= VERIFICATION_TOLERANCES.MEDIUM) {
      confidence = 'MEDIUM';
    } else if (delta <= VERIFICATION_TOLERANCES.LOW) {
      confidence = 'LOW';
    } else {
      confidence = 'FAIL';
    }

    return {
      source: 'prokerala',
      status: 'verified',
      confidence,
      delta: Math.round(delta * 10000) / 10000,
      expectedLongitude,
      actualLongitude: planetData.longitude,
      sign: planetData.sign,
      isRetrograde: planetData.isRetrograde,
      timestamp: prokeralaResult.timestamp,
      message: `Prokerala verification: ${confidence} (Δ${delta.toFixed(4)}°)`
    };

  } catch (error) {
    logger.error('Prokerala verification error', { error: error.message, planetKey });
    return {
      source: 'prokerala',
      status: 'error',
      confidence: null,
      delta: null,
      message: `Verification error: ${error.message}`
    };
  }
}

/**
 * Verify a major event
 * @param {Object} event - Event object
 * @returns {Promise<Object>}
 */
async function verifyMajorEvent(event) {
  if (!isEnabled()) {
    return {
      source: 'prokerala',
      status: 'disabled',
      verifications: [],
      overallConfidence: null
    };
  }

  const verifications = [];

  try {
    // Verify each planet involved
    const planets = event.planets || [];
    for (const planet of planets) {
      if (planet.key && planet.longitude !== undefined) {
        const verification = await verifyPosition(
          planet.key,
          new Date(event.timestamp),
          planet.longitude
        );
        verifications.push({
          planet: planet.key,
          ...verification
        });
      }
    }

    // Calculate overall confidence
    let overallConfidence = null;
    if (verifications.length > 0) {
      const confidences = verifications
        .filter(v => v.confidence)
        .map(v => v.confidence);

      if (confidences.length > 0) {
        const order = ['FAIL', 'LOW', 'MEDIUM', 'HIGH'];
        overallConfidence = confidences.reduce((lowest, current) => {
          return order.indexOf(current) < order.indexOf(lowest) ? current : lowest;
        }, 'HIGH');
      }
    }

    return {
      source: 'prokerala',
      status: verifications.length > 0 ? 'verified' : 'no_data',
      verifications,
      overallConfidence,
      eventType: event.type,
      timestamp: event.timestamp
    };

  } catch (error) {
    logger.error('Prokerala event verification error', { error: error.message });
    return {
      source: 'prokerala',
      status: 'error',
      verifications,
      overallConfidence: null,
      message: error.message
    };
  }
}

/**
 * Clear cache
 */
function clearCache() {
  cache.clear();
  logger.info('Prokerala cache cleared');
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  isEnabled,
  queryPlanetPositions,
  queryMoonPhase,
  verifyPosition,
  verifyMajorEvent,
  clearCache,
  // Constants
  DEFAULT_LOCATION
};
