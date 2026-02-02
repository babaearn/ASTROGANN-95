/**
 * JPL HORIZONS VERIFIER
 * ======================
 * Verification source using NASA JPL Horizons system
 * Used to verify major planetary events from Swiss Ephemeris
 *
 * API: https://ssd.jpl.nasa.gov/horizons/
 * This is a graceful fallback - if it fails, verification continues without it
 */

const logger = require('../../utils/logger');
const { PLANETS, VERIFICATION_TOLERANCES } = require('../../config/constants');

// ============================================================
// CONFIGURATION
// ============================================================

const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const ENABLED = process.env.HORIZONS_ENABLED !== 'false';
const CACHE_TTL = 3600000; // 1 hour cache

// Retry configuration
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;

// In-memory cache
const cache = new Map();

// JPL Horizons body IDs
const HORIZONS_BODY_IDS = {
  SUN: '10',
  MOON: '301',
  MERCURY: '199',
  VENUS: '299',
  MARS: '499',
  JUPITER: '599',
  SATURN: '699',
  URANUS: '799',
  NEPTUNE: '899',
  PLUTO: '999'
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if Horizons is enabled
 */
function isEnabled() {
  return ENABLED;
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
 * Format date for Horizons API (YYYY-Mon-DD HH:MM)
 */
function formatHorizonsDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = d.getUTCFullYear();
  const month = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${min}`;
}

/**
 * Parse ecliptic longitude from Horizons output
 * Horizons returns data in various formats; we extract longitude
 */
function parseEclipticLongitude(responseText, targetBody) {
  try {
    // Horizons output format varies, but typically includes
    // ObsEclLon (observed ecliptic longitude) in the ephemeris
    // Look for lines with numeric data after $$SOE marker

    const lines = responseText.split('\n');
    let inData = false;
    let dataLine = null;

    for (const line of lines) {
      if (line.includes('$$SOE')) {
        inData = true;
        continue;
      }
      if (line.includes('$$EOE')) {
        break;
      }
      if (inData && line.trim()) {
        dataLine = line;
        break; // Get first data line
      }
    }

    if (!dataLine) {
      return null;
    }

    // Parse the data line - format depends on request
    // For observer ephemeris: usually columns include RA, Dec, or ecliptic coords
    const parts = dataLine.trim().split(/\s+/);

    // Try to find ecliptic longitude (usually after date/time columns)
    // This is a simplified parser - real implementation would need
    // to handle the specific Horizons output format requested
    for (let i = 0; i < parts.length; i++) {
      const val = parseFloat(parts[i]);
      if (!isNaN(val) && val >= 0 && val < 360) {
        // Likely a longitude value
        return val;
      }
    }

    return null;
  } catch (error) {
    logger.debug('Failed to parse Horizons response', { error: error.message });
    return null;
  }
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Query JPL Horizons for planetary position
 * @param {string} planetKey - Planet key (e.g., 'MARS')
 * @param {Date} date - Date/time for query
 * @returns {Promise<Object|null>}
 */
async function queryPlanetPosition(planetKey, date) {
  if (!ENABLED) {
    logger.debug('Horizons verification disabled');
    return null;
  }

  const bodyId = HORIZONS_BODY_IDS[planetKey];
  if (!bodyId) {
    logger.debug('Unknown planet for Horizons', { planetKey });
    return null;
  }

  const cacheKey = `horizons:${planetKey}:${date.toISOString()}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const startTime = formatHorizonsDate(date);
  const endDate = new Date(date.getTime() + 60000); // +1 minute
  const stopTime = formatHorizonsDate(endDate);

  // Build Horizons API query
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${bodyId}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: "'500@399'", // Geocentric
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
    STEP_SIZE: "'1 m'",
    QUANTITIES: "'31'", // Ecliptic coordinates
    CAL_FORMAT: 'CAL',
    TIME_DIGITS: 'MINUTES',
    ANG_FORMAT: 'DEG',
    APPARENT: 'AIRLESS',
    RANGE_UNITS: 'AU',
    SUPPRESS_RANGE_RATE: 'NO',
    SKIP_DAYLT: 'NO',
    SOLAR_ELONG: "'0,180'",
    EXTRA_PREC: 'NO',
    CSV_FORMAT: 'NO'
  });

  const url = `${HORIZONS_API_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug('Horizons API request', { planetKey, attempt });

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/plain' },
        timeout: 15000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      // Check for error in response
      if (text.includes('No ephemeris') || text.includes('ERROR')) {
        throw new Error('Horizons returned error');
      }

      const longitude = parseEclipticLongitude(text, planetKey);

      if (longitude !== null) {
        const result = {
          source: 'horizons',
          planet: planetKey,
          timestamp: date.toISOString(),
          longitude,
          raw: text.substring(0, 500) // Store truncated raw for debugging
        };

        setCache(cacheKey, result);
        logger.debug('Horizons query successful', { planetKey, longitude });
        return result;
      }

      throw new Error('Could not parse longitude from response');

    } catch (error) {
      logger.warn('Horizons API attempt failed', {
        planetKey,
        attempt,
        error: error.message
      });

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  logger.warn('Horizons verification unavailable', { planetKey });
  return null;
}

/**
 * Verify a planetary position against Horizons
 * @param {string} planetKey - Planet key
 * @param {Date} date - Date/time
 * @param {number} expectedLongitude - Expected longitude from primary source
 * @returns {Promise<Object>}
 */
async function verifyPosition(planetKey, date, expectedLongitude) {
  if (!ENABLED) {
    return {
      source: 'horizons',
      status: 'disabled',
      confidence: null,
      delta: null,
      message: 'Horizons verification is disabled'
    };
  }

  try {
    const horizonsResult = await queryPlanetPosition(planetKey, date);

    if (!horizonsResult) {
      return {
        source: 'horizons',
        status: 'unavailable',
        confidence: null,
        delta: null,
        message: 'Could not fetch data from Horizons'
      };
    }

    // Calculate difference
    let delta = Math.abs(horizonsResult.longitude - expectedLongitude);
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
      source: 'horizons',
      status: 'verified',
      confidence,
      delta: Math.round(delta * 10000) / 10000,
      expectedLongitude,
      actualLongitude: horizonsResult.longitude,
      timestamp: horizonsResult.timestamp,
      message: `Horizons verification: ${confidence} (Δ${delta.toFixed(4)}°)`
    };

  } catch (error) {
    logger.error('Horizons verification error', { error: error.message, planetKey });
    return {
      source: 'horizons',
      status: 'error',
      confidence: null,
      delta: null,
      message: `Verification error: ${error.message}`
    };
  }
}

/**
 * Verify a major event (aspect, ingress, etc.)
 * @param {Object} event - Event object with type, planets, time, etc.
 * @returns {Promise<Object>}
 */
async function verifyMajorEvent(event) {
  if (!ENABLED) {
    return {
      source: 'horizons',
      status: 'disabled',
      verifications: [],
      overallConfidence: null
    };
  }

  const verifications = [];

  try {
    // Verify each planet involved in the event
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
        // Use lowest confidence as overall
        const order = ['FAIL', 'LOW', 'MEDIUM', 'HIGH'];
        overallConfidence = confidences.reduce((lowest, current) => {
          return order.indexOf(current) < order.indexOf(lowest) ? current : lowest;
        }, 'HIGH');
      }
    }

    return {
      source: 'horizons',
      status: verifications.length > 0 ? 'verified' : 'no_data',
      verifications,
      overallConfidence,
      eventType: event.type,
      timestamp: event.timestamp
    };

  } catch (error) {
    logger.error('Horizons event verification error', { error: error.message });
    return {
      source: 'horizons',
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
  logger.info('Horizons cache cleared');
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  isEnabled,
  queryPlanetPosition,
  verifyPosition,
  verifyMajorEvent,
  clearCache,
  // Constants for external use
  HORIZONS_BODY_IDS
};
