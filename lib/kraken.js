// Kraken public REST wrapper — no auth, browser-safe.
// Exposed as window.Kraken { ASSETS, MAJORS, ALTS, fetchTickers, fetchOHLC, getAsset }.
//
// Two paths:
//   fetchTickers()            -> live price for all 10 assets (single batched call)
//   fetchOHLC(symbol, tf)     -> OHLC slice with anchor close N candles back, 5-min cache
//
// Defensive against missing pairs (e.g. exotic alts may not list on Kraken) —
// returns null instead of throwing so the dashboard keeps rendering.

(function () {
  const BASE = 'https://api.kraken.com/0/public';

  // symbol = display ticker, pair = Kraken request alias,
  // keys   = candidate result keys (Kraken returns canonical X..Z.. for legacy
  //          pairs and bare SYMBOLUSD for newer listings — try both).
  const ASSETS = [
    { symbol: 'BTC',      pair: 'XBTUSD',      keys: ['XXBTZUSD', 'XBTUSD'] },
    { symbol: 'ETH',      pair: 'ETHUSD',      keys: ['XETHZUSD', 'ETHUSD'] },
    { symbol: 'SOL',      pair: 'SOLUSD',      keys: ['SOLUSD'] },
    { symbol: 'HYPE',     pair: 'HYPEUSD',     keys: ['HYPEUSD'] },
    { symbol: 'ZEC',      pair: 'ZECUSD',      keys: ['XZECZUSD', 'ZECUSD'] },
    { symbol: 'TAO',      pair: 'TAOUSD',      keys: ['TAOUSD'] },
    { symbol: 'FET',      pair: 'FETUSD',      keys: ['FETUSD'] },
    { symbol: 'FARTCOIN', pair: 'FARTCOINUSD', keys: ['FARTCOINUSD'] },
    { symbol: 'PUMP',     pair: 'PUMPUSD',     keys: ['PUMPUSD'] },
    { symbol: 'MINA',     pair: 'MINAUSD',     keys: ['MINAUSD'] },
  ];
  const MAJORS = ['BTC', 'ETH', 'SOL', 'HYPE'];
  const ALTS   = ['ZEC', 'TAO', 'FET', 'FARTCOIN', 'PUMP', 'MINA'];

  function getAsset(symbol) {
    return ASSETS.find(a => a.symbol === symbol) || null;
  }

  function pickResult(resultObj, keys) {
    if (!resultObj) return null;
    for (const k of keys) if (resultObj[k]) return resultObj[k];
    return null;
  }

  // --- Tickers ----------------------------------------------------------

  async function fetchTickers() {
    const pairList = ASSETS.map(a => a.pair).join(',');
    const url = `${BASE}/Ticker?pair=${encodeURIComponent(pairList)}`;
    let data;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
    } catch (e) {
      // One batched call failed — fall back to per-pair so a single dead alt
      // can't blank the whole grid.
      return fetchTickersPerPair();
    }
    const out = {};
    for (const a of ASSETS) {
      const row = pickResult(data.result, a.keys);
      if (row && row.c && row.c[0]) {
        out[a.symbol] = parseFloat(row.c[0]);
      } else {
        out[a.symbol] = null;
      }
    }
    out._fetchedAt = Date.now();
    return out;
  }

  async function fetchTickersPerPair() {
    const out = { _fetchedAt: Date.now() };
    await Promise.all(ASSETS.map(async a => {
      try {
        const r = await fetch(`${BASE}/Ticker?pair=${a.pair}`, { cache: 'no-store' });
        if (!r.ok) { out[a.symbol] = null; return; }
        const d = await r.json();
        const row = pickResult(d.result, a.keys);
        out[a.symbol] = (row && row.c && row.c[0]) ? parseFloat(row.c[0]) : null;
      } catch (e) {
        out[a.symbol] = null;
      }
    }));
    return out;
  }

  // --- OHLC -------------------------------------------------------------

  // Per-timeframe params: Kraken interval (minutes) + how many candles back
  // we use as the bull/bear anchor.
  //   1u : interval=1   anchor=close[60]   (~60 min back)
  //   4u : interval=15  anchor=close[16]   (~4h back)
  //   24h: interval=60  anchor=close[24]   (~24h back)
  //   7d : interval=240 anchor=close[42]   (~7d back; 42*4h = 168h)
  const TF = {
    '1h':  { interval: 1,   ankerBack: 60 },
    '4h':  { interval: 15,  ankerBack: 16 },
    '24h': { interval: 60,  ankerBack: 24 },
    '7d':  { interval: 240, ankerBack: 42 },
  };

  const ohlcCache = {}; // key = `${symbol}:${tf}` -> { ts, anker }
  const CACHE_TTL_MS = 5 * 60 * 1000;

  async function fetchOHLC(symbol, tf) {
    const asset = getAsset(symbol);
    const cfg = TF[tf];
    if (!asset || !cfg) return null;

    const key = `${symbol}:${tf}`;
    const cached = ohlcCache[key];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return cached.anker;
    }

    try {
      const url = `${BASE}/OHLC?pair=${asset.pair}&interval=${cfg.interval}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return cached ? cached.anker : null;
      const data = await r.json();
      const arr = pickResult(data.result, asset.keys);
      if (!Array.isArray(arr) || arr.length === 0) {
        return cached ? cached.anker : null;
      }
      // Kraken row: [time, open, high, low, close, vwap, volume, count].
      // Last row is the *current* (still-forming) candle; previous fully-closed
      // candle sits at arr[arr.length - 2]. ankerBack counts back from there.
      const lastClosedIdx = arr.length - 2;
      const ankerIdx = lastClosedIdx - cfg.ankerBack;
      if (ankerIdx < 0) return cached ? cached.anker : null;
      const anker = parseFloat(arr[ankerIdx][4]);
      ohlcCache[key] = { ts: Date.now(), anker };
      return anker;
    } catch (e) {
      return cached ? cached.anker : null;
    }
  }

  // Bulk-fetch OHLC anchors for all assets x all timeframes. Parallel.
  async function fetchAllAnchors() {
    const tasks = [];
    const results = {};
    for (const a of ASSETS) {
      results[a.symbol] = {};
      for (const tf of Object.keys(TF)) {
        tasks.push(
          fetchOHLC(a.symbol, tf).then(v => { results[a.symbol][tf] = v; })
        );
      }
    }
    await Promise.all(tasks);
    return results;
  }

  window.Kraken = {
    ASSETS, MAJORS, ALTS, TF,
    getAsset, fetchTickers, fetchOHLC, fetchAllAnchors,
  };
})();
