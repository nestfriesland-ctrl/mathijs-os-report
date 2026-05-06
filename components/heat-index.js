// Heat Index — krant-stijl tabel die de thermometer-data toont.
// Replaces the v3 thermometer-strip rendering. Math (lib/thermometer.js)
// is unchanged; this is purely the visual layer.
//
// Same public API as the old window.Thermometers so app.js doesn't need
// rewiring:
//   mountThermometers(containerEl)           — static skeleton
//   updateThermometers({ tickers, anchors }) — fill cells from live data

(function () {
  const TF_ORDER = ['1h', '4h', '24h', '7d'];
  const TF_LABELS = { '1h': '1h', '4h': '4h', '24h': '24h', '7d': '7d' };

  function blockHtml(label, symbols) {
    const headRow = `<tr>
      <th>Asset</th>
      ${TF_ORDER.map(tf => `<th>${TF_LABELS[tf]}</th>`).join('')}
    </tr>`;
    const bodyRows = symbols.map(sym => `
      <tr data-asset="${sym}">
        <td>${sym}</td>
        ${TF_ORDER.map(tf => `<td class="pending" data-asset="${sym}" data-tf="${tf}">…</td>`).join('')}
      </tr>
    `).join('');
    return `
      <div class="heat-block">
        <div class="group-label">${label}</div>
        <table>
          <thead>${headRow}</thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  function mountThermometers(container) {
    if (!container) return;
    const K = window.Kraken;
    if (!K) return;
    container.innerHTML = `
      ${blockHtml('Majors', K.MAJORS)}
      ${blockHtml('Alts', K.ALTS)}
    `;
  }

  function clsFor(state) {
    if (state === 'bull') return 'bull';
    if (state === 'bear') return 'bear';
    if (state === 'neutral') return 'neut';
    return 'pending';
  }

  function updateThermometers(state) {
    if (!state) return;
    const T = window.Thermometer;
    if (!T) return;
    const tickers = state.tickers || {};
    const anchors = state.anchors || {};
    const K = window.Kraken;
    if (!K) return;
    for (const a of K.ASSETS) {
      const sym = a.symbol;
      const live = tickers[sym];
      const ank = anchors[sym] || {};
      for (const tf of TF_ORDER) {
        const cell = document.querySelector(
          `#heat-grid td[data-asset="${sym}"][data-tf="${tf}"]`
        );
        if (!cell) continue;
        const pct = T.pctChange(live, ank[tf]);
        const cls = T.classify(pct, tf);
        cell.classList.remove('bull', 'bear', 'neut', 'pending');
        cell.classList.add(clsFor(cls));
        cell.textContent = T.fmtPct(pct);
      }
    }
  }

  window.Thermometers = { mountThermometers, updateThermometers };
})();
