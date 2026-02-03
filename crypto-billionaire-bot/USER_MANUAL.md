# CRYPTO BILLIONAIRE BOT - User Manual

## Quick Start

Your bot is live! Here's how to get billionaire-level crypto intelligence.

---

## Daily Workflow (Recommended)

### Morning Routine (5:30 AM IST - Automatic)
You'll receive the **Daily Briefing** automatically with:
- Current BTC price & 24h change
- Gann Square of 9 position & key levels
- Active planetary aspects & moon phase
- Confluence score with bias (Bullish/Neutral/Bearish)
- AI-generated market narrative

### Throughout the Day
- **High-confluence alerts** arrive automatically when score > 75%
- Use `/status` to check current conditions before any trade
- Use `/levels` to see exact support/resistance for entries/exits

### Weekend Review (Saturday 6 PM IST - Automatic)
The **Weekly War Room** briefing covers:
- Week's performance summary
- Upcoming cycle convergences
- Major planetary events ahead
- Weight calibration results (system learning)

---

## Commands Reference

### `/status` - Quick Market Check
**Use this before every trade decision.**

Shows:
- Current BTC price with 24h change
- Confluence score (0-100%)
- Current bias (Bullish/Neutral/Bearish)
- Active signals count

**Interpretation:**
- Score > 75%: High confluence - strong signal environment
- Score 50-75%: Moderate - proceed with caution
- Score < 50%: Low confluence - avoid new positions or reduce size

---

### `/gann` - Gann Analysis
**W.D. Gann's geometric price analysis.**

Shows:
- **Square of 9**: Price position on the spiral (0-360°)
  - Cardinal angles (0°, 90°, 180°, 270°) = major reversal zones
  - "Near Top" or "Near Bottom" flags = potential turning points

- **Wheel of 24**: Price divided into 24 sections
  - Quadrant 1-4 position
  - Approaching key rotations

- **Key Levels**: Calculated support/resistance
  - Convergence levels = multiple methods agree (stronger)

**Trading Application:**
```
Price at 337° (near 360°) = Approaching cycle completion
"Near Top" flag = Watch for reversal signals
Support at $77,972 = First downside target if breaks
```

---

### `/planets` - Planetary Positions
**Financial astrology timing indicators.**

Shows:
- **Moon Phase**: Full Moon / New Moon = volatility windows
- **Active Aspects**: Planet angles (conjunction, square, trine, etc.)
  - Tight orbs (< 2°) = stronger influence
  - Saturn aspects = restrictions, bottoms
  - Jupiter aspects = expansion, optimism
  - Mars aspects = volatility, action

**Key Aspects to Watch:**
| Aspect | Symbol | Meaning |
|--------|--------|---------|
| Conjunction | ☌ | Planets aligned - new beginnings |
| Sextile | ✱ | 60° - opportunity, flow |
| Square | □ | 90° - tension, turning points |
| Trine | △ | 120° - harmony, continuation |
| Opposition | ☍ | 180° - culmination, reversals |

---

### `/confluence` - Detailed Score Breakdown
**See exactly what's driving the current signal.**

Shows all 10 scoring components:
1. `gann_sq9_cardinal` - Near cardinal angles?
2. `gann_sq9_position` - Where in the square?
3. `gann_level_proximity` - Near key levels?
4. `cycle_convergence` - Multiple cycles aligning?
5. `cycle_major_hit` - Major cycle date?
6. `planetary_aspect_tight` - Tight planetary aspects?
7. `planetary_major_event` - Major event within 3 days?
8. `planetary_moon_phase` - Full/New Moon?
9. `market_regime` - Fear or Greed?
10. `market_momentum` - OI/Volume signals?

**Reading the Breakdown:**
- Green bars = bullish contribution
- Red bars = bearish contribution
- Higher individual scores = stronger signals

---

### `/levels` - Support & Resistance
**Exact price levels for entries and exits.**

Shows:
- Immediate support (closest below price)
- Immediate resistance (closest above price)
- Multiple calculation methods:
  - Square of 9 levels
  - Percentage-based levels
  - Wheel of 24 levels
  - Convergence zones (multiple methods agree)

**Usage:**
```
Current: $78,364
Support: $77,972 (-0.50%) ← Stop loss zone
Resist:  $78,756 (+0.50%) ← Take profit zone

Convergence at $78,904 = Strong resistance (multiple methods)
```

---

### `/cycles` - Time Cycle Analysis
**Gann's time cycles mapped to current date.**

Shows:
- Convergence score (how many cycles align)
- Days until next major cycle dates
- Historical events at similar cycle positions
- Cycle bias (bullish/bearish based on where we are)

**Gann Time Cycles Tracked:**
- 30, 45, 60, 90, 120, 144, 180, 270, 360 days
- Measured from major historical events (halvings, ATHs, crashes)

---

### `/help` - Command List
Quick reference of all available commands.

---

## Understanding Alerts

### Alert Types

**1. HIGH CONFLUENCE ALERT**
- Triggered when score crosses 75% threshold
- Indicates strong signal environment
- Not a buy/sell signal - means "pay attention now"

**2. LEVEL BREACH ALERT**
- Price crosses major Gann level
- Could be breakout or breakdown

**3. PLANETARY EVENT ALERT**
- Major aspect exact within hours
- Historical correlation with volatility

**4. CYCLE CONVERGENCE ALERT**
- Multiple time cycles align today
- Historically significant dates

### Alert Frequency
- Maximum 6 alerts per day (anti-spam)
- Minimum 2-hour cooldown between alerts
- Only high-quality signals pass the filter

---

## The Learning System

### How It Works

1. **Snapshots**: Every analysis is saved with timestamp and price
2. **Outcome Labeling**: System checks if predictions were correct after 1h, 4h, 24h
3. **Weight Calibration**: Weekly adjustment of component weights based on what's actually working

### What This Means
- The bot gets smarter over time
- Components that predict well get higher weights
- Components that fail get reduced weights
- You'll see calibration summaries in Weekly War Room

---

## Best Practices

### DO:
- Check `/status` before every trade
- Use `/levels` for stop-loss and take-profit placement
- Pay attention to high-confluence alerts
- Review the Weekly War Room for strategy planning
- Trust the system more after 4+ weeks of calibration

### DON'T:
- Trade purely based on confluence score
- Ignore your own technical analysis
- Over-leverage during low confluence
- Expect the bot to give buy/sell signals (it provides context)

---

## Environment Variables Required

For full functionality, ensure these are set in Railway:

```
# Required
DATABASE_URL=postgresql://...     (Railway PostgreSQL plugin)
TELEGRAM_BOT_TOKEN=your_token     (from @BotFather)
TELEGRAM_CHAT_ID=your_chat_id     (your personal chat ID)

# Recommended
GEMINI_API_KEY=your_key           (for AI narration)
COINGECKO_API_KEY=your_key        (backup price source)

# Optional
ADMIN_KEY=your_secret             (for manual job triggers)
LOG_LEVEL=info                    (debug for troubleshooting)
```

---

## Troubleshooting

### "Unable to fetch current price"
- Check if Bybit API is accessible
- Verify COINGECKO_API_KEY is set as backup

### No daily briefings received
- Check TELEGRAM_CHAT_ID is correct
- Verify bot has started (check `/health` endpoint)
- Check Railway logs for errors

### Confluence score seems stuck
- Database might not be connected
- Check DATABASE_URL is set correctly
- Weights need initial calibration period

### AI narration missing
- GEMINI_API_KEY not set or invalid
- System continues without AI (fallback text used)

---

## API Endpoints (Advanced)

```
GET /health          - Health check (always 200 if running)
GET /status          - Detailed system status
GET /api/gann/demo/:price      - Test Gann calculations
GET /api/planetary/current     - Current planetary data
GET /api/confluence/:price     - Test confluence scoring
POST /api/jobs/:jobName/run    - Manual job trigger (requires ADMIN_KEY)
```

---

## Philosophy

This bot embodies the principle that **confluence = confidence**.

It doesn't predict the future. It tells you when multiple independent systems (Gann geometry, planetary cycles, market structure) are saying the same thing at the same time.

When the square of 9 shows a cardinal angle, multiple time cycles converge, and planetary aspects are tight - that's when billionaires pay attention.

The rest is noise.

---

*Built for personal analysis. Not financial advice. DYOR.*
