// Alert state-machine. Diffs each 15s tick, fires for genuine state-changes,
// renders a banner and (optionally) a browser notification. Dedup window 1h
// via localStorage so a cell that flickers across the threshold doesn't spam.
//
// Exposed as window.Alerts { init(containerEl), tick(state), dismiss(id) }.
//
// Tick state shape:
//   { tickers: { BTC, ETH, ... },
//     thermo:  { BTC: { '1h':'bull', '4h':'bear', ... }, ... },
//     trade:   { id:'T-001', direction:'LONG', entry:80254,
//                tp1:82906, tp2:84000, sl:78920, expiryISO:'2026-05-13' } | null
//   }

(function () {
  const STORAGE_KEY = 'pulse.alerts.fired.v1';
  const DEDUP_MS    = 60 * 60 * 1000; // 1 hour
  const PRICE_TOL   = 0.001;          // 0.1%

  let prevState = null;
  let activeBanners = []; // { id, msg, severity, ts }
  let containerEl = null;

  // --- localStorage dedup ----------------------------------------------

  function loadFired() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveFired(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function shouldFire(id) {
    const fired = loadFired();
    const last = fired[id];
    if (!last) return true;
    return (Date.now() - last) > DEDUP_MS;
  }
  function markFired(id) {
    const fired = loadFired();
    fired[id] = Date.now();
    // Trim entries older than dedup window so the map doesn't grow forever.
    for (const k of Object.keys(fired)) {
      if (Date.now() - fired[k] > DEDUP_MS * 2) delete fired[k];
    }
    saveFired(fired);
  }

  // --- detectors --------------------------------------------------------

  function detectThermoFlips(prev, cur) {
    const out = [];
    if (!prev || !prev.thermo || !cur.thermo) return out;
    for (const sym of Object.keys(cur.thermo)) {
      const a = prev.thermo[sym];
      const b = cur.thermo[sym];
      if (!a || !b) continue;
      for (const tf of Object.keys(b)) {
        if (a[tf] && b[tf] && a[tf] !== b[tf]) {
          // Prefer signal flips (bull<->bear) over neutral transitions —
          // those get a slightly louder severity below.
          const isStrong = (a[tf] === 'bull' && b[tf] === 'bear')
                        || (a[tf] === 'bear' && b[tf] === 'bull');
          out.push({
            id: `thermo:${sym}:${tf}:${a[tf]}->${b[tf]}`,
            severity: isStrong ? 'strong' : 'normal',
            msg: `${sym} ${tf} flipped ${a[tf]} → ${b[tf]}`,
          });
        }
      }
    }
    return out;
  }

  function detectPriceTargets(cur) {
    const out = [];
    const btc = cur.tickers && cur.tickers.BTC;
    const t   = cur.trade;
    if (!btc || !t) return out;

    const within = (target) => target && Math.abs(btc - target) / target < PRICE_TOL;
    const fmt = n => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

    if (within(t.tp1)) {
      out.push({
        id: `target:${t.id}:TP1:${t.tp1}`,
        severity: 'strong',
        msg: `${t.id} TP1 ${fmt(t.tp1)} reached — BTC ${fmt(btc)}`,
      });
    }
    if (within(t.tp2)) {
      out.push({
        id: `target:${t.id}:TP2:${t.tp2}`,
        severity: 'strong',
        msg: `${t.id} TP2 ${fmt(t.tp2)} reached — BTC ${fmt(btc)}`,
      });
    }
    if (within(t.sl)) {
      out.push({
        id: `target:${t.id}:SL:${t.sl}`,
        severity: 'critical',
        msg: `${t.id} SL ${fmt(t.sl)} threatened — BTC ${fmt(btc)}`,
      });
    }
    return out;
  }

  function detectExpiryWarning(cur) {
    const out = [];
    const t = cur.trade;
    if (!t || !t.expiryISO) return out;
    const ms = new Date(t.expiryISO).getTime() - Date.now();
    if (isNaN(ms)) return out;
    if (ms > 0 && ms < 24 * 3600 * 1000) {
      const hours = Math.round(ms / 3600000);
      out.push({
        id: `expiry:${t.id}:${t.expiryISO}`,
        severity: 'normal',
        msg: `${t.id} expires in ${hours}h (${t.expiryISO})`,
      });
    }
    return out;
  }

  // --- rendering --------------------------------------------------------

  function renderBanners() {
    if (!containerEl) return;
    if (activeBanners.length === 0) {
      containerEl.innerHTML = '';
      containerEl.classList.remove('has-alerts');
      return;
    }
    containerEl.classList.add('has-alerts');
    containerEl.innerHTML = activeBanners.map(b => `
      <div class="alert-banner alert-${b.severity}" data-alert-id="${b.id}">
        <span class="alert-time">${formatTime(b.ts)}</span>
        <span class="alert-msg">${escapeHtml(b.msg)}</span>
        <button class="alert-dismiss" data-dismiss="${b.id}" aria-label="Dismiss">×</button>
      </div>
    `).join('');
    containerEl.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        dismiss(btn.dataset.dismiss);
      });
    });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function notify(alert) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification('PULSE — ' + alert.severity.toUpperCase(), {
        body: alert.msg,
        tag: alert.id, // collapse duplicates at OS level too
        icon: '/favicon.ico',
      });
    } catch (e) { /* notification permission revoked mid-session */ }
  }

  function fire(alert) {
    activeBanners.push({ ...alert, ts: Date.now() });
    markFired(alert.id);
    notify(alert);
    renderBanners();
  }

  function dismiss(id) {
    activeBanners = activeBanners.filter(b => b.id !== id);
    renderBanners();
  }

  // --- public ----------------------------------------------------------

  function init(el) {
    containerEl = el;
    // Permission request — graceful: ignore denial.
    if (typeof Notification !== 'undefined'
        && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
  }

  function tick(state) {
    if (!state) return;
    if (!prevState) {
      // First tick — record baseline, do not fire (avoid alert storm on load).
      // Still check expiry/target since those are level-based not flip-based.
      const initial = [
        ...detectPriceTargets(state),
        ...detectExpiryWarning(state),
      ];
      for (const a of initial) {
        if (shouldFire(a.id)) fire(a);
      }
      prevState = state;
      return;
    }
    const alerts = [
      ...detectThermoFlips(prevState, state),
      ...detectPriceTargets(state),
      ...detectExpiryWarning(state),
    ];
    for (const a of alerts) {
      if (shouldFire(a.id)) fire(a);
    }
    prevState = state;
  }

  // Test hook: force-fire an alert (used by manual TP-hit test in verification
  // step 5). Bypasses dedup.
  function _testFire(severity, msg) {
    fire({ id: `test:${Date.now()}`, severity: severity || 'normal', msg: msg || 'test alert' });
  }

  window.Alerts = { init, tick, dismiss, _testFire };
})();
