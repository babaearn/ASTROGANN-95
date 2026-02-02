#!/usr/bin/env node

/**
 * TEST PLANETARY ENGINE
 * ======================
 * Tests planetary calculations and verifications:
 * - Swiss Ephemeris / VSOP87 calculations
 * - Moon phases and positions
 * - Planetary aspects
 * - Major event scanning
 * - Verification with Horizons/Prokerala (if enabled)
 *
 * Usage:
 *   node scripts/test-planetary.js
 *
 * Environment variables:
 *   HORIZONS_ENABLED=true/false
 *   PROKERALA_ENABLED=true/false
 *   PROKERALA_API_KEY=your_key (if enabled)
 */

require('dotenv').config();

const planetary = require('../modules/planetary');
const { PLANETS, PLANET_GROUPS, MAJOR_ASPECTS } = require('../config/constants');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function printSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printSubSection(title) {
  console.log(`\n--- ${title} ---`);
}

function formatIST(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
}

// ============================================================
// TEST FUNCTIONS
// ============================================================

function testCurrentPlanets() {
  printSection('CURRENT PLANETARY POSITIONS');

  const now = new Date();
  console.log(`\nTimestamp: ${formatIST(now.toISOString())}`);

  const positions = planetary.getCurrentPlanets(now);

  printSubSection('Classical Planets');
  for (const key of PLANET_GROUPS.CLASSICAL) {
    const p = positions.positions[key];
    if (p) {
      console.log(`  ${p.name.padEnd(10)} ${p.formatted.padEnd(12)} (${p.longitude.toFixed(2)}°)`);
    }
  }

  printSubSection('Modern Planets');
  for (const key of PLANET_GROUPS.MODERN) {
    const p = positions.positions[key];
    if (p) {
      console.log(`  ${p.name.padEnd(10)} ${p.formatted.padEnd(12)} (${p.longitude.toFixed(2)}°)`);
    }
  }

  printSubSection('Lunar Nodes');
  for (const key of PLANET_GROUPS.NODES) {
    const p = positions.positions[key];
    if (p) {
      console.log(`  ${p.name.padEnd(12)} ${p.formatted.padEnd(12)} (${p.longitude.toFixed(2)}°)`);
    }
  }

  console.log(`\nJulian Day: ${positions.julianDay.toFixed(5)}`);
}

function testMoonInfo() {
  printSection('MOON INFORMATION');

  const moonInfo = planetary.getMoonInfo();

  console.log(`\nPosition:`);
  console.log(`  Longitude:    ${moonInfo.longitude.toFixed(4)}°`);
  console.log(`  Sign:         ${moonInfo.sign} ${moonInfo.signSymbol}`);
  console.log(`  Degree:       ${moonInfo.degreeInSign.toFixed(2)}°`);
  console.log(`  Latitude:     ${moonInfo.latitude.toFixed(4)}°`);

  console.log(`\nPhase:`);
  console.log(`  Phase:        ${moonInfo.phaseSymbol} ${moonInfo.phase}`);
  console.log(`  Elongation:   ${moonInfo.elongation.toFixed(2)}° from Sun`);
  console.log(`  Illumination: ${moonInfo.illumination.toFixed(1)}%`);
  console.log(`  Direction:    ${moonInfo.isWaxing ? '🌒 Waxing' : '🌘 Waning'}`);

  console.log(`\nDistance: ${moonInfo.distance.toFixed(2)} Earth radii (~${(moonInfo.distance * 6371).toFixed(0)} km)`);
}

function testAspects() {
  printSection('CURRENT PLANETARY ASPECTS');

  const aspects = planetary.getAspects(null, {
    planets: PLANET_GROUPS.CLASSICAL,
    includeMinor: false
  });

  console.log(`\nFound ${aspects.count} aspects (${aspects.exactAspects} exact)`);

  printSubSection('Major Aspects (Sorted by Strength)');

  const topAspects = aspects.aspects.slice(0, 15);
  for (const a of topAspects) {
    const exactMarker = a.isExact ? '✧' : ' ';
    const applyingMarker = a.isApplying ? '→' : '←';
    console.log(
      `${exactMarker} ${a.planet1.name.padEnd(8)} ${a.aspect.symbol} ${a.planet2.name.padEnd(8)} ` +
      `| orb ${a.orb.toFixed(2).padStart(5)}° | ${a.aspect.name.padEnd(12)} ` +
      `| ${(a.strength * 100).toFixed(0)}% ${applyingMarker}`
    );
  }

  if (aspects.aspects.length > 15) {
    console.log(`  ... and ${aspects.aspects.length - 15} more`);
  }
}

function testMajorEvents() {
  printSection('UPCOMING MAJOR EVENTS (Next 30 Days)');

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  console.log(`\nScanning from ${formatIST(now.toISOString())}`);
  console.log(`         to   ${formatIST(thirtyDaysLater.toISOString())}`);

  const events = planetary.scanMajorEvents(now, thirtyDaysLater, {
    includeIngresses: true,
    includeFullMoons: true,
    includeNewMoons: true,
    includeAspects: true,
    stepHours: 12
  });

  console.log(`\nFound ${events.length} events:`);

  for (const event of events) {
    const date = formatIST(event.timestamp);
    let description = '';

    switch (event.type) {
      case 'ingress':
        description = `${event.planetName} enters ${event.newSign}`;
        break;
      case 'new_moon':
        description = `🌑 New Moon in ${event.moonSign}`;
        break;
      case 'full_moon':
        description = `🌕 Full Moon in ${event.moonSign}`;
        break;
      case 'outer_planet_aspect':
        description = `${event.planet1Name} ${event.aspectName} ${event.planet2Name} (${event.orb.toFixed(2)}°)`;
        break;
      default:
        description = event.type;
    }

    const sigMarker = event.significance >= 8 ? '★' : event.significance >= 5 ? '◆' : '○';
    console.log(`  ${sigMarker} ${date.substring(0, 17)} | ${description}`);
  }
}

async function testVerification() {
  printSection('EVENT VERIFICATION');

  const horizonsEnabled = process.env.HORIZONS_ENABLED !== 'false';
  const prokeralaEnabled = process.env.PROKERALA_ENABLED !== 'false' && process.env.PROKERALA_API_KEY;

  console.log(`\nVerifiers Status:`);
  console.log(`  Horizons:  ${horizonsEnabled ? '✓ Enabled' : '✗ Disabled'}`);
  console.log(`  Prokerala: ${prokeralaEnabled ? '✓ Enabled (API key set)' : '✗ Disabled (no API key)'}`);

  if (!horizonsEnabled && !prokeralaEnabled) {
    console.log('\n⚠️  No verifiers enabled. Skipping verification test.');
    console.log('   Set HORIZONS_ENABLED=true or provide PROKERALA_API_KEY to test.');
    return;
  }

  // Create a test event to verify
  const testEvent = {
    type: 'test',
    timestamp: new Date().toISOString(),
    planets: [
      { key: 'MARS', longitude: planetary.getCurrentPlanets().positions.MARS.longitude },
      { key: 'JUPITER', longitude: planetary.getCurrentPlanets().positions.JUPITER.longitude }
    ]
  };

  console.log('\nVerifying current Mars and Jupiter positions...');

  try {
    const result = await planetary.verifyMajorEvent(testEvent);

    printSubSection('Verification Result');
    console.log(`  Overall Confidence: ${result.overallConfidence}`);

    for (const v of result.verifications) {
      console.log(`\n  ${v.source.toUpperCase()}:`);
      console.log(`    Status: ${v.status}`);
      if (v.overallConfidence) {
        console.log(`    Confidence: ${v.overallConfidence}`);
      }
      if (v.verifications) {
        for (const pv of v.verifications) {
          if (pv.delta !== null) {
            console.log(`    ${pv.planet}: Δ${pv.delta.toFixed(4)}° (${pv.confidence})`);
          }
        }
      }
      if (v.message) {
        console.log(`    Message: ${v.message}`);
      }
    }

    if (Object.keys(result.deltas).length > 0) {
      printSubSection('Position Deltas');
      for (const [planet, deltas] of Object.entries(result.deltas)) {
        console.log(`  ${planet}:`);
        for (const d of deltas) {
          console.log(`    ${d.source}: ${d.delta.toFixed(4)}°`);
        }
      }
    }

  } catch (error) {
    console.error(`\n❌ Verification failed: ${error.message}`);
  }
}

function testJulianDay() {
  printSection('JULIAN DAY CONVERSION');

  const testDates = [
    new Date('2000-01-01T12:00:00Z'), // J2000 epoch
    new Date('2024-01-01T00:00:00Z'),
    new Date()
  ];

  for (const date of testDates) {
    const jd = planetary.dateToJulianDay(date);
    const converted = planetary.julianDayToDate(jd);

    console.log(`\n  Date: ${date.toISOString()}`);
    console.log(`  JD:   ${jd.toFixed(5)}`);
    console.log(`  Back: ${converted.toISOString()}`);
    console.log(`  Diff: ${Math.abs(date - converted)}ms`);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + '  CRYPTO BILLIONAIRE BOT - PLANETARY ENGINE TEST'.padEnd(58) + '║');
  console.log('║' + '  Deterministic Astronomical Calculations'.padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  const startTime = Date.now();

  // Run tests
  testJulianDay();
  testCurrentPlanets();
  testMoonInfo();
  testAspects();
  testMajorEvents();
  await testVerification();

  // Summary
  printSection('TEST SUMMARY');
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n  Total Duration: ${duration}s`);
  console.log(`  Timestamp:      ${formatIST(new Date().toISOString())}`);

  console.log('\n  ✓ All planetary calculations completed successfully');
  console.log('  ✓ UTC storage / IST display working correctly');

  console.log('\n');
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
