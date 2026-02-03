/**
 * MESSAGE FORMATTERS
 * ==================
 * Telegram message formatting utilities
 * All formatting in HTML mode for rich display
 */

const logger = require('../utils/logger');
const { ZODIAC_SIGNS, MAJOR_ASPECTS } = require('../config/constants');

// ============================================================
// CONSTANTS
// ============================================================

const TREND_EMOJI = {
  bullish: '🟢',
  bearish: '🔴',
  neutral: '⚪'
};

const CONFIDENCE_EMOJI = {
  high: '🔥',
  medium: '⚡',
  low: '💭'
};

const REGIME_EMOJI = {
  'EXTREME_GREED': '🚀',
  'GREED': '📈',
  'NEUTRAL': '➡️',
  'FEAR': '📉',
  'EXTREME_FEAR': '💀'
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format price with comma separators
 */
function formatPrice(price, decimals = 2) {
  if (price === null || price === undefined) return 'N/A';
  return '$' + Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format percentage with sign
 */
function formatPercent(pct, decimals = 2) {
  if (pct === null || pct === undefined) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(decimals) + '%';
}

/**
 * Format timestamp to IST
 */
function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Format short date
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short'
  });
}

/**
 * Escape HTML characters for Telegram
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Create progress bar
 */
function progressBar(value, max = 100, length = 10) {
  const filled = Math.round((value / max) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================================
// BRIEFING FORMATTERS
// ============================================================

/**
 * Format daily briefing message
 */
function formatDailyBriefing(data) {
  const {
    price,
    gann,
    planetary,
    marketRadar,
    confluence,
    timestamp = new Date()
  } = data;

  const istTime = formatTime(timestamp);
  const trendEmoji = TREND_EMOJI[confluence?.bias || 'neutral'];

  let msg = `<b>🌅 DAILY BRIEFING</b>\n`;
  msg += `<code>${istTime}</code>\n\n`;

  // Current Price
  msg += `<b>BTC/USDT:</b> ${formatPrice(price)}\n\n`;

  // Confluence Score
  if (confluence) {
    const confBar = progressBar(confluence.score * 100);
    msg += `<b>⚡ Confluence:</b> ${(confluence.score * 100).toFixed(0)}%\n`;
    msg += `${confBar} ${trendEmoji} ${confluence.bias.toUpperCase()}\n\n`;
  }

  // Gann Levels
  if (gann?.sq9) {
    msg += `<b>📐 GANN LEVELS</b>\n`;
    msg += `Position: ${gann.sq9.degreePosition?.toFixed(1) || 'N/A'}° on wheel\n`;

    if (gann.targets?.closestSupport) {
      msg += `Support: ${formatPrice(gann.targets.closestSupport.level)}\n`;
    }
    if (gann.targets?.closestResistance) {
      msg += `Resist: ${formatPrice(gann.targets.closestResistance.level)}\n`;
    }
    msg += '\n';
  }

  // Planetary Timing
  if (planetary) {
    msg += `<b>🌙 PLANETARY TIMING</b>\n`;

    if (planetary.moon) {
      msg += `Moon: ${planetary.moon.phaseSymbol || '🌓'} ${planetary.moon.phase || 'N/A'}\n`;
    }

    if (planetary.aspects?.length > 0) {
      const topAspect = planetary.aspects[0];
      msg += `Key Aspect: ${topAspect.planet1?.name || 'Planet'} ${topAspect.aspect?.symbol || '☌'} ${topAspect.planet2?.name || 'Planet'}\n`;
    }

    if (planetary.majorEvents?.length > 0) {
      msg += `Events: ${planetary.majorEvents.length} upcoming\n`;
    }
    msg += '\n';
  }

  // Market Radar
  if (marketRadar) {
    const regimeEmoji = REGIME_EMOJI[marketRadar.regimeLabel] || '➡️';
    msg += `<b>📡 MARKET RADAR</b>\n`;
    msg += `Regime: ${regimeEmoji} ${marketRadar.regimeLabel || 'N/A'}\n`;

    if (marketRadar.breadth) {
      const { advancing, declining } = marketRadar.breadth;
      msg += `Breadth: ${advancing || 0} up / ${declining || 0} down\n`;
    }
    msg += '\n';
  }

  // Key Levels Summary
  if (gann?.targets?.keyLevels?.length > 0) {
    msg += `<b>🎯 KEY LEVELS</b>\n`;
    gann.targets.keyLevels.slice(0, 3).forEach(level => {
      const arrow = level.direction === 'resistance' ? '↑' : '↓';
      msg += `${arrow} ${formatPrice(level.level)} (${level.sources?.join('+') || 'mixed'})\n`;
    });
    msg += '\n';
  }

  // Trading Bias Summary
  msg += `<b>📊 BIAS:</b> ${trendEmoji} ${(confluence?.bias || 'NEUTRAL').toUpperCase()}\n`;

  return msg;
}

/**
 * Format weekly war room message
 */
function formatWeeklyWarRoom(data) {
  const {
    weekNumber,
    priceStart,
    priceEnd,
    weeklyReturn,
    gann,
    planetary,
    cycleAnalysis,
    performance,
    upcomingWeek,
    timestamp = new Date()
  } = data;

  const istTime = formatTime(timestamp);
  const retEmoji = weeklyReturn >= 0 ? '🟢' : '🔴';

  let msg = `<b>🎖️ WEEKLY WAR ROOM</b>\n`;
  msg += `<code>${istTime}</code>\n\n`;

  // Week Summary
  msg += `<b>📅 Week ${weekNumber || 'N/A'} Summary</b>\n`;
  msg += `Open: ${formatPrice(priceStart)}\n`;
  msg += `Close: ${formatPrice(priceEnd)}\n`;
  msg += `Return: ${retEmoji} ${formatPercent(weeklyReturn)}\n\n`;

  // Cycle Analysis
  if (cycleAnalysis) {
    msg += `<b>⏳ CYCLE STATUS</b>\n`;
    msg += `Convergence: ${(cycleAnalysis.convergenceScore * 100).toFixed(0)}%\n`;
    msg += `Bias: ${cycleAnalysis.cycleBias?.toUpperCase() || 'NEUTRAL'}\n`;

    if (cycleAnalysis.majorHits?.length > 0) {
      msg += `Active Cycles: ${cycleAnalysis.majorHits.length}\n`;
      const topCycle = cycleAnalysis.majorHits[0];
      msg += `Top: ${topCycle.cycleLength}d from ${topCycle.event?.type || 'event'}\n`;
    }
    msg += '\n';
  }

  // Planetary Overview
  if (planetary?.majorEvents?.length > 0) {
    msg += `<b>🌟 UPCOMING CELESTIAL</b>\n`;
    planetary.majorEvents.slice(0, 3).forEach(event => {
      msg += `• ${event.type}: ${event.description || formatDate(event.date)}\n`;
    });
    msg += '\n';
  }

  // Performance Metrics
  if (performance) {
    msg += `<b>📈 MODEL PERFORMANCE</b>\n`;
    msg += `Hit Rate (24h): ${((performance.hitRate24h || 0) * 100).toFixed(0)}%\n`;
    msg += `Avg Return: ${formatPercent(performance.avgReturn || 0)}\n`;
    msg += `Snapshots: ${performance.snapshotCount || 0}\n\n`;
  }

  // Week Ahead
  if (upcomingWeek) {
    msg += `<b>🔮 WEEK AHEAD</b>\n`;
    msg += `Bias: ${TREND_EMOJI[upcomingWeek.bias] || '⚪'} ${(upcomingWeek.bias || 'NEUTRAL').toUpperCase()}\n`;
    msg += `Key Date: ${upcomingWeek.keyDate || 'N/A'}\n`;
    if (upcomingWeek.keyLevel) {
      msg += `Watch Level: ${formatPrice(upcomingWeek.keyLevel)}\n`;
    }
  }

  return msg;
}

/**
 * Format alert message
 */
function formatAlert(data) {
  const {
    type,
    price,
    confluence,
    trigger,
    timestamp = new Date()
  } = data;

  const typeEmoji = {
    'level_touch': '🎯',
    'confluence_spike': '⚡',
    'planetary_event': '🌟',
    'cycle_convergence': '⏳'
  };

  const emoji = typeEmoji[type] || '📢';
  const trendEmoji = TREND_EMOJI[confluence?.bias || 'neutral'];

  let msg = `<b>${emoji} ALERT: ${(type || 'SIGNAL').replace(/_/g, ' ').toUpperCase()}</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n`;

  if (confluence) {
    msg += `<b>Confluence:</b> ${(confluence.score * 100).toFixed(0)}% ${trendEmoji}\n`;
  }

  if (trigger) {
    msg += `\n<b>Trigger:</b> ${escapeHtml(trigger)}\n`;
  }

  return msg;
}

/**
 * Format confluence analysis message
 */
function formatConfluence(data) {
  const {
    price,
    score,
    bias,
    components,
    timestamp = new Date()
  } = data;

  const trendEmoji = TREND_EMOJI[bias || 'neutral'];
  const confBar = progressBar(score * 100);

  let msg = `<b>⚡ CONFLUENCE ANALYSIS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n`;
  msg += `<b>Score:</b> ${(score * 100).toFixed(0)}%\n`;
  msg += `${confBar} ${trendEmoji}\n\n`;

  if (components) {
    msg += `<b>Components:</b>\n`;
    if (components.gannScore !== undefined) {
      msg += `• Gann: ${(components.gannScore * 100).toFixed(0)}%\n`;
    }
    if (components.cycleScore !== undefined) {
      msg += `• Cycles: ${(components.cycleScore * 100).toFixed(0)}%\n`;
    }
    if (components.planetaryScore !== undefined) {
      msg += `• Planetary: ${(components.planetaryScore * 100).toFixed(0)}%\n`;
    }
    if (components.momentumScore !== undefined) {
      msg += `• Momentum: ${(components.momentumScore * 100).toFixed(0)}%\n`;
    }
  }

  msg += `\n<b>Bias:</b> ${(bias || 'NEUTRAL').toUpperCase()}\n`;

  return msg;
}

/**
 * Format planetary info message
 */
function formatPlanetary(data) {
  const {
    planets,
    moon,
    aspects,
    majorEvents,
    timestamp = new Date()
  } = data;

  let msg = `<b>🌌 PLANETARY POSITIONS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  // Moon Info
  if (moon) {
    msg += `<b>🌙 MOON</b>\n`;
    msg += `Phase: ${moon.phaseSymbol || '🌓'} ${moon.phase || 'N/A'}\n`;
    msg += `Illumination: ${moon.illumination?.toFixed(1) || 'N/A'}%\n`;
    if (moon.sign) {
      msg += `Sign: ${moon.sign.symbol || ''} ${moon.sign.name || 'N/A'}\n`;
    }
    msg += '\n';
  }

  // Key Planets
  if (planets && Object.keys(planets).length > 0) {
    msg += `<b>☀️ PLANETS</b>\n`;
    const keyPlanets = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    keyPlanets.forEach(name => {
      const planet = planets[name];
      if (planet) {
        const signSymbol = planet.sign?.symbol || '';
        msg += `${planet.symbol || '●'} ${name}: ${planet.longitude?.toFixed(1) || 'N/A'}° ${signSymbol}\n`;
      }
    });
    msg += '\n';
  }

  // Active Aspects
  if (aspects?.length > 0) {
    msg += `<b>✨ ACTIVE ASPECTS</b>\n`;
    aspects.slice(0, 5).forEach(asp => {
      const p1 = asp.planet1?.symbol || asp.planet1?.name || '?';
      const p2 = asp.planet2?.symbol || asp.planet2?.name || '?';
      const aspSymbol = asp.aspect?.symbol || '☌';
      const orb = asp.orb?.toFixed(1) || '?';
      msg += `${p1} ${aspSymbol} ${p2} (${orb}°)\n`;
    });
    msg += '\n';
  }

  // Upcoming Events
  if (majorEvents?.length > 0) {
    msg += `<b>📅 UPCOMING EVENTS</b>\n`;
    majorEvents.slice(0, 3).forEach(event => {
      const dateStr = event.date ? formatDate(event.date) : 'Soon';
      msg += `• ${event.type || 'Event'}: ${dateStr}\n`;
    });
  }

  return msg;
}

/**
 * Format Gann analysis message
 */
function formatGann(data) {
  const {
    price,
    sq9,
    wheel24,
    targets,
    angles,
    timestamp = new Date()
  } = data;

  let msg = `<b>📐 GANN ANALYSIS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC:</b> ${formatPrice(price)}\n\n`;

  // Square of 9
  if (sq9) {
    msg += `<b>🔢 SQUARE OF 9</b>\n`;
    msg += `Degree: ${sq9.degreePosition?.toFixed(1) || 'N/A'}°\n`;
    msg += `In Square: ${sq9.percentInSquare?.toFixed(1) || 'N/A'}%\n`;

    const flags = [];
    if (sq9.flags?.nearCardinal) flags.push('Cardinal');
    if (sq9.flags?.nearTop) flags.push('Near Top');
    if (sq9.flags?.nearBottom) flags.push('Near Bottom');
    if (flags.length > 0) {
      msg += `Flags: ${flags.join(', ')}\n`;
    }
    msg += '\n';
  }

  // Wheel of 24
  if (wheel24) {
    msg += `<b>🎡 WHEEL OF 24</b>\n`;
    msg += `Degrees: ${wheel24.degrees?.normalized?.toFixed(1) || 'N/A'}°\n`;
    msg += `Quadrant: ${wheel24.wheelPosition?.quadrant || 'N/A'}\n`;
    msg += `${wheel24.wheelPosition?.description || ''}\n\n`;
  }

  // Key Levels
  if (targets) {
    msg += `<b>🎯 KEY LEVELS</b>\n`;

    if (targets.closestSupport) {
      msg += `↓ Support: ${formatPrice(targets.closestSupport.level)} (${formatPercent(targets.closestSupport.percentFromPrice)})\n`;
    }
    if (targets.closestResistance) {
      msg += `↑ Resist: ${formatPrice(targets.closestResistance.level)} (${formatPercent(targets.closestResistance.percentFromPrice)})\n`;
    }

    if (targets.keyLevels?.length > 0) {
      msg += `\n<b>Convergence Levels:</b>\n`;
      targets.keyLevels.slice(0, 3).forEach(level => {
        const arrow = level.direction === 'resistance' ? '↑' : '↓';
        msg += `${arrow} ${formatPrice(level.level)} [${level.sources?.join('+')}]\n`;
      });
    }
  }

  return msg;
}

/**
 * Format error message
 */
function formatError(error, context = '') {
  let msg = `<b>⚠️ Error</b>\n`;
  if (context) {
    msg += `<code>${escapeHtml(context)}</code>\n\n`;
  }
  msg += escapeHtml(error.message || String(error));
  return msg;
}

/**
 * Format help message
 */
function formatHelp() {
  return `<b>🤖 CRYPTO BILLIONAIRE BOT</b>

<b>Commands:</b>
/status - Current BTC analysis
/gann - Gann Square of 9 & Wheel
/planets - Planetary positions
/confluence - Confluence score
/levels - Key support/resistance
/help - This help message

<b>Scheduled:</b>
• Daily Briefing: 5:30 AM IST
• Weekly War Room: Sat 6:00 PM IST
• Alerts: On high confluence only

<b>Note:</b> This is for analysis only.
Not financial advice. DYOR.`;
}

/**
 * Format status message
 */
function formatStatus(data) {
  const {
    price,
    change24h,
    confluence,
    nextBriefing,
    botUptime,
    timestamp = new Date()
  } = data;

  const changeEmoji = change24h >= 0 ? '🟢' : '🔴';

  let msg = `<b>📊 BOT STATUS</b>\n`;
  msg += `<code>${formatTime(timestamp)}</code>\n\n`;

  msg += `<b>BTC/USDT:</b> ${formatPrice(price)}\n`;
  msg += `24h Change: ${changeEmoji} ${formatPercent(change24h)}\n\n`;

  if (confluence) {
    const confBar = progressBar(confluence.score * 100);
    msg += `<b>Confluence:</b> ${(confluence.score * 100).toFixed(0)}%\n`;
    msg += `${confBar}\n`;
    msg += `Bias: ${TREND_EMOJI[confluence.bias]} ${(confluence.bias || 'NEUTRAL').toUpperCase()}\n\n`;
  }

  if (nextBriefing) {
    msg += `<b>Next Briefing:</b>\n`;
    msg += `${formatTime(nextBriefing)}\n\n`;
  }

  if (botUptime) {
    const hours = Math.floor(botUptime / 3600);
    const mins = Math.floor((botUptime % 3600) / 60);
    msg += `<b>Uptime:</b> ${hours}h ${mins}m\n`;
  }

  return msg;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Utilities
  formatPrice,
  formatPercent,
  formatTime,
  formatDate,
  escapeHtml,
  progressBar,

  // Message formatters
  formatDailyBriefing,
  formatWeeklyWarRoom,
  formatAlert,
  formatConfluence,
  formatPlanetary,
  formatGann,
  formatError,
  formatHelp,
  formatStatus,

  // Constants
  TREND_EMOJI,
  CONFIDENCE_EMOJI,
  REGIME_EMOJI
};
