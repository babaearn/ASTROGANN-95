/**
 * JOBS INDEX
 * ==========
 * Central management of all scheduled jobs
 */

const logger = require('../utils/logger');

const dailyBriefing = require('./daily-briefing');
const weeklyWarRoom = require('./weekly-war-room');
const alertScanner = require('./alert-scanner');
const outcomeLabeler = require('./outcome-labeler');
const weeklyCalibration = require('./weekly-calibration');

// ============================================================
// JOB REGISTRY
// ============================================================

const jobs = {
  dailyBriefing,
  weeklyWarRoom,
  alertScanner,
  outcomeLabeler,
  weeklyCalibration
};

// ============================================================
// CONTROL FUNCTIONS
// ============================================================

/**
 * Start all jobs
 */
function startAll() {
  logger.info('Starting all scheduled jobs');

  for (const [name, job] of Object.entries(jobs)) {
    try {
      job.start();
    } catch (e) {
      logger.error(`Failed to start job: ${name}`, { error: e.message });
    }
  }
}

/**
 * Stop all jobs
 */
function stopAll() {
  logger.info('Stopping all scheduled jobs');

  for (const [name, job] of Object.entries(jobs)) {
    try {
      job.stop();
    } catch (e) {
      logger.error(`Failed to stop job: ${name}`, { error: e.message });
    }
  }
}

/**
 * Get status of all jobs
 */
function getAllStatus() {
  const status = {};

  for (const [name, job] of Object.entries(jobs)) {
    try {
      status[name] = job.getStatus();
    } catch (e) {
      status[name] = { error: e.message };
    }
  }

  return status;
}

/**
 * Run a specific job immediately
 */
async function runJob(jobName) {
  const job = jobs[jobName];

  if (!job) {
    throw new Error(`Unknown job: ${jobName}`);
  }

  if (typeof job.runNow !== 'function') {
    throw new Error(`Job ${jobName} does not support manual execution`);
  }

  return job.runNow();
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Individual jobs
  ...jobs,

  // Control functions
  startAll,
  stopAll,
  getAllStatus,
  runJob,

  // Job list
  jobNames: Object.keys(jobs)
};
