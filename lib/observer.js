// Observer — client-side event-batcher.
//
// Buffert observer-events in localStorage onder `pulse_observer_buffer`.
// Flush eens per minuut (één POST per minuut, batch van events) zodat we
// geen commit-spam op de wiki creëren. Op fetch-failure: events terug in
// buffer voor volgende flush.
//
// Strikt rapportage-laag. Geen ranking, geen prediction, geen interpretatie.
// Wat hier landt is observatie-data voor observer-residue prompt (PR #7).

(function () {
  const STORAGE_KEY = 'pulse_observer_buffer';
  const FLUSH_INTERVAL_MS = 60 * 1000;
  const MAX_BUFFER = 500;
  const ENDPOINT = '/api/observer-event';

  let flushTimer = null;
  let flushing = false;

  function loadBuffer() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveBuffer(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
    catch (e) { /* localStorage full or disabled — silently drop */ }
  }

  function record(katern, action, sensor) {
    if (!katern || !action) return;
    const event = {
      katern: String(katern),
      action: String(action),
      ts: new Date().toISOString(),
    };
    if (sensor) event.sensor = String(sensor);
    const buf = loadBuffer();
    buf.push(event);
    // Cap buffer to prevent runaway growth on long-offline sessions.
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
    saveBuffer(buf);
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      const buf = loadBuffer();
      if (!buf.length) return;
      // Optimistic clear — restore on failure.
      saveBuffer([]);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: buf }),
        });
        if (!res.ok) {
          // Restore: prepend so newer events stay at end.
          const current = loadBuffer();
          saveBuffer([...buf, ...current]);
        }
      } catch (e) {
        const current = loadBuffer();
        saveBuffer([...buf, ...current]);
      }
    } finally {
      flushing = false;
    }
  }

  function start() {
    if (flushTimer) return;
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    // Best-effort flush on unload — sendBeacon would be nicer but
    // requires the same JSON shape, so we just call flush() directly.
    window.addEventListener('beforeunload', () => { flush(); });
  }

  window.PulseObserver = { record, flush, start };
})();
