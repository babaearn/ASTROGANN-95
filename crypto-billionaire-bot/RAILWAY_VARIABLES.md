# Railway Environment Variables

Copy these to Railway → Your Project → Variables → Raw Editor

---

## Quick Copy (Replace values after pasting)

```env
TELEGRAM_BOT_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=PASTE_YOUR_CHAT_ID_HERE
GEMINI_API_KEY=PASTE_YOUR_GEMINI_KEY_HERE
COINGECKO_API_KEY=PASTE_YOUR_COINGECKO_KEY_HERE
TZ=Asia/Kolkata
NODE_ENV=production
BYBIT_BASE_URL=https://api.bybit.com
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
HORIZONS_ENABLED=true
LOG_LEVEL=info
```

---

## Variable-by-Variable (with instructions)

### REQUIRED VARIABLES

| Variable | Value | How to Get |
|----------|-------|------------|
| `TELEGRAM_BOT_TOKEN` | `YOUR_TOKEN` | 1. Open Telegram → @BotFather<br>2. Send `/newbot`<br>3. Follow prompts<br>4. Copy the token |
| `TELEGRAM_CHAT_ID` | `YOUR_CHAT_ID` | 1. Open Telegram → @userinfobot<br>2. Send `/start`<br>3. Copy your ID number |
| `GEMINI_API_KEY` | `YOUR_KEY` | 1. Go to https://aistudio.google.com/app/apikey<br>2. Create API Key<br>3. Copy the key |
| `COINGECKO_API_KEY` | `YOUR_KEY` | 1. Go to https://www.coingecko.com/en/api/pricing<br>2. Sign up for Demo (free)<br>3. Copy API key |
| `DATABASE_URL` | `auto` | **Auto-set by Railway PostgreSQL plugin** |

### RECOMMENDED VARIABLES

| Variable | Value | Description |
|----------|-------|-------------|
| `TZ` | `Asia/Kolkata` | Timezone for IST display |
| `NODE_ENV` | `production` | Production mode |
| `LOG_LEVEL` | `info` | Logging verbosity |

### OPTIONAL VARIABLES

| Variable | Default | Description |
|----------|---------|-------------|
| `BYBIT_BASE_URL` | `https://api.bybit.com` | Bybit API endpoint |
| `BINANCE_FUTURES_BASE_URL` | `https://fapi.binance.com` | Binance Futures endpoint |
| `HORIZONS_ENABLED` | `true` | JPL Horizons verification |
| `PROKERALA_ENABLED` | `false` | Prokerala verification |
| `PROKERALA_API_KEY` | - | Only if Prokerala enabled |
| `ADMIN_KEY` | - | For protected API endpoints |

---

## Setup Steps

### 1. Create Railway Project
```
Railway Dashboard → New Project → Deploy from GitHub
```

### 2. Add PostgreSQL Database
```
Your Project → Add Plugin → PostgreSQL
(DATABASE_URL is automatically configured)
```

### 3. Add Variables
```
Your Project → Variables → Raw Editor → Paste the Quick Copy block above
```

### 4. Replace Placeholder Values
Edit each `PASTE_YOUR_*_HERE` with your actual values

### 5. Deploy
Railway auto-deploys when you save variables

---

## Verification

After deploy, check these endpoints:

| Endpoint | Expected |
|----------|----------|
| `https://your-app.railway.app/health` | `{"status":"ok",...}` |
| `https://your-app.railway.app/status` | Full system status |

Send `/start` to your Telegram bot - it should respond!

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check `TELEGRAM_BOT_TOKEN` is correct |
| No briefings | Check `TELEGRAM_CHAT_ID` is correct |
| Database errors | Ensure PostgreSQL plugin is added |
| API errors | Verify `COINGECKO_API_KEY` is valid |
