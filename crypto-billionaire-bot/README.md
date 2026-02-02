# Crypto Billionaire Bot

Billionaire-level crypto intelligence Telegram bot for personal intraday futures analysis. This is NOT automated trading - it's an intelligence + learning assistant powered by W.D. Gann mathematical principles and real-time market data.

## Features

- **Gann Analysis Engine**: Square of 9, time cycles, geometric angles, Wheel of 24
- **Multi-Exchange Data**: Bybit V5 + Binance USD-M Futures (public APIs)
- **Market Radar**: Whole-market breadth, regime scoring, top movers
- **Learning System**: Analysis snapshots with outcome labeling for model improvement

## Architecture

```
crypto-billionaire-bot/
├── config/
│   └── index.js              # Centralized configuration
├── modules/
│   ├── gann.js               # Deterministic Gann analysis engine
│   ├── bybit.js              # Bybit V5 API client
│   ├── binanceFutures.js     # Binance USD-M Futures client
│   ├── coingecko.js          # CoinGecko API client
│   └── marketRadar.js        # Market-wide analysis
├── database/
│   ├── schema.sql            # PostgreSQL schema
│   └── models.js             # Database access layer
├── utils/
│   ├── logger.js             # Structured logging
│   └── validators.js         # Input validation
├── scripts/
│   └── test-market-data.js   # Market data testing script
├── server.js                 # Express server entry point
├── package.json
├── .env.example
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (optional for Part 1-2)
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

**Optional Variables:**
```env
DATABASE_URL=postgresql://...        # For persistence
BYBIT_BASE_URL=https://api.bybit.com
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
TZ=Asia/Kolkata
```

### 3. Test Market Data

```bash
# Test all market data modules
node scripts/test-market-data.js
```

### 4. Start Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Market Data Modules

### Bybit V5 Client

```javascript
const { bybitClient } = require('./modules/bybit');

// Get BTCUSDT ticker
const ticker = await bybitClient.getTickerBySymbol('BTCUSDT');
console.log('Price:', ticker.lastPrice);
console.log('24h Change:', ticker.price24hPcnt + '%');
console.log('Open Interest:', ticker.openInterest);

// Get kline data
const klines = await bybitClient.getKlineData({
  symbol: 'BTCUSDT',
  interval: '15',  // 15 minutes
  limit: 100
});

// Get Open Interest history
const oi = await bybitClient.getOpenInterest({
  symbol: 'BTCUSDT',
  intervalTime: '1h',
  limit: 24
});

// Get Long/Short ratio
const lsRatio = await bybitClient.getLongShortRatio({
  symbol: 'BTCUSDT',
  period: '1h',
  limit: 24
});

// Get Funding Rate history
const funding = await bybitClient.getFundingRateHistory({
  symbol: 'BTCUSDT',
  limit: 10
});
```

### Binance Futures Client

```javascript
const { binanceFuturesClient } = require('./modules/binanceFutures');

// Get 24h ticker
const ticker = await binanceFuturesClient.get24hTicker({ symbol: 'BTCUSDT' });

// Get current Open Interest
const oi = await binanceFuturesClient.getOpenInterest({ symbol: 'BTCUSDT' });

// Get Global Long/Short Ratio
const lsRatio = await binanceFuturesClient.getGlobalLongShortRatio({
  symbol: 'BTCUSDT',
  period: '1h',
  limit: 24
});

// Get Taker Buy/Sell Volume
const takerVol = await binanceFuturesClient.getTakerBuySellVol({
  symbol: 'BTCUSDT',
  period: '1h',
  limit: 24
});

// Get klines
const klines = await binanceFuturesClient.getKlines({
  symbol: 'BTCUSDT',
  interval: '1h',
  limit: 100
});
```

### CoinGecko Client

```javascript
const { coinGeckoClient } = require('./modules/coingecko');

// Fetch top coins by volume
const topCoins = await coinGeckoClient.fetchTopCoins({
  per_page: 200,
  order: 'volume_desc'
});

// Fetch global market data
const global = await coinGeckoClient.fetchGlobalData();
console.log('BTC Dominance:', global.btcDominance);
console.log('Total Market Cap:', global.totalMarketCap);
```

### Market Radar

```javascript
const { marketRadar } = require('./modules/marketRadar');

// Generate market snapshot
const snapshot = await marketRadar.generateSnapshot({ topCoinsCount: 200 });

console.log('Regime Score:', snapshot.regimeScore, '/100');
console.log('Regime:', snapshot.regimeLabel);  // STRONG_BULL, BULL, NEUTRAL, BEAR, STRONG_BEAR
console.log('Advancers:', snapshot.breadth.advancers);
console.log('Decliners:', snapshot.breadth.decliners);
console.log('A/D Ratio:', snapshot.breadth.advancersDeclinerRatio);
console.log('Median Return:', snapshot.breadth.medianReturn + '%');
console.log('Top Gainers:', snapshot.leaders.topGainers.slice(0, 5));
console.log('Top Losers:', snapshot.leaders.topLosers.slice(0, 5));
console.log('Summary:', snapshot.summary);
```

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

// Wheel of 24
const wheel = gann.wheelOf24(45000);
console.log('Degrees:', wheel.degrees.normalized);

// Price targets
const targets = gann.calculateTargets(45000, 0.5, 5);
console.log('Key Levels:', targets.keyLevels);
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/health` | GET | Health check with DB status |
| `/api/gann/demo/:price` | GET | Demo Gann analysis |

## Caching & Rate Limits

All market data modules implement:
- **Retry Logic**: 3 attempts with exponential backoff
- **Caching**: TTL per endpoint type (3s-60s)
- **Normalized Output**: Numbers parsed, timestamps in milliseconds

| Module | Ticker TTL | Historical TTL | Rate Limit |
|--------|------------|----------------|------------|
| Bybit | 5s | 60s | 10 req/s |
| Binance | 5s | 60s | 2400 req/min |
| CoinGecko | 60s | 120s | 30 req/min |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `TZ` | No | Display timezone (default: Asia/Kolkata) |
| `DATABASE_URL` | No* | PostgreSQL connection string |
| `LOG_LEVEL` | No | Log verbosity (default: info) |
| `COINGECKO_API_KEY` | **Yes** | CoinGecko Demo API key |
| `BYBIT_BASE_URL` | No | Bybit API URL |
| `BINANCE_FUTURES_BASE_URL` | No | Binance Futures API URL |

*Server runs without DB in development for testing

## Railway Deployment

1. Push code to GitHub
2. Create new Railway project
3. Add PostgreSQL plugin (optional)
4. Set environment variables:
   - `COINGECKO_API_KEY` (required)
5. Connect GitHub repo
6. Railway auto-detects Node.js and deploys

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Test Gann module
npm run test:gann

# Test market data modules
node scripts/test-market-data.js

# Run Gann examples
node modules/gann.js
```

## Parts Roadmap

- **Part 1** ✅: Foundation, schema, Gann engine
- **Part 2** ✅: Market data (Bybit, Binance, CoinGecko, Market Radar)
- **Part 3**: Telegram bot, AI analysis, alerts
- **Part 4**: Learning system, backtesting, optimization

## Key Principles

1. **Deterministic Core**: Gann module is pure math - no APIs, no AI
2. **Public APIs Only**: No trading execution, read-only market data
3. **Caching**: Prevents API spam, respects rate limits
4. **Learning Ready**: Schema supports feature/outcome tracking
5. **Railway Compatible**: Designed for easy cloud deployment

## License

ISC
