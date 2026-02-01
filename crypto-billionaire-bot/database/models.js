/**
 * Database Models for Crypto Billionaire Bot
 * All timestamps stored in UTC, displayed in Asia/Kolkata
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Connection pool
let pool = null;

/**
 * Default weights for scoring system
 */
const DEFAULT_WEIGHTS = {
  gann_sq9_weight: 0.25,
  gann_angles_weight: 0.20,
  cycle_major_weight: 0.20,
  cycle_minor_weight: 0.10,
  wheel24_weight: 0.15,
  momentum_weight: 0.10,
  level_proximity_bonus: 0.15,
  cycle_convergence_bonus: 0.20
};

/**
 * Initialize database connection pool
 * @returns {Promise<Pool>}
 */
async function initDb() {
  if (pool) {
    logger.info('Database pool already initialized');
    return pool;
  }

  const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  pool = new Pool(connectionConfig);

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    logger.info('Database connected successfully', {
      serverTime: result.rows[0].now,
      poolSize: pool.totalCount
    });
    client.release();
    return pool;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    throw error;
  }
}

/**
 * Get the database pool
 * @returns {Pool}
 */
function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

/**
 * Close database pool
 */
async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

// ============================================================
// PRICE HISTORY FUNCTIONS
// ============================================================

/**
 * Insert a price point into price_history
 * @param {Date|string} ts - Timestamp
 * @param {number} price - Close price
 * @param {number} volume - Volume (optional)
 * @param {string} source - Data source (default: 'binance')
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
 */
async function insertPricePoint(ts, price, volume = null, source = 'binance', options = {}) {
  const {
    symbol = 'BTCUSDT',
    openPrice = null,
    highPrice = null,
    lowPrice = null,
    timeframe = '1m'
  } = options;

  const query = `
    INSERT INTO price_history
      (timestamp, symbol, source, open_price, high_price, low_price, close_price, volume, timeframe)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, timestamp, close_price
  `;

  try {
    const result = await getPool().query(query, [
      ts, symbol, source, openPrice, highPrice, lowPrice, price, volume, timeframe
    ]);
    logger.debug('Price point inserted', { id: result.rows[0].id, price });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to insert price point', { error: error.message, price, ts });
    throw error;
  }
}

/**
 * Get recent price history
 * @param {number} minutes - Number of minutes to look back
 * @param {string} source - Data source filter
 * @param {Object} options - Additional options
 * @returns {Promise<Array>}
 */
async function getRecentPriceHistory(minutes, source = null, options = {}) {
  const { symbol = 'BTCUSDT', timeframe = null, limit = 1000 } = options;

  let query = `
    SELECT
      id, timestamp, symbol, source,
      open_price, high_price, low_price, close_price,
      volume, timeframe
    FROM price_history
    WHERE symbol = $1
      AND timestamp >= NOW() - INTERVAL '${parseInt(minutes)} minutes'
  `;

  const params = [symbol];
  let paramIndex = 2;

  if (source) {
    query += ` AND source = $${paramIndex}`;
    params.push(source);
    paramIndex++;
  }

  if (timeframe) {
    query += ` AND timeframe = $${paramIndex}`;
    params.push(timeframe);
    paramIndex++;
  }

  query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
  params.push(limit);

  try {
    const result = await getPool().query(query, params);
    logger.debug('Retrieved price history', { count: result.rows.length, minutes });
    return result.rows;
  } catch (error) {
    logger.error('Failed to get price history', { error: error.message, minutes });
    throw error;
  }
}

/**
 * Get price at specific timestamp (or closest)
 * @param {Date|string} timestamp
 * @param {string} symbol
 * @returns {Promise<Object|null>}
 */
async function getPriceAt(timestamp, symbol = 'BTCUSDT') {
  const query = `
    SELECT * FROM price_history
    WHERE symbol = $1 AND timestamp <= $2
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  try {
    const result = await getPool().query(query, [symbol, timestamp]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get price at timestamp', { error: error.message, timestamp });
    throw error;
  }
}

// ============================================================
// ANALYSIS SNAPSHOTS FUNCTIONS
// ============================================================

/**
 * Insert an analysis snapshot
 * @param {Object} features - All computed features at this moment
 * @param {Object} meta - Metadata (timeframe, universe, symbol_scope)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
 */
async function insertAnalysisSnapshot(features, meta, options = {}) {
  const {
    symbol = 'BTCUSDT',
    snapshotTime = new Date(),
    priceAtSnapshot = null,
    tags = []
  } = options;

  // Validate required fields
  if (!features || typeof features !== 'object') {
    throw new Error('Features must be a valid object');
  }

  if (!meta || typeof meta !== 'object') {
    throw new Error('Meta must be a valid object');
  }

  // Extract price from features if not provided
  const price = priceAtSnapshot || features.currentPrice || features.price;
  if (!price) {
    throw new Error('Price is required either in options or features');
  }

  const query = `
    INSERT INTO analysis_snapshots
      (snapshot_time, symbol, price_at_snapshot, features, meta, tags)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, snapshot_time, symbol, price_at_snapshot
  `;

  try {
    const result = await getPool().query(query, [
      snapshotTime,
      symbol,
      price,
      JSON.stringify(features),
      JSON.stringify(meta),
      JSON.stringify(tags)
    ]);

    logger.info('Analysis snapshot created', {
      id: result.rows[0].id,
      symbol,
      price,
      meta
    });

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to insert analysis snapshot', { error: error.message });
    throw error;
  }
}

/**
 * Get analysis snapshots with filters
 * @param {Object} filters - Query filters
 * @returns {Promise<Array>}
 */
async function getAnalysisSnapshots(filters = {}) {
  const {
    symbol = 'BTCUSDT',
    startTime = null,
    endTime = null,
    timeframe = null,
    limit = 100
  } = filters;

  let query = `
    SELECT * FROM analysis_snapshots
    WHERE symbol = $1
  `;
  const params = [symbol];
  let paramIndex = 2;

  if (startTime) {
    query += ` AND snapshot_time >= $${paramIndex}`;
    params.push(startTime);
    paramIndex++;
  }

  if (endTime) {
    query += ` AND snapshot_time <= $${paramIndex}`;
    params.push(endTime);
    paramIndex++;
  }

  if (timeframe) {
    query += ` AND meta->>'timeframe' = $${paramIndex}`;
    params.push(timeframe);
    paramIndex++;
  }

  query += ` ORDER BY snapshot_time DESC LIMIT $${paramIndex}`;
  params.push(limit);

  try {
    const result = await getPool().query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get analysis snapshots', { error: error.message });
    throw error;
  }
}

// ============================================================
// OUTCOME LABELS FUNCTIONS
// ============================================================

/**
 * Insert outcome labels for a snapshot
 * @param {string} snapshotId - UUID of the analysis snapshot
 * @param {Array} labels - Array of label objects with horizon, returns, mae, mfe
 * @returns {Promise<Array>}
 */
async function insertOutcomeLabels(snapshotId, labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new Error('Labels must be a non-empty array');
  }

  const results = [];
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    for (const label of labels) {
      const {
        horizon,
        horizonEndTime,
        priceAtHorizon,
        returnsPercent,
        directionActual,
        mae = null,
        mfe = null,
        volatilityDuring = null
      } = label;

      // Validate horizon
      if (!['1h', '4h', '24h'].includes(horizon)) {
        throw new Error(`Invalid horizon: ${horizon}. Must be 1h, 4h, or 24h`);
      }

      const query = `
        INSERT INTO outcome_labels
          (snapshot_id, horizon, horizon_end_time, price_at_horizon,
           returns_percent, direction_actual, mae, mfe, volatility_during)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (snapshot_id, horizon)
        DO UPDATE SET
          horizon_end_time = EXCLUDED.horizon_end_time,
          price_at_horizon = EXCLUDED.price_at_horizon,
          returns_percent = EXCLUDED.returns_percent,
          direction_actual = EXCLUDED.direction_actual,
          mae = EXCLUDED.mae,
          mfe = EXCLUDED.mfe,
          volatility_during = EXCLUDED.volatility_during,
          labeled_at = NOW()
        RETURNING *
      `;

      const result = await client.query(query, [
        snapshotId, horizon, horizonEndTime, priceAtHorizon,
        returnsPercent, directionActual, mae, mfe, volatilityDuring
      ]);

      results.push(result.rows[0]);
    }

    await client.query('COMMIT');
    logger.info('Outcome labels inserted', { snapshotId, count: results.length });
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to insert outcome labels', { error: error.message, snapshotId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get outcome labels for a snapshot
 * @param {string} snapshotId
 * @returns {Promise<Array>}
 */
async function getOutcomeLabels(snapshotId) {
  const query = `
    SELECT * FROM outcome_labels
    WHERE snapshot_id = $1
    ORDER BY horizon
  `;

  try {
    const result = await getPool().query(query, [snapshotId]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get outcome labels', { error: error.message, snapshotId });
    throw error;
  }
}

// ============================================================
// WEIGHT VERSIONS FUNCTIONS
// ============================================================

/**
 * Get the latest active weights, or defaults if none exist
 * @returns {Promise<Object>}
 */
async function getLatestWeights() {
  const query = `
    SELECT * FROM weight_versions
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `;

  try {
    const result = await getPool().query(query);

    if (result.rows.length === 0) {
      logger.warn('No active weights found, using defaults');
      return {
        id: null,
        version_number: 0,
        weights: DEFAULT_WEIGHTS,
        reason: 'Default weights (no active version in database)',
        is_active: true,
        created_at: new Date()
      };
    }

    logger.debug('Retrieved latest weights', {
      versionNumber: result.rows[0].version_number
    });

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get latest weights, using defaults', { error: error.message });
    return {
      id: null,
      version_number: 0,
      weights: DEFAULT_WEIGHTS,
      reason: 'Default weights (database error)',
      is_active: true,
      created_at: new Date()
    };
  }
}

/**
 * Save new weights version
 * @param {Object} weights - Weight values
 * @param {string} reason - Why this version was created
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
 */
async function saveWeights(weights, reason, options = {}) {
  const {
    performanceMetrics = {},
    activateImmediately = false
  } = options;

  // Validate weights
  if (!weights || typeof weights !== 'object') {
    throw new Error('Weights must be a valid object');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // If activating immediately, deactivate all existing
    if (activateImmediately) {
      await client.query(
        'UPDATE weight_versions SET is_active = false WHERE is_active = true'
      );
    }

    const query = `
      INSERT INTO weight_versions
        (weights, reason, performance_metrics, is_active, activated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await client.query(query, [
      JSON.stringify(weights),
      reason,
      JSON.stringify(performanceMetrics),
      activateImmediately,
      activateImmediately ? new Date() : null
    ]);

    await client.query('COMMIT');

    logger.info('New weights version saved', {
      id: result.rows[0].id,
      versionNumber: result.rows[0].version_number,
      activated: activateImmediately
    });

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to save weights', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Activate a specific weight version
 * @param {string} versionId - UUID of the weight version
 * @returns {Promise<Object>}
 */
async function activateWeights(versionId) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // Deactivate all
    await client.query(
      'UPDATE weight_versions SET is_active = false WHERE is_active = true'
    );

    // Activate specified version
    const result = await client.query(
      `UPDATE weight_versions
       SET is_active = true, activated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [versionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Weight version not found: ${versionId}`);
    }

    await client.query('COMMIT');
    logger.info('Weights activated', { versionId });
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to activate weights', { error: error.message, versionId });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// USER SETTINGS FUNCTIONS
// ============================================================

/**
 * Upsert user settings
 * @param {number} chatId - Telegram chat ID
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>}
 */
async function upsertUserSettings(chatId, settings) {
  const {
    username = null,
    displayTimezone = 'Asia/Kolkata',
    preferredSymbols = ['BTCUSDT'],
    alertPreferences = { daily_briefing: true, level_alerts: true, cycle_alerts: true },
    riskProfile = 'moderate',
    notificationHours = { start: 8, end: 22 },
    isActive = true,
    isPremium = false
  } = settings;

  const query = `
    INSERT INTO user_settings
      (chat_id, username, display_timezone, preferred_symbols,
       alert_preferences, risk_profile, notification_hours, is_active, is_premium)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (chat_id)
    DO UPDATE SET
      username = COALESCE(EXCLUDED.username, user_settings.username),
      display_timezone = EXCLUDED.display_timezone,
      preferred_symbols = EXCLUDED.preferred_symbols,
      alert_preferences = EXCLUDED.alert_preferences,
      risk_profile = EXCLUDED.risk_profile,
      notification_hours = EXCLUDED.notification_hours,
      is_active = EXCLUDED.is_active,
      is_premium = EXCLUDED.is_premium,
      updated_at = NOW()
    RETURNING *
  `;

  try {
    const result = await getPool().query(query, [
      chatId,
      username,
      displayTimezone,
      JSON.stringify(preferredSymbols),
      JSON.stringify(alertPreferences),
      riskProfile,
      JSON.stringify(notificationHours),
      isActive,
      isPremium
    ]);

    logger.info('User settings upserted', { chatId, username });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to upsert user settings', { error: error.message, chatId });
    throw error;
  }
}

/**
 * Get user settings
 * @param {number} chatId - Telegram chat ID
 * @returns {Promise<Object|null>}
 */
async function getUserSettings(chatId) {
  const query = `
    SELECT * FROM user_settings
    WHERE chat_id = $1
  `;

  try {
    const result = await getPool().query(query, [chatId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get user settings', { error: error.message, chatId });
    throw error;
  }
}

/**
 * Get all active users
 * @returns {Promise<Array>}
 */
async function getActiveUsers() {
  const query = `
    SELECT * FROM user_settings
    WHERE is_active = true
    ORDER BY created_at
  `;

  try {
    const result = await getPool().query(query);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get active users', { error: error.message });
    throw error;
  }
}

// ============================================================
// HISTORICAL EVENTS FUNCTIONS
// ============================================================

/**
 * Get historical events for cycle analysis
 * @param {string} symbol
 * @param {string} eventType - Optional filter by type
 * @returns {Promise<Array>}
 */
async function getHistoricalEvents(symbol = 'BTC', eventType = null) {
  let query = `
    SELECT * FROM historical_events
    WHERE symbol = $1
  `;
  const params = [symbol];

  if (eventType) {
    query += ' AND event_type = $2';
    params.push(eventType);
  }

  query += ' ORDER BY event_date DESC';

  try {
    const result = await getPool().query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get historical events', { error: error.message });
    throw error;
  }
}

/**
 * Insert historical event
 * @param {Object} event
 * @returns {Promise<Object>}
 */
async function insertHistoricalEvent(event) {
  const {
    eventDate,
    eventType,
    symbol = 'BTC',
    description,
    priceAtEvent = null,
    significance = 5,
    metadata = {}
  } = event;

  const query = `
    INSERT INTO historical_events
      (event_date, event_type, symbol, description, price_at_event, significance, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  try {
    const result = await getPool().query(query, [
      eventDate, eventType, symbol, description,
      priceAtEvent, significance, JSON.stringify(metadata)
    ]);
    logger.info('Historical event inserted', { id: result.rows[0].id, eventType });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to insert historical event', { error: error.message });
    throw error;
  }
}

// ============================================================
// PREDICTIONS FUNCTIONS
// ============================================================

/**
 * Insert a prediction
 * @param {Object} prediction
 * @returns {Promise<Object>}
 */
async function insertPrediction(prediction) {
  const {
    symbol = 'BTCUSDT',
    timeframe,
    predictionType,
    direction = 'neutral',
    entryPrice = null,
    targetPrice = null,
    stopPrice = null,
    confidenceScore = null,
    featuresUsed = {},
    rationale = null,
    validFrom,
    validUntil
  } = prediction;

  const query = `
    INSERT INTO predictions
      (symbol, timeframe, prediction_type, direction, entry_price,
       target_price, stop_price, confidence_score, features_used,
       rationale, valid_from, valid_until)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;

  try {
    const result = await getPool().query(query, [
      symbol, timeframe, predictionType, direction, entryPrice,
      targetPrice, stopPrice, confidenceScore, JSON.stringify(featuresUsed),
      rationale, validFrom, validUntil
    ]);
    logger.info('Prediction inserted', { id: result.rows[0].id, predictionType });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to insert prediction', { error: error.message });
    throw error;
  }
}

/**
 * Update prediction outcome
 * @param {string} predictionId
 * @param {string} outcome
 * @param {number} outcomePrice
 * @returns {Promise<Object>}
 */
async function updatePredictionOutcome(predictionId, outcome, outcomePrice) {
  const query = `
    UPDATE predictions
    SET outcome = $2, outcome_price = $3, outcome_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await getPool().query(query, [predictionId, outcome, outcomePrice]);
    if (result.rows.length === 0) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }
    logger.info('Prediction outcome updated', { predictionId, outcome });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to update prediction outcome', { error: error.message });
    throw error;
  }
}

// ============================================================
// DAILY BRIEFINGS FUNCTIONS
// ============================================================

/**
 * Insert or update daily briefing
 * @param {Object} briefing
 * @returns {Promise<Object>}
 */
async function upsertDailyBriefing(briefing) {
  const {
    briefingDate,
    symbol = 'BTCUSDT',
    openPrice = null,
    gannAnalysis,
    cycleAnalysis,
    keyLevels,
    marketBias = 'neutral',
    summary = null,
    alerts = []
  } = briefing;

  const query = `
    INSERT INTO daily_briefings
      (briefing_date, symbol, open_price, gann_analysis, cycle_analysis,
       key_levels, market_bias, summary, alerts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (briefing_date)
    DO UPDATE SET
      open_price = EXCLUDED.open_price,
      gann_analysis = EXCLUDED.gann_analysis,
      cycle_analysis = EXCLUDED.cycle_analysis,
      key_levels = EXCLUDED.key_levels,
      market_bias = EXCLUDED.market_bias,
      summary = EXCLUDED.summary,
      alerts = EXCLUDED.alerts
    RETURNING *
  `;

  try {
    const result = await getPool().query(query, [
      briefingDate, symbol, openPrice,
      JSON.stringify(gannAnalysis),
      JSON.stringify(cycleAnalysis),
      JSON.stringify(keyLevels),
      marketBias, summary,
      JSON.stringify(alerts)
    ]);
    logger.info('Daily briefing upserted', { briefingDate });
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to upsert daily briefing', { error: error.message });
    throw error;
  }
}

/**
 * Get daily briefing
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
async function getDailyBriefing(date) {
  const query = `
    SELECT * FROM daily_briefings
    WHERE briefing_date = $1
  `;

  try {
    const result = await getPool().query(query, [date]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get daily briefing', { error: error.message, date });
    throw error;
  }
}

// Export all functions
module.exports = {
  // Core
  initDb,
  getPool,
  closeDb,
  DEFAULT_WEIGHTS,

  // Price history
  insertPricePoint,
  getRecentPriceHistory,
  getPriceAt,

  // Analysis snapshots
  insertAnalysisSnapshot,
  getAnalysisSnapshots,

  // Outcome labels
  insertOutcomeLabels,
  getOutcomeLabels,

  // Weights
  getLatestWeights,
  saveWeights,
  activateWeights,

  // User settings
  upsertUserSettings,
  getUserSettings,
  getActiveUsers,

  // Historical events
  getHistoricalEvents,
  insertHistoricalEvent,

  // Predictions
  insertPrediction,
  updatePredictionOutcome,

  // Daily briefings
  upsertDailyBriefing,
  getDailyBriefing
};
