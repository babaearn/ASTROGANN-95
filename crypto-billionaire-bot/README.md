# Crypto Billionaire Bot

Billionaire-level crypto intelligence Telegram bot for personal intraday futures analysis. This is NOT automated trading - it's an intelligence + learning assistant powered by W.D. Gann mathematical principles, real-time market data, planetary timing, and Gemini AI narration.

## Features

- **Telegram Bot**: Daily briefings (5:30 AM IST), weekly war rooms (Sat 6 PM IST), high-confluence alerts
- **Gann Analysis Engine**: Square of 9, time cycles, geometric angles, Wheel of 24
- **Planetary Timing Engine**: Deterministic astronomical calculations with multi-source verification
- **Confluence Scoring**: Weighted multi-factor scoring with weekly auto-calibration
- **AI Narration**: Gemini Flash 2.5 explains analysis (never invents numbers)
- **Learning Loop**: Snapshot → Outcomes → Weekly weight calibration
- **Multi-Exchange Data**: Bybit V5 + Binance USD-M Futures (public APIs)
- **Market Radar**: Whole-market breadth, regime scoring, top movers

## Architecture

```
crypto-billionaire-bot/
├── bot/
│   ├── telegram.js           # Telegram bot core
│   ├── commands.js           # Command handlers (/status, /gann, etc.)
│   └── formatters.js         # Message formatting utilities
├── config/
│   ├── index.js              # Centralized configuration
│   ├── constants.js          # Planetary constants, zodiac, aspects
│   └── gemini-prompts.js     # Anti-hallucination prompts
├── modules/
│   ├── gann.js               # Deterministic Gann analysis engine
│   ├── planetary.js          # Planetary timing engine (VSOP87)
│   ├── confluence.js         # Weighted confluence scoring
│   ├── gemini.js             # Gemini AI narration
│   ├── bybit.js              # Bybit V5 API client
│   ├── binanceFutures.js     # Binance USD-M Futures client
│   ├── coingecko.js          # CoinGecko API client
│   ├── marketRadar.js        # Market-wide analysis
│   └── verifiers/
│       ├── horizons.js       # JPL Horizons verification
│       └── prokerala.js      # Prokerala API verification
├── jobs/
│   ├── index.js              # Job orchestration
│   ├── daily-briefing.js     # 00:00 UTC (5:30 AM IST)
│   ├── weekly-war-room.js    # Sat 12:30 UTC (6 PM IST)
│   ├── alert-scanner.js      # Every 15 minutes
│   ├── outcome-labeler.js    # Every hour
│   └── weekly-calibration.js # Sun 00:00 UTC
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
- PostgreSQL 14+ (Railway provides this)
- Telegram Bot Token (from @BotFather)
- Gemini API Key (from Google AI Studio)
- CoinGecko Demo API Key

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

### 3. Start Locally

```bash
npm run dev   # Development with auto-reload
npm start     # Production
```

## Railway Deployment

### Required Variables

Set these in Railway's Variables tab:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your personal chat ID |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DATABASE_URL` | Auto-provided by Railway PostgreSQL |
| `COINGECKO_API_KEY` | CoinGecko demo API key |
| `TZ` | `Asia/Kolkata` |
| `NODE_ENV` | `production` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BYBIT_BASE_URL` | `https://api.bybit.com` | Bybit API endpoint |
| `BINANCE_FUTURES_BASE_URL` | `https://fapi.binance.com` | Binance Futures endpoint |
| `HORIZONS_ENABLED` | `true` | JPL Horizons verification |
| `PROKERALA_ENABLED` | `false` | Prokerala verification |
| `ADMIN_KEY` | - | For protected API endpoints |

### Deploy Steps

1. Create new Railway project
2. Add PostgreSQL plugin (auto-sets DATABASE_URL)
3. Connect GitHub repo
4. Set environment variables
5. Deploy!

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome and register |
| `/help` | Available commands |
| `/status` | Current BTC + confluence |
| `/gann` | Gann Square of 9 & Wheel |
| `/planets` | Planetary positions |
| `/confluence` | Full confluence breakdown |
| `/levels` | Key support/resistance |
| `/cycles` | Cycle analysis |

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily Briefing | 00:00 UTC (5:30 AM IST) | Gann + planetary + radar + confluence |
| Weekly War Room | Sat 12:30 UTC (6 PM IST) | Weekly review + strategy |
| Alert Scanner | Every 15 min | High-confluence detection |
| Outcome Labeler | Every hour | Labels predictions at 1h/4h/24h |
| Weekly Calibration | Sun 00:00 UTC | Adjusts confluence weights |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Bot info |
| `GET /health` | Health check (for Railway) |
| `GET /status` | Detailed system status |
| `GET /api/gann/demo/:price` | Gann analysis demo |
| `GET /api/planetary/current` | Current planetary positions |
| `GET /api/confluence/:price` | Confluence score demo |
| `POST /api/jobs/:name/run` | Trigger job manually |

## Confluence Scoring

The confluence module combines multiple factors with learnable weights:

```javascript
const confluence = require('./modules/confluence');

const result = await confluence.calculate(45000);
console.log('Score:', result.score);      // 0.0 - 1.0
console.log('Bias:', result.bias);        // bullish / bearish / neutral
console.log('Components:', result.components);
```

### Default Weights

| Component | Weight | Description |
|-----------|--------|-------------|
| gann_sq9_cardinal | 15% | Near 0°/90°/180°/270° |
| gann_sq9_position | 10% | Position in square |
| gann_level_proximity | 15% | Close to key level |
| cycle_convergence | 15% | Multiple cycles aligning |
| cycle_major_hit | 10% | Major cycle (halving, etc.) |
| planetary_aspect_tight | 10% | Tight planetary aspects |
| planetary_major_event | 10% | Imminent celestial event |
| planetary_moon_phase | 5% | Full/New moon |
| market_regime | 5% | Fear/Greed (contrarian) |
| market_momentum | 5% | OI/Volume signals |

Weights are automatically calibrated weekly based on outcome data.

## Gemini Narration

Gemini Flash 2.5 provides educational narration with strict rules:
- **NEVER invents numbers** - only uses data we provide
- **Explains** patterns, doesn't predict outcomes
- **Fallback formatting** if Gemini unavailable

```javascript
const gemini = require('./modules/gemini');

// Narrate daily briefing (with data)
const narration = await gemini.narrateDailyBriefing(briefingData);
```

## Learning Loop

1. **Snapshots**: Analysis saved with price + confluence + bias
2. **Outcomes**: Labeled at 1h, 4h, 24h with actual returns
3. **Calibration**: Weekly weight adjustment based on hit rates
4. **Slow Learning**: Max 2% weight adjustment per week

## Quality Gates

The system runs reliably even when components are unavailable:

- ✅ Runs without Gemini (fallback to raw formatting)
- ✅ Runs without verifiers (primary calculations only)
- ✅ Runs without database (degraded, no persistence)
- ✅ Creates analysis snapshots
- ✅ Labels outcomes and recalibrates weekly

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Test Gann module
npm run test:gann

# Test planetary engine
npm run test:planetary

# Test market data
npm run test:market

# Manually trigger jobs
npm run job:briefing
npm run job:warroom
npm run job:calibrate
```

## Parts Complete

- **Part 1** ✅: Foundation, PostgreSQL schema, Gann engine
- **Part 2** ✅: Market data (Bybit, Binance, CoinGecko, Market Radar)
- **Part 3** ✅: Planetary engine (VSOP87 + Horizons + Prokerala)
- **Part 4** ✅: Telegram bot, Gemini narration, jobs, learning loop

## Key Principles

1. **Deterministic Core**: Gann and Planetary modules are pure math - no AI
2. **AI Explains, Doesn't Predict**: Gemini narrates, never invents numbers
3. **Multi-Source Verification**: Cross-check with Horizons/Prokerala
4. **Slow Learning**: Weekly calibration with capped adjustments
5. **UTC Storage**: All timestamps stored UTC, displayed IST
6. **Graceful Degradation**: Components fail silently, never crash
7. **No Trading Execution**: Read-only market intelligence
8. **No Spam**: Alerts only on high confluence (≥75%)

## License

ISC
