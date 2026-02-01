/**
 * CRYPTO BILLIONAIRE BOT - Main Server
 * =====================================
 * Entry point for the intelligence bot
 * Express server with health check and database initialization
 */

require('dotenv').config();

const express = require('express');
const logger = require('./utils/logger');
const db = require('./database/models');
const gann = require('./modules/gann');

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================
// EXPRESS APP SETUP
// ============================================================

const app = express();

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {  // Don't log health checks
      logger.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        durationMs: duration
      });
    }
  });
  next();
});

// ============================================================
// ROUTES
// ============================================================

/**
 * Health check endpoint
 * Used by Railway and other platforms for health monitoring
 */
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    timestampIST: logger.toIST(new Date()),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: require('./package.json').version
  };

  // Check database connectivity
  try {
    const pool = db.getPool();
    const result = await pool.query('SELECT NOW() as db_time');
    health.database = {
      connected: true,
      serverTime: result.rows[0].db_time
    };
  } catch (error) {
    health.database = {
      connected: false,
      error: error.message
    };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Root endpoint - basic info
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Crypto Billionaire Bot',
    description: 'Billionaire-level crypto intelligence for personal intraday futures analysis',
    version: require('./package.json').version,
    endpoints: {
      health: '/health',
      gannDemo: '/api/gann/demo/:price'
    },
    documentation: 'See README.md for setup and usage instructions'
  });
});

/**
 * Gann Demo endpoint - demonstrates Gann calculations
 * Example: GET /api/gann/demo/45000
 */
app.get('/api/gann/demo/:price', (req, res) => {
  try {
    const price = parseFloat(req.params.price);

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        error: 'Invalid price',
        message: 'Price must be a positive number'
      });
    }

    // Run all Gann analyses
    const sq9 = gann.squareOf9(price);
    const wheel = gann.wheelOf24(price);
    const targets = gann.calculateTargets(price, 0.5, 5);

    // Get historical events for cycle analysis (from db default data)
    const mockHistoricalEvents = [
      { event_date: '2024-04-20', event_type: 'halving', description: 'BTC Halving', significance: 10 },
      { event_date: '2024-03-14', event_type: 'ath', description: 'Post-ETF ATH', significance: 8 },
      { event_date: '2022-11-09', event_type: 'crash', description: 'FTX Collapse', significance: 9 },
      { event_date: '2021-11-10', event_type: 'ath', description: '2021 Cycle ATH', significance: 9 },
      { event_date: '2020-05-11', event_type: 'halving', description: 'Third Halving', significance: 10 }
    ];

    const cycles = gann.analyzeCycles(new Date(), mockHistoricalEvents);

    res.json({
      price,
      timestamp: new Date().toISOString(),
      analysis: {
        squareOf9: {
          degreePosition: sq9.degreePosition,
          percentInSquare: sq9.percentInSquare,
          flags: sq9.flags,
          topSupports: sq9.supportLevels.slice(0, 3),
          topResistances: sq9.resistanceLevels.slice(0, 3)
        },
        wheelOf24: {
          degrees: wheel.degrees.normalized,
          nearCardinal: wheel.cardinalAnalysis.nearCardinal,
          quadrant: wheel.wheelPosition.quadrant,
          description: wheel.wheelPosition.description
        },
        cycles: {
          convergenceScore: cycles.convergenceScore,
          bias: cycles.cycleBias,
          majorHits: cycles.majorHits.slice(0, 3),
          upcomingCycles: cycles.upcomingCycles.slice(0, 5)
        },
        targets: {
          closestSupport: targets.closestSupport,
          closestResistance: targets.closestResistance,
          keyLevels: targets.keyLevels.slice(0, 5)
        }
      }
    });
  } catch (error) {
    logger.error('Gann demo error', { error: error.message });
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// ============================================================
// SERVER INITIALIZATION
// ============================================================

async function startServer() {
  logger.info('Starting Crypto Billionaire Bot...', { environment: NODE_ENV });

  // Initialize database
  try {
    if (process.env.DATABASE_URL) {
      await db.initDb();
      logger.info('Database initialized successfully');
    } else {
      logger.warn('DATABASE_URL not set - running without database connection');
      logger.warn('Set DATABASE_URL in .env to enable full functionality');
    }
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    if (NODE_ENV === 'production') {
      logger.error('Exiting due to database failure in production');
      process.exit(1);
    }
    logger.warn('Continuing without database in development mode');
  }

  // Start Express server
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, {
      port: PORT,
      environment: NODE_ENV,
      healthCheck: `http://localhost:${PORT}/health`,
      gannDemo: `http://localhost:${PORT}/api/gann/demo/45000`
    });
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await db.closeDb();
        logger.info('Database connections closed');
      } catch (error) {
        logger.error('Error closing database', { error: error.message });
      }

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack
    });
  });

  // Uncaught exception handler
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  return server;
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});

module.exports = { app, startServer };
