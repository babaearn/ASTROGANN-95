# Crypto Billionaire Bot

Billionaire-level crypto intelligence Telegram bot for personal intraday futures analysis. This is NOT automated trading - it's an intelligence + learning assistant powered by W.D. Gann mathematical principles, real-time market data, and planetary timing.

## Features

- **Gann Analysis Engine**: Square of 9, time cycles, geometric angles, Wheel of 24
- **Planetary Timing Engine**: Deterministic astronomical calculations with multi-source verification
- **Multi-Exchange Data**: Bybit V5 + Binance USD-M Futures (public APIs)
- **Market Radar**: Whole-market breadth, regime scoring, top movers
- **Learning System**: Analysis snapshots with outcome labeling for model improvement

## Architecture

```
crypto-billionaire-bot/
├── config/
│   ├── index.js              # Centralized configuration
│   └── constants.js          # Planetary constants, zodiac, aspects, orbs
├── modules/
│   ├── gann.js               # Deterministic Gann analysis engine
│   ├── planetary.js          # Planetary timing engine (VSOP87)
│   ├── bybit.js              # Bybit V5 API client
│   ├── binanceFutures.js     # Binance USD-M Futures client
│   ├── coingecko.js          # CoinGecko API client
│   ├── marketRadar.js        # Market-wide analysis
│   └── verifiers/
│       ├── horizons.js       # JPL Horizons verification
│       └── prokerala.js      # Prokerala API verification
├── database/
│   ├── schema.sql            # PostgreSQL schema
│   └── models.js             # Database access layer
├── utils/
│   ├── logger.js             # Structured logging
│   └── validators.js         # Input validation
├── scripts/
│   ├── test-market-data.js   # Market data testing
│   └── test-planetary.js     # Planetary engine testing
├── server.js                 # Express server entry point
├── package.json
├── .env.example
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (optional)
- CoinGecko Demo API Key (required for market radar)

## Quick Start

### 1. Clone and Install

```bash
cd crypto-billionaire-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

**Required Variables:**
```env
COINGECKO_API_KEY=your_demo_api_key  # Get free at coingecko.com/api
```

**Planetary Verification (Optional):**
```env
HORIZONS_ENABLED=true               # JPL Horizons (free, no key)
PROKERALA_ENABLED=false             # Prokerala (requires API key)
PROKERALA_API_KEY=your_key          # If using Prokerala
```

### 3. Test Planetary Engine

```bash
# Test planetary calculations
node scripts/test-planetary.js
```

### 4. Start Server

```bash
npm run dev   # Development
npm start     # Production
```

## Planetary Engine

The planetary module provides deterministic astronomical calculations using VSOP87 algorithms. No AI - pure celestial mechanics.

### Current Planetary Positions

```javascript
const planetary = require('./modules/planetary');

// Get all planet positions for current time
const positions = planetary.getCurrentPlanets();

console.log('Sun:', positions.positions.SUN.formatted);   // "12°♈ 45'"
console.log('Moon:', positions.positions.MOON.formatted);
console.log('Mars:', positions.positions.MARS.sign);      // "Taurus"

// Specific planets only
const inner = planetary.getCurrentPlanets(new Date(), ['SUN', 'MOON', 'MERCURY']);
```

### Planetary Aspects

```javascript
// Get current aspects between classical planets
const aspects = planetary.getAspects();

for (const a of aspects.aspects) {
  console.log(`${a.planet1.name} ${a.aspect.symbol} ${a.planet2.name}`);
  console.log(`  Orb: ${a.orb}° | Strength: ${a.strength * 100}%`);
  console.log(`  ${a.isExact ? 'EXACT' : a.isApplying ? 'Applying' : 'Separating'}`);
}

// With options
const tightAspects = planetary.getAspects(null, {
  planets: ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'],
  orbs: require('./config/constants').TIGHT_ORBS,
  includeMinor: true
});
```

### Moon Information

```javascript
const moonInfo = planetary.getMoonInfo();

console.log('Phase:', moonInfo.phaseSymbol, moonInfo.phase);  // 🌕 Full Moon
console.log('Sign:', moonInfo.sign);                          // Leo
console.log('Illumination:', moonInfo.illumination + '%');    // 98.5%
console.log('Direction:', moonInfo.isWaxing ? 'Waxing' : 'Waning');
```

### Major Event Scanning

```javascript
// Scan for major events in next 30 days
const now = new Date();
const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const events = planetary.scanMajorEvents(now, future);

for (const event of events) {
  console.log(`${event.timestamp}: ${event.type}`);
  // ingress: Planet enters new sign
  // new_moon, full_moon: Lunar phases
  // outer_planet_aspect: Jupiter-Saturn square, etc.
}
```

### Event Verification

Multi-source verification ensures accuracy:

```javascript
// Verify an event against Horizons + Prokerala
const event = events[0];
const verification = await planetary.verifyMajorEvent(event);

console.log('Overall Confidence:', verification.overallConfidence);
// HIGH (< 0.1° delta), MEDIUM (< 0.5°), LOW (< 2°), FAIL

for (const v of verification.verifications) {
  console.log(`${v.source}: ${v.status} - ${v.overallConfidence}`);
}
```

### Verification Sources

| Source | Type | Key Required | Accuracy |
|--------|------|--------------|----------|
| VSOP87 | Primary | No | ±0.01° for inner planets |
| JPL Horizons | Verification | No | Reference quality |
| Prokerala | Verification | Yes (free) | Human-facing check |

## Gann Module Usage

```javascript
const gann = require('./modules/gann');

// Square of 9 analysis
const sq9 = gann.squareOf9(45000);
console.log('Support Levels:', sq9.supportLevels);
console.log('Resistance Levels:', sq9.resistanceLevels);

// Cycle analysis
const cycles = gann.analyzeCycles(new Date(), historicalEvents);
console.log('Convergence Score:', cycles.convergenceScore);

// Angle analysis
const angles = gann.analyzeAngles(priceHistory);
console.log('Trend:', angles.signals.trend);

// Wheel of 24 with planetary overlay
const wheel = gann.wheelOf24(45000, planetary.getCurrentPlanets().positions.MARS.longitude);
console.log('Price-Planet Harmony:', wheel.aspectAnalysis.harmony);
```

## Market Data Modules

### Bybit V5 Client

```javascript
const { bybitClient } = require('./modules/bybit');

const ticker = await bybitClient.getTickerBySymbol('BTCUSDT');
const oi = await bybitClient.getOpenInterest({ symbol: 'BTCUSDT' });
const funding = await bybitClient.getFundingRateHistory({ symbol: 'BTCUSDT' });
```

### Binance Futures Client

```javascript
const { binanceFuturesClient } = require('./modules/binanceFutures');

const ticker = await binanceFuturesClient.get24hTicker({ symbol: 'BTCUSDT' });
const lsRatio = await binanceFuturesClient.getGlobalLongShortRatio({ symbol: 'BTCUSDT' });
```

### Market Radar

```javascript
const { marketRadar } = require('./modules/marketRadar');

const snapshot = await marketRadar.generateSnapshot({ topCoinsCount: 200 });
console.log('Regime:', snapshot.regimeLabel);  // STRONG_BULL, BULL, NEUTRAL, BEAR, STRONG_BEAR
console.log('Score:', snapshot.regimeScore);   // 0-100
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `TZ` | No | Display timezone (default: Asia/Kolkata) |
| `DATABASE_URL` | No* | PostgreSQL connection string |
| `LOG_LEVEL` | No | Log verbosity (default: info) |
| `COINGECKO_API_KEY` | **Yes** | CoinGecko Demo API key |
| `HORIZONS_ENABLED` | No | Enable JPL Horizons (default: true) |
| `PROKERALA_ENABLED` | No | Enable Prokerala (default: false) |
| `PROKERALA_API_KEY` | No | Prokerala API key (if enabled) |

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Test Gann module
npm run test:gann

# Test planetary engine
node scripts/test-planetary.js

# Test market data modules
node scripts/test-market-data.js
```

## Parts Roadmap

- **Part 1** ✅: Foundation, schema, Gann engine
- **Part 2** ✅: Market data (Bybit, Binance, CoinGecko, Market Radar)
- **Part 3** ✅: Planetary engine with verification (Horizons, Prokerala)
- **Part 4**: Telegram bot, AI analysis, alerts

## Key Principles

1. **Deterministic Core**: Gann and Planetary modules are pure math - no AI
2. **Multi-Source Verification**: Cross-check calculations with Horizons/Prokerala
3. **UTC Storage**: All timestamps stored in UTC, displayed in IST
4. **Graceful Degradation**: Verifiers fail silently, never crash
5. **No Trading Execution**: Read-only market intelligence

## Verification Confidence Levels

| Level | Delta (°) | Meaning |
|-------|-----------|---------|
| HIGH | < 0.1° | Excellent match, highly reliable |
| MEDIUM | < 0.5° | Good match, acceptable for timing |
| LOW | < 2.0° | Marginal match, use with caution |
| FAIL | > 5.0° | Verification failed, investigate |

## License

ISC
