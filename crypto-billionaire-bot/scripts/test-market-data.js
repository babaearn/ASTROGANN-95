#!/usr/bin/env node

/**
 * TEST MARKET DATA SCRIPT
 * ========================
 * Tests all market data modules:
 * - Bybit: BTCUSDT ticker, OI, long/short ratio, funding
 * - Binance: BTCUSDT OI, long/short, taker buy/sell
 * - CoinGecko: Market breadth + top movers
 *
 * Requirements:
 * - COINGECKO_API_KEY environment variable (required)
 * - No other secrets needed (Bybit/Binance are public endpoints)
 *
 * Usage:
 *   node scripts/test-market-data.js
 *   COINGECKO_API_KEY=your_key node scripts/test-market-data.js
 */

require('dotenv').config();

const { bybitClient } = require('../modules/bybit');
const { binanceFuturesClient } = require('../modules/binanceFutures');
const { coinGeckoClient } = require('../modules/coingecko');
const { marketRadar } = require('../modules/marketRadar');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return 'N/A';
  if (num >= 1e9) return (num / 1e9).toFixed(decimals) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(decimals) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(decimals) + 'K';
  return num.toFixed(decimals);
}

function formatPercent(num) {
  if (num === null || num === undefined) return 'N/A';
  const sign = num >= 0 ? '+' : '';
  return sign + num.toFixed(2) + '%';
}

function printSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printSubSection(title) {
  console.log(`\n--- ${title} ---`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// TEST FUNCTIONS
// ============================================================

async function testBybit() {
  printSection('BYBIT V5 API (Public)');

  try {
    // Get BTCUSDT ticker
    printSubSection('BTCUSDT Ticker');
    const ticker = await bybitClient.getTickerBySymbol('BTCUSDT');
    if (ticker) {
      console.log(`  Last Price:     $${formatNumber(ticker.lastPrice, 2)}`);
      console.log(`  24h Change:     ${formatPercent(ticker.price24hPcnt)}`);
      console.log(`  24h High:       $${formatNumber(ticker.highPrice24h, 2)}`);
      console.log(`  24h Low:        $${formatNumber(ticker.lowPrice24h, 2)}`);
      console.log(`  24h Volume:     ${formatNumber(ticker.volume24h)} BTC`);
      console.log(`  24h Turnover:   $${formatNumber(ticker.turnover24h)}`);
      console.log(`  Open Interest:  ${formatNumber(ticker.openInterest)} BTC`);
      console.log(`  OI Value:       $${formatNumber(ticker.openInterestValue)}`);
      console.log(`  Funding Rate:   ${ticker.fundingRate ? (ticker.fundingRate * 100).toFixed(4) + '%' : 'N/A'}`);
    }

    await sleep(500); // Rate limit protection

    // Get Open Interest history (sample)
    printSubSection('Open Interest Trend (Last 5 samples, 1h)');
    const oi = await bybitClient.getOpenInterest({
      symbol: 'BTCUSDT',
      intervalTime: '1h',
      limit: 5
    });
    if (oi.list && oi.list.length > 0) {
      oi.list.forEach((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`  [${i + 1}] ${time}: ${formatNumber(item.openInterest)} BTC`);
      });
    }

    await sleep(500);

    // Get Long/Short Ratio
    printSubSection('Long/Short Account Ratio (Last 5 samples, 1h)');
    const lsRatio = await bybitClient.getLongShortRatio({
      symbol: 'BTCUSDT',
      period: '1h',
      limit: 5
    });
    if (lsRatio.list && lsRatio.list.length > 0) {
      lsRatio.list.forEach((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`  [${i + 1}] ${time}: Buy ${(item.buyRatio * 100).toFixed(1)}% / Sell ${(item.sellRatio * 100).toFixed(1)}% (Ratio: ${item.longShortRatio.toFixed(2)})`);
      });
    }

    await sleep(500);

    // Get Funding Rate History
    printSubSection('Funding Rate History (Last 5)');
    const funding = await bybitClient.getFundingRateHistory({
      symbol: 'BTCUSDT',
      limit: 5
    });
    if (funding.list && funding.list.length > 0) {
      funding.list.forEach((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`  [${i + 1}] ${time}: ${item.fundingRatePercent.toFixed(4)}%`);
      });
    }

    console.log('\n✅ Bybit tests passed');

  } catch (error) {
    console.error(`\n❌ Bybit test failed: ${error.message}`);
  }
}

async function testBinance() {
  printSection('BINANCE USD-M FUTURES (Public)');

  try {
    // Get BTCUSDT ticker
    printSubSection('BTCUSDT 24h Ticker');
    const ticker = await binanceFuturesClient.get24hTicker({ symbol: 'BTCUSDT' });
    console.log(`  Last Price:     $${formatNumber(ticker.lastPrice, 2)}`);
    console.log(`  24h Change:     ${formatPercent(ticker.priceChangePercent)}`);
    console.log(`  24h High:       $${formatNumber(ticker.highPrice, 2)}`);
    console.log(`  24h Low:        $${formatNumber(ticker.lowPrice, 2)}`);
    console.log(`  24h Volume:     ${formatNumber(ticker.volume)} BTC`);
    console.log(`  Quote Volume:   $${formatNumber(ticker.quoteVolume)}`);
    console.log(`  Trade Count:    ${formatNumber(ticker.count, 0)}`);

    await sleep(500);

    // Get Open Interest
    printSubSection('Current Open Interest');
    const oi = await binanceFuturesClient.getOpenInterest({ symbol: 'BTCUSDT' });
    console.log(`  Open Interest:  ${formatNumber(oi.openInterest)} BTC`);
    console.log(`  Time:           ${new Date(oi.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    await sleep(500);

    // Get Global Long/Short Ratio
    printSubSection('Global Long/Short Ratio (Last 5 samples, 1h)');
    const lsRatio = await binanceFuturesClient.getGlobalLongShortRatio({
      symbol: 'BTCUSDT',
      period: '1h',
      limit: 5
    });
    if (lsRatio.list && lsRatio.list.length > 0) {
      lsRatio.list.forEach((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`  [${i + 1}] ${time}: Long ${(item.longAccount * 100).toFixed(1)}% / Short ${(item.shortAccount * 100).toFixed(1)}% (Ratio: ${item.longShortRatio.toFixed(2)})`);
      });
    }

    await sleep(500);

    // Get Taker Buy/Sell Volume
    printSubSection('Taker Buy/Sell Volume (Last 5 samples, 1h)');
    const takerVol = await binanceFuturesClient.getTakerBuySellVol({
      symbol: 'BTCUSDT',
      period: '1h',
      limit: 5
    });
    if (takerVol.list && takerVol.list.length > 0) {
      takerVol.list.forEach((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const buyPct = (item.buySellRatio / (1 + item.buySellRatio) * 100).toFixed(1);
        console.log(`  [${i + 1}] ${time}: Buy/Sell Ratio ${item.buySellRatio.toFixed(2)} (Buy ~${buyPct}%)`);
      });
    }

    console.log('\n✅ Binance tests passed');

  } catch (error) {
    console.error(`\n❌ Binance test failed: ${error.message}`);
  }
}

async function testCoinGecko() {
  printSection('COINGECKO API (Demo Key Required)');

  // Check for API key
  if (!process.env.COINGECKO_API_KEY) {
    console.log('\n⚠️  COINGECKO_API_KEY not set. Skipping CoinGecko tests.');
    console.log('   Set the environment variable to enable these tests.');
    return false;
  }

  try {
    // Fetch top coins
    printSubSection('Top 5 Coins by Volume');
    const topCoins = await coinGeckoClient.fetchTopCoins({
      per_page: 50,
      order: 'volume_desc'
    });

    topCoins.coins.slice(0, 5).forEach((coin, i) => {
      console.log(`  [${i + 1}] ${coin.symbol.padEnd(6)} $${formatNumber(coin.price, 2).padStart(12)} | 24h: ${formatPercent(coin.price_change_percentage_24h).padStart(8)} | Vol: $${formatNumber(coin.total_volume)}`);
    });

    await sleep(1000); // CoinGecko has stricter rate limits

    // Market Radar snapshot
    printSubSection('Market Radar Analysis');
    const radar = await marketRadar.generateSnapshot({ topCoinsCount: 100 });

    console.log(`\n  Regime Score:   ${radar.regimeScore}/100 (${radar.regimeLabel})`);
    console.log(`  Advancers:      ${radar.breadth.advancers} (${radar.breadth.advancersPercent.toFixed(1)}%)`);
    console.log(`  Decliners:      ${radar.breadth.decliners} (${radar.breadth.declinersPercent.toFixed(1)}%)`);
    console.log(`  A/D Ratio:      ${radar.breadth.advancersDeclinerRatio.toFixed(2)}`);
    console.log(`  Median Return:  ${formatPercent(radar.breadth.medianReturn)}`);
    console.log(`  Dispersion:     ${radar.breadth.dispersion.toFixed(2)}%`);
    console.log(`  Vol Concentration: ${radar.leaders.volumeConcentration.toFixed(1)}% (top 10)`);

    if (radar.global) {
      console.log(`\n  Global Stats:`);
      console.log(`    Total Market Cap:  $${formatNumber(radar.global.totalMarketCap)}`);
      console.log(`    Total Volume:      $${formatNumber(radar.global.totalVolume)}`);
      console.log(`    BTC Dominance:     ${radar.global.btcDominance.toFixed(1)}%`);
      console.log(`    24h MCap Change:   ${formatPercent(radar.global.marketCapChange24h)}`);
    }

    printSubSection('Top 5 Gainers');
    radar.leaders.topGainers.slice(0, 5).forEach((coin, i) => {
      console.log(`  [${i + 1}] ${coin.symbol.padEnd(6)} ${formatPercent(coin.change24h).padStart(8)} | $${formatNumber(coin.price, 4).padStart(12)} | Vol: $${formatNumber(coin.volume)}`);
    });

    printSubSection('Top 5 Losers');
    radar.leaders.topLosers.slice(0, 5).forEach((coin, i) => {
      console.log(`  [${i + 1}] ${coin.symbol.padEnd(6)} ${formatPercent(coin.change24h).padStart(8)} | $${formatNumber(coin.price, 4).padStart(12)} | Vol: $${formatNumber(coin.volume)}`);
    });

    console.log(`\n  Summary: ${radar.summary}`);

    console.log('\n✅ CoinGecko tests passed');
    return true;

  } catch (error) {
    console.error(`\n❌ CoinGecko test failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + '  CRYPTO BILLIONAIRE BOT - MARKET DATA TEST'.padEnd(58) + '║');
  console.log('║' + '  Testing Bybit, Binance Futures, and CoinGecko APIs'.padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  const startTime = Date.now();

  // Test all APIs
  await testBybit();
  await sleep(1000);

  await testBinance();
  await sleep(1000);

  const cgSuccess = await testCoinGecko();

  // Summary
  printSection('TEST SUMMARY');
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Total Duration: ${duration}s`);
  console.log(`  Timestamp:      ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  if (!cgSuccess && !process.env.COINGECKO_API_KEY) {
    console.log('\n  ⚠️  Note: Set COINGECKO_API_KEY to enable full testing');
  }

  console.log('\n');
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
