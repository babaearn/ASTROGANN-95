# Crypto Billionaire Bot

Billionaire-level crypto intelligence Telegram bot for personal intraday futures analysis. This is NOT automated trading - it's an intelligence + learning assistant powered by W.D. Gann mathematical principles.

## Features

- **Square of 9 Analysis**: Gann Wheel calculations for support/resistance levels
- **Time Cycle Analysis**: Detection of major and minor Gann cycles
- **Geometric Angle Analysis**: 1x1, 2x1, 1x2 angle calculations
- **Wheel of 24**: Price-to-degree conversion and planetary aspects
- **Target Calculations**: Multi-method price target convergence
- **Learning System**: Analysis snapshots with outcome labeling for model improvement

## Architecture

```
crypto-billionaire-bot/
├── config/                 # Configuration files
├── modules/
│   └── gann.js            # Deterministic Gann analysis engine (pure math)
├── database/
│   ├── schema.sql         # PostgreSQL schema
│   └── models.js          # Database access layer
├── utils/
│   ├── logger.js          # Structured logging
│   └── validators.js      # Input validation
├── server.js              # Express server entry point
├── package.json
├── .env.example
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

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

### 3. Setup Database

```bash
# Create PostgreSQL database
createdb crypto_bot

# Run schema
psql -d crypto_bot -f database/schema.sql
```

### 4. Start Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Gann demo
curl http://localhost:3000/api/gann/demo/45000
```

## Gann Module Usage

The Gann module is a pure mathematical engine with no external dependencies:

### Square of 9

```javascript
const gann = require('./modules/gann');

// Analyze price using Square of 9
const result = gann.squareOf9(45000);

console.log('Square Root:', result.squareRoot);           // 212.1320
console.log('Degree Position:', result.degreePosition);   // Where on the wheel
console.log('Support Levels:', result.supportLevels);     // 5 levels below
console.log('Resistance Levels:', result.resistanceLevels); // 5 levels above
console.log('Near Top of Square:', result.flags.nearTop);
console.log('Near Cardinal:', result.flags.nearCardinal);
```

### Cycle Analysis

```javascript
const events = [
  { event_date: '2024-04-20', event_type: 'halving', significance: 10 },
  { event_date: '2024-03-14', event_type: 'ath', significance: 8 },
];

const cycles = gann.analyzeCycles(new Date(), events);

console.log('Major Hits:', cycles.majorHits);             // Cycles hitting now
console.log('Convergence:', cycles.convergenceScore);     // 0-1 score
console.log('Bias:', cycles.cycleBias);                   // bullish/bearish/neutral
console.log('Upcoming:', cycles.upcomingCycles);          // Next 30 days
```

### Angle Analysis

```javascript
const priceHistory = [
  { timestamp: new Date(Date.now() - 24*60*60*1000), close_price: 44000 },
  { timestamp: new Date(Date.now() - 12*60*60*1000), close_price: 44500 },
  { timestamp: new Date(), close_price: 45000 },
];

const angles = gann.analyzeAngles(priceHistory);

console.log('Angle:', angles.angle.degrees);              // Current trend angle
console.log('Nearest Gann Angle:', angles.angle.nearestGannAngle.name);
console.log('Above 1x1:', angles.signals.aboveAngle);
console.log('Trend Strength:', angles.signals.trendStrength);
```

### Wheel of 24

```javascript
// Basic price-to-degrees conversion
const wheel = gann.wheelOf24(45000);

console.log('Degrees:', wheel.degrees.normalized);
console.log('Near Cardinal:', wheel.cardinalAnalysis.nearCardinal);
console.log('Cardinal Prices:', wheel.cardinalAnalysis.cardinalPrices);

// With planetary aspect analysis
const wheelWithPlanet = gann.wheelOf24(45000, 120); // Sun at 120°

if (wheelWithPlanet.aspectAnalysis.hasAspect) {
  console.log('Aspect:', wheelWithPlanet.aspectAnalysis.aspects[0].aspect);
  console.log('Harmony:', wheelWithPlanet.aspectAnalysis.harmony);
}
```

### Price Targets

```javascript
// Calculate targets within 0.5% to 5% range
const targets = gann.calculateTargets(45000, 0.5, 5);

console.log('Closest Support:', targets.closestSupport);
console.log('Closest Resistance:', targets.closestResistance);
console.log('Key Levels:', targets.keyLevels); // Where multiple methods agree
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/health` | GET | Health check with DB status |
| `/api/gann/demo/:price` | GET | Demo Gann analysis for a price |

## Database Tables

### Core Tables
- `historical_events` - Significant market events for cycle analysis
- `predictions` - System predictions with outcomes
- `daily_briefings` - Daily intelligence reports
- `weekly_war_rooms` - Weekly deep analysis
- `price_history` - Price data from various sources
- `user_settings` - Telegram user preferences

### Learning Tables
- `analysis_snapshots` - Feature snapshots at points in time
- `outcome_labels` - Actual results after 1h/4h/24h
- `weight_versions` - Model weights for scoring

## Timezone Handling

- **Storage**: All timestamps stored in UTC
- **Display**: Converted to Asia/Kolkata (IST) for user display

```javascript
const logger = require('./utils/logger');

// Convert UTC to IST for display
const istTime = logger.toIST(new Date());
console.log(istTime); // "01/02/2026, 14:30:45 IST"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `DATABASE_URL` | Yes* | PostgreSQL connection string |
| `LOG_LEVEL` | No | Log verbosity (default: info) |

*Server runs without DB in development for testing

## Railway Deployment

1. Push code to GitHub
2. Create new Railway project
3. Add PostgreSQL plugin
4. Connect GitHub repo
5. Railway auto-detects Node.js and deploys

The `DATABASE_URL` is automatically provided by Railway.

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Test Gann module directly
npm run test:gann

# Or run examples
node modules/gann.js
```

## Parts Roadmap

- **Part 1** (Current): Foundation, schema, Gann engine
- **Part 2**: Telegram bot, Binance integration, price feeds
- **Part 3**: AI analysis, composite scoring, alerts
- **Part 4**: Learning system, backtesting, optimization

## Key Principles

1. **Deterministic Core**: Gann module is pure math - no APIs, no AI, no external calls
2. **No Hallucination**: Every output is mathematically derived from inputs
3. **Learning Ready**: Schema supports feature/outcome tracking for improvement
4. **Railway Compatible**: Designed for easy cloud deployment

## License

ISC
