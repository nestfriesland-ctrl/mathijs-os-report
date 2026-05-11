/**
 * POST /api/sensor/market
 *
 * Market sensor — BTC/ETH 4h regime classifier op spot + 4h kandelaars.
 *
 * Sources:
 *   - Kraken /0/public/Ticker (BTC/USD, ETH/USD)
 *   - CoinGecko /api/v3/global (total market_cap, total_volume)
 *   - Binance /api/v3/klines symbol=BTCUSDT interval=4h limit=10
 *
 * Regime per asset op 4h:
 *   BULL_4H  — laatste close > 10-bar HH-1 (higher-high) en volume rising
 *   BEAR_4H  — laatste close < 10-bar LL-1 (lower-low)
 *   RANGE    — anders
 *
 * Aggregaat regime: meerderheid BTC+ETH; bij split = RANGE.
 *
 * Cadens: 4u.
 */

const WIKI_REPO = 'nestfriesland-ctrl/wiki';
const SENSOR_PATH = 'sensors/market.md';

const CAP_KOP = 90;
const CAP_STELLING = 240;
const CAP_BEWIJS = 140;
const CAP_LES = 140;
const CAP_ACTIE = 140;

const HTTP_TIMEOUT_MS = 8000;

async function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

async function krakenTicker(pair) {
  const r = await timedFetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
  if (!r.ok) throw new Error(`kraken_${pair}_${r.status}`);
  const j = await r.json();
  const key = Object.keys(j.result || {})[0];
  const t = j.result?.[key];
  if (!t) throw new Error(`kraken_${pair}_no_data`);
  return {
    last: parseFloat(t.c[0]),
    vol24h: parseFloat(t.v[1]),
    high24h: parseFloat(t.h[1]),
    low24h: parseFloat(t.l[1]),
    open24h: parseFloat(t.o),
  };
}

async function coinGeckoGlobal() {
  const r = await timedFetch('https://api.coingecko.com/api/v3/global');
  if (!r.ok) throw new Error(`coingecko_global_${r.status}`);
  const j = await r.json();
  const d = j?.data || {};
  return {
    marketCapUsd: d.total_market_cap?.usd ?? null,
    totalVolumeUsd: d.total_volume?.usd ?? null,
    btcDominance: d.market_cap_percentage?.btc ?? null,
    ethDominance: d.market_cap_percentage?.eth ?? null,
  };
}

async function binanceKlines(symbol, interval = '4h', limit = 10) {
  const r = await timedFetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!r.ok) throw new Error(`binance_${symbol}_${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`binance_${symbol}_bad_shape`);
  return j.map(k => ({
    openTime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
  }));
}

function classify4h(klines) {
  if (!klines || klines.length < 5) return { regime: 'RANGE', detail: 'too_few_bars' };
  const last = klines[klines.length - 1];
  const prior = klines.slice(0, -1);
  const hh = Math.max(...prior.map(k => k.high));
  const ll = Math.min(...prior.map(k => k.low));
  const volNow = last.volume;
  const volAvg = prior.reduce((a, k) => a + k.volume, 0) / prior.length;
  const volRising = volNow > volAvg;
  if (last.close > hh && volRising) return { regime: 'BULL_4H', detail: `close ${last.close.toFixed(0)} > prior HH ${hh.toFixed(0)}, vol+` };
  if (last.close < ll) return { regime: 'BEAR_4H', detail: `close ${last.close.toFixed(0)} < prior LL ${ll.toFixed(0)}` };
  return { regime: 'RANGE', detail: `close ${last.close.toFixed(0)} between ${ll.toFixed(0)}–${hh.toFixed(0)}` };
}

function aggregateRegime(btc, eth) {
  if (btc === eth) return btc;
  if ([btc, eth].includes('BULL_4H') && [btc, eth].includes('BEAR_4H')) return 'RANGE';
  return 'RANGE';
}

// ── Wiki I/O ────────────────────────────────────────────────
async function loadPreviousMarkdown() {
  const PAT = process.env.GITHUB_PAT;
  if (!PAT) return null;
  const r = await fetch(`https://api.github.com/repos/${WIKI_REPO}/contents/${SENSOR_PATH}?ref=main`, {
    headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github+json', 'User-Agent': 'pulse-market' },
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.content) return null;
  return { sha: j.sha, content: Buffer.from(j.content, 'base64').toString('utf-8') };
}

async function writeToWiki(content, prevSha) {
  const PAT = process.env.GITHUB_PAT;
  if (!PAT) return false;
  const body = {
    message: `sensor(market): ${new Date().toISOString().slice(0, 16)} dispatch`,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: 'main',
  };
  if (prevSha) body.sha = prevSha;
  const r = await fetch(`https://api.github.com/repos/${WIKI_REPO}/contents/${SENSOR_PATH}`, {
    method: 'PUT',
    headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'pulse-market' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

function readCycleCountFromMd(md) {
  if (!md) return 0;
  const m = md.match(/^cycle_count:\s*(\d+)/m);
  return m ? parseInt(m[1], 10) : 0;
}

function cap(s, n) { return s == null ? '' : (s.length <= n ? s : s.slice(0, n - 1) + '…'); }
function fmt(n, d = 0) { return n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d); }

function buildKrant({ regime, btc, eth, btcCls, ethCls, global }) {
  const verb = regime === 'BULL_4H' ? 'breekt uit' : regime === 'BEAR_4H' ? 'kantelt bearish' : 'consolideert';
  const kop = cap(`Markt ${verb} op 4h — BTC ${btcCls.regime}, ETH ${ethCls.regime}.`, CAP_KOP);

  const stelling = cap(
    `Komende 4u-kandelaar volgt regime ${regime} als BTC ${fmt(btc?.last)} en ETH ${fmt(eth?.last, 2)} respectievelijk bullish/bearish-pad doorzetten; valsifieerbaar bij regime-flip in beide assets gelijktijdig.`,
    CAP_STELLING,
  );

  const bewijs = cap(
    `BTC ${fmt(btc?.last)} 24h ${fmt(btc?.low24h)}–${fmt(btc?.high24h)} | ETH ${fmt(eth?.last, 2)} | mcap $${fmt(global?.marketCapUsd / 1e12, 2)}T | BTC.D ${fmt(global?.btcDominance, 2)}%.`,
    CAP_BEWIJS,
  );

  const les = cap(
    regime === 'BULL_4H'
      ? 'Bull-breakouts op 4h vragen vol-bevestiging — geen positie zonder volume>avg.'
      : regime === 'BEAR_4H'
        ? 'Bear-breakdowns kunnen cascade triggeren; check liquidity-tide voor cluster-magneten.'
        : 'RANGE op 4h = wachten loont; geen trend-positie zonder break.',
    CAP_LES,
  );

  const actie = cap(
    regime === 'BULL_4H'
      ? 'Long-bias op pullback naar prior HH; trim bij divergentie BTC vs ETH.'
      : regime === 'BEAR_4H'
        ? 'Defensief: cash-heavy; short alleen met confluence-bevestiging.'
        : 'Geen nieuwe positie; observeer 4h-close voor break.',
    CAP_ACTIE,
  );

  return { kop, stelling, bewijs, les, actie };
}

function buildMarkdown({
  cycleCount, lastAttemptedAt, lastSuccessfulAt,
  regime, btc, eth, btcCls, ethCls, global, errors,
}) {
  const krant = buildKrant({ regime, btc, eth, btcCls, ethCls, global });

  return [
    '---',
    'sensor: market',
    `regime: ${regime}`,
    `btc_regime_4h: ${btcCls.regime}`,
    `eth_regime_4h: ${ethCls.regime}`,
    `last_attempted_at: ${lastAttemptedAt}`,
    `last_successful_at: ${lastSuccessfulAt || 'never'}`,
    `last_updated: ${lastAttemptedAt}`,
    'freshness: 0',
    'confidence: HARD',
    `cycle_count: ${cycleCount}`,
    `btc_last: ${fmt(btc?.last)}`,
    `eth_last: ${fmt(eth?.last, 2)}`,
    `btc_24h_high: ${fmt(btc?.high24h)}`,
    `btc_24h_low: ${fmt(btc?.low24h)}`,
    `eth_24h_high: ${fmt(eth?.high24h, 2)}`,
    `eth_24h_low: ${fmt(eth?.low24h, 2)}`,
    `total_market_cap_usd: ${fmt(global?.marketCapUsd)}`,
    `total_volume_usd: ${fmt(global?.totalVolumeUsd)}`,
    `btc_dominance: ${fmt(global?.btcDominance, 2)}`,
    `eth_dominance: ${fmt(global?.ethDominance, 2)}`,
    '---',
    '',
    '# Market',
    '',
    `> Run ${cycleCount} — ${lastAttemptedAt}. Regime: **${regime}** | BTC: **${btcCls.regime}** | ETH: **${ethCls.regime}**.`,
    '',
    '## Scorebord',
    '',
    '| Asset | Last | 24h Low | 24h High | 4h Regime | Detail |',
    '|-------|------|---------|----------|-----------|--------|',
    `| BTC | $${fmt(btc?.last)} | $${fmt(btc?.low24h)} | $${fmt(btc?.high24h)} | ${btcCls.regime} | ${btcCls.detail} |`,
    `| ETH | $${fmt(eth?.last, 2)} | $${fmt(eth?.low24h, 2)} | $${fmt(eth?.high24h, 2)} | ${ethCls.regime} | ${ethCls.detail} |`,
    '',
    '## Globaal',
    '',
    `- Total market cap: $${fmt(global?.marketCapUsd / 1e12, 2)}T`,
    `- 24h volume: $${fmt(global?.totalVolumeUsd / 1e9, 2)}B`,
    `- BTC dominance: ${fmt(global?.btcDominance, 2)}%`,
    `- ETH dominance: ${fmt(global?.ethDominance, 2)}%`,
    '',
    '## Krant',
    '',
    `**Kop:** ${krant.kop}`,
    `**Stelling:** ${krant.stelling}`,
    `**Bewijs:** ${krant.bewijs}`,
    `**Les:** ${krant.les}`,
    `**Actie:** ${krant.actie}`,
    '',
    '## Methodologie',
    '',
    `Bronnen: Kraken Ticker (BTC/USD, ETH/USD), CoinGecko /global, Binance klines 4h limit 10. Cadens 4u.`,
    `Regime per asset: BULL_4H = close > 10-bar HH-1 én volume>avg; BEAR_4H = close < 10-bar LL-1; anders RANGE. Aggregaat: meerderheid BTC+ETH, split = RANGE.`,
    errors && errors.length ? `\n> errors: ${errors.join(' | ')}` : '',
  ].filter(l => l !== '').join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const lastAttemptedAt = new Date().toISOString();

  let cycleCount = 1;
  let prevSha = null;
  let lastSuccessfulAt = null;
  try {
    const prev = await loadPreviousMarkdown();
    if (prev) {
      prevSha = prev.sha;
      cycleCount = readCycleCountFromMd(prev.content) + 1;
      const lsa = prev.content.match(/^last_successful_at:\s*([^\n]+)/m);
      if (lsa && lsa[1].trim() !== 'never') lastSuccessfulAt = lsa[1].trim();
    }
  } catch (_) { /* first run */ }

  const errors = [];
  const safe = async (label, p) => {
    try { return await p; }
    catch (e) { errors.push(`${label}:${e.message}`); return null; }
  };

  const [btc, eth, global, btcKlines, ethKlines] = await Promise.all([
    safe('btc_kraken', krakenTicker('XBTUSD')),
    safe('eth_kraken', krakenTicker('ETHUSD')),
    safe('coingecko_global', coinGeckoGlobal()),
    safe('btc_klines', binanceKlines('BTCUSDT', '4h', 10)),
    safe('eth_klines', binanceKlines('ETHUSDT', '4h', 10)),
  ]);

  const btcCls = classify4h(btcKlines);
  const ethCls = classify4h(ethKlines);
  const regime = aggregateRegime(btcCls.regime, ethCls.regime);

  const successAt = new Date().toISOString();
  const md = buildMarkdown({
    cycleCount, lastAttemptedAt, lastSuccessfulAt: successAt,
    regime, btc, eth, btcCls, ethCls, global, errors,
  });

  const written = await writeToWiki(md, prevSha).catch(() => false);

  return res.status(200).json({
    regime, btc_regime_4h: btcCls.regime, eth_regime_4h: ethCls.regime,
    cycleCount, written, errors,
    snapshot: { btc: btc?.last, eth: eth?.last, btcDom: global?.btcDominance },
    trigger: req.body?.trigger || 'manual',
  });
}
