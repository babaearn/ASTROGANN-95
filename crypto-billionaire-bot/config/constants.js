/**
 * PLANETARY CONSTANTS
 * ====================
 * Astronomical constants for planetary calculations
 * Zodiac modes, orbs, tolerances, and major aspects
 */

// ============================================================
// ZODIAC SYSTEMS
// ============================================================

/**
 * Zodiac calculation modes
 * TROPICAL: Based on equinoxes (Western astrology)
 * SIDEREAL: Based on fixed stars (Vedic/Jyotish)
 */
const ZODIAC_MODE = {
  TROPICAL: 'tropical',
  SIDEREAL: 'sidereal'
};

/**
 * Ayanamsa systems for sidereal calculations
 * Lahiri is most commonly used in Vedic astrology
 */
const AYANAMSA = {
  LAHIRI: 'lahiri',
  RAMAN: 'raman',
  KRISHNAMURTI: 'krishnamurti',
  FAGAN_BRADLEY: 'fagan_bradley'
};

/**
 * Default zodiac configuration
 */
const DEFAULT_ZODIAC_CONFIG = {
  mode: ZODIAC_MODE.TROPICAL,
  ayanamsa: AYANAMSA.LAHIRI
};

// ============================================================
// PLANETS
// ============================================================

/**
 * Planet identifiers (Swiss Ephemeris IDs)
 */
const PLANETS = {
  SUN: { id: 0, name: 'Sun', symbol: '☉', glyph: 'Su' },
  MOON: { id: 1, name: 'Moon', symbol: '☽', glyph: 'Mo' },
  MERCURY: { id: 2, name: 'Mercury', symbol: '☿', glyph: 'Me' },
  VENUS: { id: 3, name: 'Venus', symbol: '♀', glyph: 'Ve' },
  MARS: { id: 4, name: 'Mars', symbol: '♂', glyph: 'Ma' },
  JUPITER: { id: 5, name: 'Jupiter', symbol: '♃', glyph: 'Ju' },
  SATURN: { id: 6, name: 'Saturn', symbol: '♄', glyph: 'Sa' },
  URANUS: { id: 7, name: 'Uranus', symbol: '♅', glyph: 'Ur' },
  NEPTUNE: { id: 8, name: 'Neptune', symbol: '♆', glyph: 'Ne' },
  PLUTO: { id: 9, name: 'Pluto', symbol: '♇', glyph: 'Pl' },
  // Lunar nodes
  NORTH_NODE: { id: 10, name: 'North Node', symbol: '☊', glyph: 'Nn' },
  SOUTH_NODE: { id: 11, name: 'South Node', symbol: '☋', glyph: 'Sn' }
};

/**
 * Planet groups for analysis
 */
const PLANET_GROUPS = {
  INNER: ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS'],
  OUTER: ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'],
  CLASSICAL: ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN'],
  MODERN: ['URANUS', 'NEPTUNE', 'PLUTO'],
  NODES: ['NORTH_NODE', 'SOUTH_NODE'],
  // For financial astrology
  FINANCIAL: ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN']
};

// ============================================================
// ZODIAC SIGNS
// ============================================================

const ZODIAC_SIGNS = [
  { index: 0, name: 'Aries', symbol: '♈', element: 'fire', quality: 'cardinal', ruler: 'MARS' },
  { index: 1, name: 'Taurus', symbol: '♉', element: 'earth', quality: 'fixed', ruler: 'VENUS' },
  { index: 2, name: 'Gemini', symbol: '♊', element: 'air', quality: 'mutable', ruler: 'MERCURY' },
  { index: 3, name: 'Cancer', symbol: '♋', element: 'water', quality: 'cardinal', ruler: 'MOON' },
  { index: 4, name: 'Leo', symbol: '♌', element: 'fire', quality: 'fixed', ruler: 'SUN' },
  { index: 5, name: 'Virgo', symbol: '♍', element: 'earth', quality: 'mutable', ruler: 'MERCURY' },
  { index: 6, name: 'Libra', symbol: '♎', element: 'air', quality: 'cardinal', ruler: 'VENUS' },
  { index: 7, name: 'Scorpio', symbol: '♏', element: 'water', quality: 'fixed', ruler: 'MARS' },
  { index: 8, name: 'Sagittarius', symbol: '♐', element: 'fire', quality: 'mutable', ruler: 'JUPITER' },
  { index: 9, name: 'Capricorn', symbol: '♑', element: 'earth', quality: 'cardinal', ruler: 'SATURN' },
  { index: 10, name: 'Aquarius', symbol: '♒', element: 'air', quality: 'fixed', ruler: 'SATURN' },
  { index: 11, name: 'Pisces', symbol: '♓', element: 'water', quality: 'mutable', ruler: 'JUPITER' }
];

// ============================================================
// ASPECTS
// ============================================================

/**
 * Major aspects with degrees and orbs
 * Orb = tolerance in degrees for aspect to be considered active
 */
const MAJOR_ASPECTS = {
  CONJUNCTION: { degrees: 0, name: 'Conjunction', symbol: '☌', nature: 'major', harmony: 'variable' },
  OPPOSITION: { degrees: 180, name: 'Opposition', symbol: '☍', nature: 'major', harmony: 'tense' },
  TRINE: { degrees: 120, name: 'Trine', symbol: '△', nature: 'major', harmony: 'harmonious' },
  SQUARE: { degrees: 90, name: 'Square', symbol: '□', nature: 'major', harmony: 'tense' },
  SEXTILE: { degrees: 60, name: 'Sextile', symbol: '⚹', nature: 'major', harmony: 'harmonious' }
};

/**
 * Minor aspects
 */
const MINOR_ASPECTS = {
  SEMI_SEXTILE: { degrees: 30, name: 'Semi-sextile', symbol: '⚺', nature: 'minor', harmony: 'mildly_tense' },
  QUINCUNX: { degrees: 150, name: 'Quincunx', symbol: '⚻', nature: 'minor', harmony: 'tense' },
  SEMI_SQUARE: { degrees: 45, name: 'Semi-square', symbol: '∠', nature: 'minor', harmony: 'tense' },
  SESQUIQUADRATE: { degrees: 135, name: 'Sesquiquadrate', symbol: '⚼', nature: 'minor', harmony: 'tense' },
  QUINTILE: { degrees: 72, name: 'Quintile', symbol: 'Q', nature: 'minor', harmony: 'creative' },
  BI_QUINTILE: { degrees: 144, name: 'Bi-quintile', symbol: 'bQ', nature: 'minor', harmony: 'creative' }
};

/**
 * All aspects combined
 */
const ALL_ASPECTS = { ...MAJOR_ASPECTS, ...MINOR_ASPECTS };

// ============================================================
// ORBS (Tolerances)
// ============================================================

/**
 * Default orbs by aspect type
 * Tighter orbs = more precise, wider orbs = more inclusive
 */
const DEFAULT_ORBS = {
  CONJUNCTION: 8,
  OPPOSITION: 8,
  TRINE: 8,
  SQUARE: 7,
  SEXTILE: 6,
  SEMI_SEXTILE: 2,
  QUINCUNX: 3,
  SEMI_SQUARE: 2,
  SESQUIQUADRATE: 2,
  QUINTILE: 2,
  BI_QUINTILE: 2
};

/**
 * Tighter orbs for more precise analysis
 */
const TIGHT_ORBS = {
  CONJUNCTION: 3,
  OPPOSITION: 3,
  TRINE: 3,
  SQUARE: 3,
  SEXTILE: 2,
  SEMI_SEXTILE: 1,
  QUINCUNX: 2,
  SEMI_SQUARE: 1,
  SESQUIQUADRATE: 1,
  QUINTILE: 1,
  BI_QUINTILE: 1
};

/**
 * Planet-specific orb modifiers
 * Luminaries (Sun/Moon) get larger orbs
 */
const PLANET_ORB_MODIFIERS = {
  SUN: 1.5,
  MOON: 1.5,
  MERCURY: 1.0,
  VENUS: 1.0,
  MARS: 1.0,
  JUPITER: 1.2,
  SATURN: 1.2,
  URANUS: 1.0,
  NEPTUNE: 1.0,
  PLUTO: 0.8,
  NORTH_NODE: 0.8,
  SOUTH_NODE: 0.8
};

// ============================================================
// VERIFICATION TOLERANCES
// ============================================================

/**
 * Tolerances for cross-verification between sources
 * All values in degrees
 */
const VERIFICATION_TOLERANCES = {
  HIGH: 0.1,      // < 0.1° difference = high confidence
  MEDIUM: 0.5,    // < 0.5° difference = medium confidence
  LOW: 2.0,       // < 2.0° difference = low confidence
  FAIL: 5.0       // > 5.0° = verification failed
};

/**
 * Time tolerance for event verification (in minutes)
 */
const TIME_TOLERANCES = {
  HIGH: 5,        // Within 5 minutes
  MEDIUM: 30,     // Within 30 minutes
  LOW: 120        // Within 2 hours
};

// ============================================================
// MOON PHASES
// ============================================================

const MOON_PHASES = {
  NEW_MOON: { name: 'New Moon', symbol: '🌑', degreeRange: [0, 45] },
  WAXING_CRESCENT: { name: 'Waxing Crescent', symbol: '🌒', degreeRange: [45, 90] },
  FIRST_QUARTER: { name: 'First Quarter', symbol: '🌓', degreeRange: [90, 135] },
  WAXING_GIBBOUS: { name: 'Waxing Gibbous', symbol: '🌔', degreeRange: [135, 180] },
  FULL_MOON: { name: 'Full Moon', symbol: '🌕', degreeRange: [180, 225] },
  WANING_GIBBOUS: { name: 'Waning Gibbous', symbol: '🌖', degreeRange: [225, 270] },
  LAST_QUARTER: { name: 'Last Quarter', symbol: '🌗', degreeRange: [270, 315] },
  WANING_CRESCENT: { name: 'Waning Crescent', symbol: '🌘', degreeRange: [315, 360] }
};

// ============================================================
// MAJOR EVENTS (For Market Timing)
// ============================================================

/**
 * Major planetary events relevant for financial astrology
 */
const MAJOR_EVENT_TYPES = {
  // Ingresses (planet entering new sign)
  INGRESS: 'ingress',
  // Stations (planet changing direction)
  STATION_RETROGRADE: 'station_retrograde',
  STATION_DIRECT: 'station_direct',
  // Aspects between slow planets
  OUTER_PLANET_ASPECT: 'outer_planet_aspect',
  // Eclipses
  SOLAR_ECLIPSE: 'solar_eclipse',
  LUNAR_ECLIPSE: 'lunar_eclipse',
  // Moon phases
  NEW_MOON: 'new_moon',
  FULL_MOON: 'full_moon'
};

/**
 * Significance ratings for events
 */
const EVENT_SIGNIFICANCE = {
  CRITICAL: 10,   // Eclipses, Saturn-Pluto aspects
  HIGH: 8,        // Outer planet aspects, major ingresses
  MEDIUM: 5,      // Inner planet stations, full/new moons
  LOW: 3          // Minor aspects, fast-moving transits
};

// ============================================================
// RETROGRADE PERIODS
// ============================================================

/**
 * Average retrograde durations (in days)
 */
const RETROGRADE_DURATIONS = {
  MERCURY: 21,    // ~3 weeks, 3-4 times/year
  VENUS: 42,      // ~6 weeks, every 18 months
  MARS: 72,       // ~10 weeks, every 2 years
  JUPITER: 121,   // ~4 months/year
  SATURN: 140,    // ~4.5 months/year
  URANUS: 150,    // ~5 months/year
  NEPTUNE: 158,   // ~5+ months/year
  PLUTO: 160      // ~5+ months/year
};

// ============================================================
// HOUSE SYSTEMS (For future use)
// ============================================================

const HOUSE_SYSTEMS = {
  PLACIDUS: 'P',
  KOCH: 'K',
  EQUAL: 'E',
  WHOLE_SIGN: 'W',
  CAMPANUS: 'C',
  REGIOMONTANUS: 'R',
  MERIDIAN: 'X',
  PORPHYRY: 'O'
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Zodiac
  ZODIAC_MODE,
  AYANAMSA,
  DEFAULT_ZODIAC_CONFIG,
  ZODIAC_SIGNS,

  // Planets
  PLANETS,
  PLANET_GROUPS,

  // Aspects
  MAJOR_ASPECTS,
  MINOR_ASPECTS,
  ALL_ASPECTS,

  // Orbs
  DEFAULT_ORBS,
  TIGHT_ORBS,
  PLANET_ORB_MODIFIERS,

  // Tolerances
  VERIFICATION_TOLERANCES,
  TIME_TOLERANCES,

  // Moon
  MOON_PHASES,

  // Events
  MAJOR_EVENT_TYPES,
  EVENT_SIGNIFICANCE,

  // Retrograde
  RETROGRADE_DURATIONS,

  // Houses
  HOUSE_SYSTEMS,

  // Helper functions
  getSignFromDegree: (degree) => {
    const normalizedDegree = ((degree % 360) + 360) % 360;
    const signIndex = Math.floor(normalizedDegree / 30);
    return ZODIAC_SIGNS[signIndex];
  },

  getDegreeInSign: (degree) => {
    const normalizedDegree = ((degree % 360) + 360) % 360;
    return normalizedDegree % 30;
  },

  formatDegree: (degree) => {
    const sign = module.exports.getSignFromDegree(degree);
    const degInSign = module.exports.getDegreeInSign(degree);
    const deg = Math.floor(degInSign);
    const min = Math.floor((degInSign - deg) * 60);
    return `${deg}°${sign.symbol} ${min}'`;
  }
};
