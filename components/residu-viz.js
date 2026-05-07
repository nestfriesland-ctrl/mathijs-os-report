// RESIDU-viz — katern-aandacht-heatmap.
//
// CSS-grid van 14 dagen (rijen, recent bovenaan) × 6 katernen (dashboard +
// 5 katernen). Cel-intensiteit = view-count / max in window. Geen library
// (D3 / lightweight-charts overkill bij data-density ≤84 cellen). Hergebruik
// CSS-vars uit style.css (--ink, --paper-rule). Geen inline kleuren behalve
// rgba(ink, intensity).
//
// CLAIM: cel toont werkelijke view-count voor (dag, katern) — leeg = 0,
// donker = many. Geen kleur-buckets, geen smoothing — ruwe count.
// FALSIFIEERBAAR: vergelijk met observer-residue sensor-aggregaat-tabel.
// Discrepantie = parser of tellings-bug.
//
// ANTI-PATROON: dit is GEEN scroll/dwell-heatmap op pixel-niveau. Eén katern
// = één kolom. Dwell-tracking is engagement-vermomming (master-briefing
// 2026-05-06 expliciet uitgesloten).

(function () {
  const KATERNEN = ['dashboard', 'markt', 'machinekamer', 'lichaam', 'residu', 'necrologie'];
  const WINDOW_DAYS = 14;

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function fetchClickstream() {
    try {
      const r = await fetch('/api/wiki?path=observer/clickstream.jsonl');
      if (!r.ok) return null;
      const data = await r.json();
      return data.decoded_content || (data.content
        ? atob(data.content)
        : null);
    } catch (e) { return null; }
  }

  function parseEvents(text) {
    if (!text) return [];
    return text.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(Boolean);
  }

  function buildDayList() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }
    return days; // oldest → newest
  }

  function aggregate(events, days) {
    const dayIndex = new Map(days.map(d => [d, true]));
    const count = {};
    days.forEach(d => {
      count[d] = Object.fromEntries(KATERNEN.map(k => [k, 0]));
    });
    let max = 0;
    let inWindow = 0;
    for (const e of events) {
      if (!e || !e.ts || !e.katern) continue;
      const day = String(e.ts).slice(0, 10);
      if (!dayIndex.has(day)) continue;
      if (!KATERNEN.includes(e.katern)) continue;
      count[day][e.katern]++;
      inWindow++;
      if (count[day][e.katern] > max) max = count[day][e.katern];
    }
    return { count, max, inWindow };
  }

  function intensity(c, max) {
    if (!c || !max) return 0;
    // Clamp to 0.85 zodat cel-tekst leesbaar blijft op donkerste cel.
    return Math.min(0.85, (c / max) * 0.85);
  }

  function renderHeatmap({ container }) {
    if (!container) return;
    container.innerHTML = `<div class="hm-loading">clickstream laden…</div>`;
    fetchClickstream().then(text => {
      if (text == null) {
        container.innerHTML = `<div class="hm-empty">Clickstream onbereikbaar (api/wiki gefaald).</div>`;
        return;
      }
      const events = parseEvents(text);
      const days = buildDayList();
      const { count, max, inWindow } = aggregate(events, days);

      const cols = KATERNEN.length + 1; // +1 voor day-label kolom
      const headerRow =
        `<div class="hm-cell hm-corner"></div>` +
        KATERNEN.map(k => `<div class="hm-cell hm-header">${escape(k.slice(0, 4))}</div>`).join('');

      // Recent bovenaan: omkeren days.
      const dayRows = [...days].reverse().map(day => {
        const label = day.slice(5); // MM-DD
        const cells = KATERNEN.map(k => {
          const c = count[day][k];
          const a = intensity(c, max);
          const style = c ? `background: rgba(22,20,15,${a.toFixed(3)})` : '';
          const txtCls = a > 0.5 ? ' hm-cell-dark' : '';
          const text = c ? String(c) : '';
          return `<div class="hm-cell hm-data${txtCls}" style="${style}" title="${day} ${k}: ${c}">${text}</div>`;
        }).join('');
        return `<div class="hm-cell hm-day">${label}</div>${cells}`;
      }).join('');

      container.innerHTML = `
        <div class="residu-heatmap" style="grid-template-columns: 56px repeat(${KATERNEN.length}, 1fr)">
          ${headerRow}
          ${dayRows}
        </div>
        <div class="hm-foot">n=${inWindow} events in 14d-window · max ${max}/cel · totaal events ${events.length}</div>
      `;
    });
  }

  // Compose into existing PulseKaternViz API.
  if (!window.PulseKaternViz) window.PulseKaternViz = {};
  window.PulseKaternViz.renderResidu = renderHeatmap;
})();
