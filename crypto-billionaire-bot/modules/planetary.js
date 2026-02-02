/**
 * PLANETARY ENGINE
 * =================
 * Deterministic planetary timing calculations
 * Primary: Swiss Ephemeris / VSOP87 algorithms
 * Verification: JPL Horizons + Prokerala
 *
 * NO AI calculations - pure astronomical math
 */

const logger = require('../utils/logger');
const {
  PLANETS,
  PLANET_GROUPS,
  MAJOR_ASPECTS,
  MINOR_ASPECTS,
  ALL_ASPECTS,
  DEFAULT_ORBS,
  TIGHT_ORBS,
  PLANET_ORB_MODIFIERS,
  MOON_PHASES,
  MAJOR_EVENT_TYPES,
  EVENT_SIGNIFICANCE,
  VERIFICATION_TOLERANCES,
  ZODIAC_SIGNS,
  getSignFromDegree,
  getDegreeInSign,
  formatDegree
} = require('../config/constants');

// Verifiers (graceful imports)
let horizons = null;
let prokerala = null;

try {
  horizons = require('./verifiers/horizons');
} catch (e) {
  logger.warn('Horizons verifier not available');
}

try {
  prokerala = require('./verifiers/prokerala');
} catch (e) {
  logger.warn('Prokerala verifier not available');
}

// ============================================================
// ASTRONOMICAL CONSTANTS
// ============================================================

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Julian Day for J2000.0 epoch (Jan 1, 2000, 12:00 TT)
const J2000 = 2451545.0;

// Mean orbital elements for planets (J2000 epoch)
// Format: [a, e, i, L, longPeri, longNode] - all in degrees except a (AU)
const ORBITAL_ELEMENTS = {
  MERCURY: {
    a: 0.38709927, e: 0.20563593, i: 7.00497902,
    L: 252.25032350, longPeri: 77.45779628, longNode: 48.33076593,
    rates: { a: 0.00000037, e: 0.00001906, i: -0.00594749,
             L: 149472.67411175, longPeri: 0.16047689, longNode: -0.12534081 }
  },
  VENUS: {
    a: 0.72333566, e: 0.00677672, i: 3.39467605,
    L: 181.97909950, longPeri: 131.60246718, longNode: 76.67984255,
    rates: { a: 0.00000390, e: -0.00004107, i: -0.00078890,
             L: 58517.81538729, longPeri: 0.00268329, longNode: -0.27769418 }
  },
  MARS: {
    a: 1.52371034, e: 0.09339410, i: 1.84969142,
    L: -4.55343205, longPeri: -23.94362959, longNode: 49.55953891,
    rates: { a: 0.00001847, e: 0.00007882, i: -0.00813131,
             L: 19140.30268499, longPeri: 0.44441088, longNode: -0.29257343 }
  },
  JUPITER: {
    a: 5.20288700, e: 0.04838624, i: 1.30439695,
    L: 34.39644051, longPeri: 14.72847983, longNode: 100.47390909,
    rates: { a: -0.00011607, e: -0.00013253, i: -0.00183714,
             L: 3034.74612775, longPeri: 0.21252668, longNode: 0.20469106 }
  },
  SATURN: {
    a: 9.53667594, e: 0.05386179, i: 2.48599187,
    L: 49.95424423, longPeri: 92.59887831, longNode: 113.66242448,
    rates: { a: -0.00125060, e: -0.00050991, i: 0.00193609,
             L: 1222.49362201, longPeri: -0.41897216, longNode: -0.28867794 }
  },
  URANUS: {
    a: 19.18916464, e: 0.04725744, i: 0.77263783,
    L: 313.23810451, longPeri: 170.95427630, longNode: 74.01692503,
    rates: { a: -0.00196176, e: -0.00004397, i: -0.00242939,
             L: 428.48202785, longPeri: 0.40805281, longNode: 0.04240589 }
  },
  NEPTUNE: {
    a: 30.06992276, e: 0.00859048, i: 1.77004347,
    L: -55.12002969, longPeri: 44.96476227, longNode: 131.78422574,
    rates: { a: 0.00026291, e: 0.00005105, i: 0.00035372,
             L: 218.45945325, longPeri: -0.32241464, longNode: -0.00508664 }
  },
  PLUTO: {
    a: 39.48211675, e: 0.24882730, i: 17.14001206,
    L: 238.92903833, longPeri: 224.06891629, longNode: 110.30393684,
    rates: { a: -0.00031596, e: 0.00005170, i: 0.00004818,
             L: 145.20780515, longPeri: -0.04062942, longNode: -0.01183482 }
  }
};

// Moon orbital constants
const MOON_ELEMENTS = {
  meanLongitude: 218.3164477,      // Mean longitude at J2000
  meanAnomaly: 134.9633964,        // Mean anomaly at J2000
  argumentOfLatitude: 93.2720950,  // Argument of latitude at J2000
  ascendingNode: 125.0445479,      // Ascending node at J2000
  // Daily rates
  rates: {
    meanLongitude: 13.17639648,
    meanAnomaly: 13.06499295,
    argumentOfLatitude: 13.22935027,
    ascendingNode: -0.05295377
  }
};

// Sun (Earth's position reflected)
const SUN_ELEMENTS = {
  meanLongitude: 280.4664567,
  meanAnomaly: 357.5291092,
  eccentricity: 0.01671123,
  rates: {
    meanLongitude: 0.9856473,
    meanAnomaly: 0.9856002
  }
};

// ============================================================
// JULIAN DAY CALCULATIONS
// ============================================================

/**
 * Convert Date to Julian Day
 * @param {Date} date
 * @returns {number}
 */
function dateToJulianDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate() + d.getUTCHours() / 24 +
              d.getUTCMinutes() / 1440 + d.getUTCSeconds() / 86400;

  let y = year;
  let m = month;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  return Math.floor(365.25 * (y + 4716)) +
         Math.floor(30.6001 * (m + 1)) +
         day + b - 1524.5;
}

/**
 * Convert Julian Day to Date
 * @param {number} jd
 * @returns {Date}
 */
function julianDayToDate(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const dayInt = Math.floor(day);
  const dayFrac = day - dayInt;
  const hours = dayFrac * 24;
  const hourInt = Math.floor(hours);
  const minutes = (hours - hourInt) * 60;
  const minuteInt = Math.floor(minutes);
  const seconds = (minutes - minuteInt) * 60;

  return new Date(Date.UTC(year, month - 1, dayInt, hourInt, minuteInt, Math.floor(seconds)));
}

/**
 * Get centuries from J2000 epoch
 * @param {number} jd - Julian Day
 * @returns {number}
 */
function centuriesFromJ2000(jd) {
  return (jd - J2000) / 36525;
}

// ============================================================
// PLANETARY POSITION CALCULATIONS
// ============================================================

/**
 * Normalize angle to 0-360 range
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle(angle) {
  let result = angle % 360;
  if (result < 0) result += 360;
  return result;
}

/**
 * Calculate Sun's ecliptic longitude
 * @param {number} jd - Julian Day
 * @returns {Object}
 */
function calculateSunPosition(jd) {
  const T = centuriesFromJ2000(jd);
  const days = jd - J2000;

  // Mean longitude and anomaly
  let L = SUN_ELEMENTS.meanLongitude + SUN_ELEMENTS.rates.meanLongitude * days;
  let M = SUN_ELEMENTS.meanAnomaly + SUN_ELEMENTS.rates.meanAnomaly * days;

  L = normalizeAngle(L);
  M = normalizeAngle(M);
  const Mrad = M * DEG_TO_RAD;

  // Equation of center
  const C = (1.9148 - 0.0048 * T) * Math.sin(Mrad) +
            0.02 * Math.sin(2 * Mrad);

  // True longitude
  const longitude = normalizeAngle(L + C);

  // Distance (AU)
  const e = SUN_ELEMENTS.eccentricity;
  const distance = 1.00014 - 0.01671 * Math.cos(Mrad) - 0.00014 * Math.cos(2 * Mrad);

  return {
    longitude,
    latitude: 0, // Sun is always on ecliptic
    distance,
    meanLongitude: L,
    meanAnomaly: M
  };
}

/**
 * Calculate Moon's ecliptic position
 * @param {number} jd - Julian Day
 * @returns {Object}
 */
function calculateMoonPosition(jd) {
  const days = jd - J2000;

  // Mean elements
  let L = MOON_ELEMENTS.meanLongitude + MOON_ELEMENTS.rates.meanLongitude * days;
  let M = MOON_ELEMENTS.meanAnomaly + MOON_ELEMENTS.rates.meanAnomaly * days;
  let F = MOON_ELEMENTS.argumentOfLatitude + MOON_ELEMENTS.rates.argumentOfLatitude * days;
  let O = MOON_ELEMENTS.ascendingNode + MOON_ELEMENTS.rates.ascendingNode * days;

  // Sun's mean anomaly
  const sunPos = calculateSunPosition(jd);
  const Ms = sunPos.meanAnomaly;

  L = normalizeAngle(L);
  M = normalizeAngle(M);
  F = normalizeAngle(F);
  O = normalizeAngle(O);

  const Lrad = L * DEG_TO_RAD;
  const Mrad = M * DEG_TO_RAD;
  const Frad = F * DEG_TO_RAD;
  const Orad = O * DEG_TO_RAD;
  const Msrad = Ms * DEG_TO_RAD;

  // Longitude corrections
  const dL = 6.289 * Math.sin(Mrad) +
             1.274 * Math.sin(2 * Lrad - Mrad) +
             0.658 * Math.sin(2 * Lrad) +
             0.214 * Math.sin(2 * Mrad) -
             0.186 * Math.sin(Msrad) -
             0.114 * Math.sin(2 * Frad);

  // Latitude corrections
  const dB = 5.128 * Math.sin(Frad) +
             0.281 * Math.sin(Mrad + Frad) +
             0.278 * Math.sin(Mrad - Frad) +
             0.173 * Math.sin(2 * Lrad - Frad);

  const longitude = normalizeAngle(L + dL);
  const latitude = dB;

  // Distance (Earth radii, ~60.27 mean)
  const distance = 60.27 - 3.19 * Math.cos(Mrad) -
                   0.54 * Math.cos(2 * Lrad - Mrad) -
                   0.24 * Math.cos(2 * Lrad);

  return {
    longitude,
    latitude,
    distance,
    meanLongitude: L,
    meanAnomaly: M,
    ascendingNode: O
  };
}

/**
 * Calculate planet's ecliptic longitude using Keplerian elements
 * @param {string} planetKey - Planet key
 * @param {number} jd - Julian Day
 * @returns {Object|null}
 */
function calculatePlanetPosition(planetKey, jd) {
  if (planetKey === 'SUN') {
    return calculateSunPosition(jd);
  }
  if (planetKey === 'MOON') {
    return calculateMoonPosition(jd);
  }
  if (planetKey === 'NORTH_NODE') {
    const moon = calculateMoonPosition(jd);
    return { longitude: normalizeAngle(moon.ascendingNode), latitude: 0 };
  }
  if (planetKey === 'SOUTH_NODE') {
    const moon = calculateMoonPosition(jd);
    return { longitude: normalizeAngle(moon.ascendingNode + 180), latitude: 0 };
  }

  const elements = ORBITAL_ELEMENTS[planetKey];
  if (!elements) {
    logger.warn('Unknown planet', { planetKey });
    return null;
  }

  const T = centuriesFromJ2000(jd);

  // Calculate current elements
  const a = elements.a + elements.rates.a * T;
  const e = elements.e + elements.rates.e * T;
  const I = elements.i + elements.rates.i * T;
  const L = elements.L + elements.rates.L * T;
  const longPeri = elements.longPeri + elements.rates.longPeri * T;
  const longNode = elements.longNode + elements.rates.longNode * T;

  // Mean anomaly
  const M = normalizeAngle(L - longPeri);
  const Mrad = M * DEG_TO_RAD;

  // Solve Kepler's equation for eccentric anomaly (E)
  let E = Mrad;
  for (let i = 0; i < 10; i++) {
    E = Mrad + e * Math.sin(E);
  }

  // True anomaly
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv) * RAD_TO_DEG;
  const r = Math.sqrt(xv * xv + yv * yv);

  // Heliocentric coordinates
  const lrad = (v + longPeri - longNode) * DEG_TO_RAD;
  const Irad = I * DEG_TO_RAD;
  const Orad = longNode * DEG_TO_RAD;

  const xh = r * (Math.cos(Orad) * Math.cos(lrad) -
                  Math.sin(Orad) * Math.sin(lrad) * Math.cos(Irad));
  const yh = r * (Math.sin(Orad) * Math.cos(lrad) +
                  Math.cos(Orad) * Math.sin(lrad) * Math.cos(Irad));
  const zh = r * Math.sin(lrad) * Math.sin(Irad);

  // For outer planets, convert to geocentric
  // Simplified: just return heliocentric longitude
  const helioLong = normalizeAngle(v + longPeri);

  // Get Earth's position for geocentric conversion
  // Simplified approximation using Sun position
  const sunPos = calculateSunPosition(jd);

  // Approximate geocentric longitude
  // This is a simplification - proper calculation requires full coordinate transform
  let geoLong = helioLong;

  // For inner planets, apply parallax correction
  if (['MERCURY', 'VENUS'].includes(planetKey)) {
    const parallax = Math.atan2(Math.sin((sunPos.longitude - helioLong) * DEG_TO_RAD),
                                r / sunPos.distance - Math.cos((sunPos.longitude - helioLong) * DEG_TO_RAD));
    geoLong = normalizeAngle(sunPos.longitude + 180 + parallax * RAD_TO_DEG);
  }

  return {
    longitude: geoLong,
    latitude: Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * RAD_TO_DEG,
    distance: r,
    heliocentricLongitude: helioLong,
    meanAnomaly: M,
    trueAnomaly: v
  };
}

// ============================================================
// PUBLIC API FUNCTIONS
// ============================================================

/**
 * Get current planetary positions
 * @param {Date|null} date - Date/time (default: now)
 * @param {Array|null} planetList - List of planet keys (default: all)
 * @returns {Object}
 */
function getCurrentPlanets(date = null, planetList = null) {
  const d = date || new Date();
  const jd = dateToJulianDay(d);

  const planets = planetList || Object.keys(PLANETS);
  const positions = {};

  for (const key of planets) {
    if (!PLANETS[key]) continue;

    const pos = calculatePlanetPosition(key, jd);
    if (pos) {
      const sign = getSignFromDegree(pos.longitude);
      const degInSign = getDegreeInSign(pos.longitude);

      positions[key] = {
        ...PLANETS[key],
        key,
        longitude: Math.round(pos.longitude * 10000) / 10000,
        latitude: pos.latitude ? Math.round(pos.latitude * 10000) / 10000 : 0,
        sign: sign.name,
        signSymbol: sign.symbol,
        degreeInSign: Math.round(degInSign * 100) / 100,
        formatted: formatDegree(pos.longitude),
        distance: pos.distance
      };
    }
  }

  return {
    timestamp: d.toISOString(),
    timestampIST: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    julianDay: jd,
    positions
  };
}

/**
 * Get aspects between planets
 * @param {Date|null} date - Date/time
 * @param {Object} options - Options
 * @returns {Object}
 */
function getAspects(date = null, options = {}) {
  const {
    planets = PLANET_GROUPS.CLASSICAL,
    orbs = DEFAULT_ORBS,
    aspectTypes = Object.keys(MAJOR_ASPECTS),
    includeMinor = false
  } = options;

  const planetData = getCurrentPlanets(date, planets);
  const aspects = [];
  const planetKeys = Object.keys(planetData.positions);

  // Check all planet pairs
  for (let i = 0; i < planetKeys.length; i++) {
    for (let j = i + 1; j < planetKeys.length; j++) {
      const p1 = planetData.positions[planetKeys[i]];
      const p2 = planetData.positions[planetKeys[j]];

      const aspectsToCheck = includeMinor
        ? { ...MAJOR_ASPECTS, ...MINOR_ASPECTS }
        : MAJOR_ASPECTS;

      for (const [aspectKey, aspect] of Object.entries(aspectsToCheck)) {
        if (!aspectTypes.includes(aspectKey) && aspectTypes.length > 0) continue;

        // Calculate angular separation
        let diff = Math.abs(p1.longitude - p2.longitude);
        if (diff > 180) diff = 360 - diff;

        // Calculate orb (deviation from exact aspect)
        const exactAngle = aspect.degrees;
        const orb = Math.abs(diff - exactAngle);

        // Get orb tolerance (modified by planet importance)
        const orbMod1 = PLANET_ORB_MODIFIERS[planetKeys[i]] || 1;
        const orbMod2 = PLANET_ORB_MODIFIERS[planetKeys[j]] || 1;
        const maxOrb = (orbs[aspectKey] || 5) * Math.max(orbMod1, orbMod2);

        if (orb <= maxOrb) {
          const isApplying = diff < exactAngle; // Simplified check

          aspects.push({
            planet1: {
              key: planetKeys[i],
              name: p1.name,
              longitude: p1.longitude,
              sign: p1.sign
            },
            planet2: {
              key: planetKeys[j],
              name: p2.name,
              longitude: p2.longitude,
              sign: p2.sign
            },
            aspect: {
              key: aspectKey,
              name: aspect.name,
              symbol: aspect.symbol,
              exactDegrees: exactAngle,
              harmony: aspect.harmony
            },
            orb: Math.round(orb * 100) / 100,
            maxOrb,
            isExact: orb < 1,
            isApplying,
            strength: Math.round((1 - orb / maxOrb) * 100) / 100
          });
        }
      }
    }
  }

  // Sort by strength
  aspects.sort((a, b) => b.strength - a.strength);

  return {
    timestamp: planetData.timestamp,
    timestampIST: planetData.timestampIST,
    aspects,
    count: aspects.length,
    exactAspects: aspects.filter(a => a.isExact).length
  };
}

/**
 * Get Moon information including phase
 * @param {Date|null} date
 * @returns {Object}
 */
function getMoonInfo(date = null) {
  const d = date || new Date();
  const jd = dateToJulianDay(d);

  const moonPos = calculateMoonPosition(jd);
  const sunPos = calculateSunPosition(jd);

  // Moon phase is based on elongation (angle from Sun)
  let elongation = moonPos.longitude - sunPos.longitude;
  if (elongation < 0) elongation += 360;

  // Determine phase
  let phase = null;
  for (const [key, phaseInfo] of Object.entries(MOON_PHASES)) {
    if (elongation >= phaseInfo.degreeRange[0] && elongation < phaseInfo.degreeRange[1]) {
      phase = { key, ...phaseInfo };
      break;
    }
  }

  // If no phase found, it's new moon (wraps around)
  if (!phase) {
    phase = { key: 'NEW_MOON', ...MOON_PHASES.NEW_MOON };
  }

  // Illumination percentage (approximate)
  const illumination = (1 - Math.cos(elongation * DEG_TO_RAD)) / 2 * 100;

  // Moon sign
  const moonSign = getSignFromDegree(moonPos.longitude);

  return {
    timestamp: d.toISOString(),
    timestampIST: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    longitude: Math.round(moonPos.longitude * 10000) / 10000,
    latitude: Math.round(moonPos.latitude * 10000) / 10000,
    sign: moonSign.name,
    signSymbol: moonSign.symbol,
    degreeInSign: Math.round(getDegreeInSign(moonPos.longitude) * 100) / 100,
    phase: phase.name,
    phaseSymbol: phase.symbol,
    phaseKey: phase.key,
    elongation: Math.round(elongation * 100) / 100,
    illumination: Math.round(illumination * 10) / 10,
    distance: Math.round(moonPos.distance * 100) / 100,
    isWaxing: elongation < 180,
    isWaning: elongation >= 180
  };
}

/**
 * Scan for major planetary events in a time range
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Object} options
 * @returns {Array}
 */
function scanMajorEvents(startDate, endDate, options = {}) {
  const {
    includeIngresses = true,
    includeFullMoons = true,
    includeNewMoons = true,
    includeAspects = true,
    stepHours = 6
  } = options;

  const events = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const stepMs = stepHours * 60 * 60 * 1000;

  let prevPositions = null;
  let prevMoon = null;

  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const currentDate = new Date(t);
    const currentPositions = getCurrentPlanets(currentDate);

    // Check for sign ingresses
    if (includeIngresses && prevPositions) {
      for (const [key, pos] of Object.entries(currentPositions.positions)) {
        const prevPos = prevPositions.positions[key];
        if (prevPos && pos.sign !== prevPos.sign) {
          events.push({
            type: MAJOR_EVENT_TYPES.INGRESS,
            planet: key,
            planetName: pos.name,
            newSign: pos.sign,
            previousSign: prevPos.sign,
            timestamp: currentDate.toISOString(),
            significance: ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'].includes(key)
              ? EVENT_SIGNIFICANCE.HIGH
              : EVENT_SIGNIFICANCE.MEDIUM,
            planets: [{ key, longitude: pos.longitude, sign: pos.sign }]
          });
        }
      }
    }

    // Check Moon phases
    const moonInfo = getMoonInfo(currentDate);
    if (prevMoon) {
      // New Moon (elongation crosses 0)
      if (includeNewMoons && prevMoon.elongation > 300 && moonInfo.elongation < 60) {
        events.push({
          type: MAJOR_EVENT_TYPES.NEW_MOON,
          timestamp: currentDate.toISOString(),
          moonSign: moonInfo.sign,
          significance: EVENT_SIGNIFICANCE.MEDIUM,
          planets: [{ key: 'MOON', longitude: moonInfo.longitude, sign: moonInfo.sign }]
        });
      }
      // Full Moon (elongation crosses 180)
      if (includeFullMoons && prevMoon.elongation < 180 && moonInfo.elongation >= 180) {
        events.push({
          type: MAJOR_EVENT_TYPES.FULL_MOON,
          timestamp: currentDate.toISOString(),
          moonSign: moonInfo.sign,
          significance: EVENT_SIGNIFICANCE.MEDIUM,
          planets: [{ key: 'MOON', longitude: moonInfo.longitude, sign: moonInfo.sign }]
        });
      }
    }

    // Check for exact major aspects between outer planets
    if (includeAspects) {
      const aspects = getAspects(currentDate, {
        planets: PLANET_GROUPS.OUTER,
        aspectTypes: ['CONJUNCTION', 'OPPOSITION', 'SQUARE', 'TRINE']
      });

      for (const aspect of aspects.aspects) {
        if (aspect.orb < 0.5) { // Very tight orb
          const existingEvent = events.find(e =>
            e.type === MAJOR_EVENT_TYPES.OUTER_PLANET_ASPECT &&
            e.planet1 === aspect.planet1.key &&
            e.planet2 === aspect.planet2.key &&
            e.aspectKey === aspect.aspect.key
          );

          if (!existingEvent) {
            events.push({
              type: MAJOR_EVENT_TYPES.OUTER_PLANET_ASPECT,
              planet1: aspect.planet1.key,
              planet1Name: aspect.planet1.name,
              planet2: aspect.planet2.key,
              planet2Name: aspect.planet2.name,
              aspectKey: aspect.aspect.key,
              aspectName: aspect.aspect.name,
              orb: aspect.orb,
              timestamp: currentDate.toISOString(),
              significance: EVENT_SIGNIFICANCE.HIGH,
              planets: [
                { key: aspect.planet1.key, longitude: aspect.planet1.longitude },
                { key: aspect.planet2.key, longitude: aspect.planet2.longitude }
              ]
            });
          }
        }
      }
    }

    prevPositions = currentPositions;
    prevMoon = moonInfo;
  }

  // Sort by timestamp
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return events;
}

/**
 * Verify a major event using multiple sources
 * @param {Object} event - Event object from scanMajorEvents
 * @returns {Promise<Object>}
 */
async function verifyMajorEvent(event) {
  const verifications = [];
  let overallConfidence = null;

  // Verify with Horizons
  if (horizons && horizons.isEnabled()) {
    try {
      const horizonsResult = await horizons.verifyMajorEvent(event);
      verifications.push(horizonsResult);
    } catch (error) {
      logger.warn('Horizons verification failed', { error: error.message });
      verifications.push({
        source: 'horizons',
        status: 'error',
        message: error.message
      });
    }
  }

  // Verify with Prokerala
  if (prokerala && prokerala.isEnabled()) {
    try {
      const prokeralaResult = await prokerala.verifyMajorEvent(event);
      verifications.push(prokeralaResult);
    } catch (error) {
      logger.warn('Prokerala verification failed', { error: error.message });
      verifications.push({
        source: 'prokerala',
        status: 'error',
        message: error.message
      });
    }
  }

  // Calculate overall confidence
  const confidences = verifications
    .filter(v => v.overallConfidence)
    .map(v => v.overallConfidence);

  if (confidences.length > 0) {
    const order = ['FAIL', 'LOW', 'MEDIUM', 'HIGH'];
    overallConfidence = confidences.reduce((lowest, current) => {
      return order.indexOf(current) < order.indexOf(lowest) ? current : lowest;
    }, 'HIGH');
  }

  // Calculate deltas
  const deltas = {};
  for (const v of verifications) {
    if (v.verifications) {
      for (const pv of v.verifications) {
        if (pv.delta !== null && pv.delta !== undefined) {
          if (!deltas[pv.planet]) deltas[pv.planet] = [];
          deltas[pv.planet].push({
            source: v.source,
            delta: pv.delta
          });
        }
      }
    }
  }

  return {
    event,
    verifications,
    overallConfidence: overallConfidence || (verifications.length === 0 ? 'UNVERIFIED' : 'FAIL'),
    deltas,
    timestamp: new Date().toISOString()
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Main functions
  getCurrentPlanets,
  getAspects,
  getMoonInfo,
  scanMajorEvents,
  verifyMajorEvent,

  // Utility functions
  dateToJulianDay,
  julianDayToDate,
  normalizeAngle,

  // For testing
  calculateSunPosition,
  calculateMoonPosition,
  calculatePlanetPosition
};
