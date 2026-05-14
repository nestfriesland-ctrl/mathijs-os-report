// Rate Complex katern — Rente & Valuta-rubriek.
//
// Bron: wiki/sensors/rate-complex.md (frontmatter + krant-body).
// Vier blokken:
//   1. Regime-strip met badge (TIGHTENING / EASING / TRANSITION / NEUTRAL)
//   2. Yield curve SVG: 2Y / 10Y / 30Y punten met lineaire interpolatie
//   3. Spreads-tabel: 10y-2y, 30y-10y, real yield 10y — compact mono
//   4. DXY-tile met pijl + body krant-kolom

(function () {
  function escape(s) {
    if (s === null || s === undefined) return '';
    const u = window.PulseUtil;
    return u && u.escape ? u.escape(String(s)) : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseFrontmatter(md) {
    const out = {};
    if (!md) return out;
    const yaml = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (yaml) {
      for (const line of yaml[1].split(/\r?\n/)) {
        const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
        if (m) out[m[1]] = m[2].trim();
      }
    }
    return out;
  }

  function stripFrontmatterAndTitle(md) {
    if (!md) return '';
    let body = md.replace(/^---[\s\S]*?\n---\s*\n?/, '');
    body = body.replace(/^#\s+Rate Complex\s*\n/, '');
    return body.trim();
  }

  function parseBody(body) {
    const result = { kop: '', sections: [] };
    const lines = body.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim().startsWith('>')) {
      result.kop = (result.kop + ' ' + lines[i].replace(/^>\s*/, '')).trim();
      i++;
    }
    let currentHeading = null;
    let currentParas = [];
    function pushSection() {
      if (currentHeading || currentParas.length) {
        result.sections.push({ heading: currentHeading, paras: currentParas });
      }
    }
    let paraLines = [];
    function flushPara() {
      const text = paraLines.join(' ').trim();
      if (text) currentParas.push(text);
      paraLines = [];
    }
    for (; i < lines.length; i++) {
      const ln = lines[i];
      const hm = ln.match(/^##\s+(.+)/);
      if (hm) {
        flushPara();
        pushSection();
        currentHeading = hm[1].trim();
        currentParas = [];
        continue;
      }
      if (ln.trim() === '') { flushPara(); continue; }
      paraLines.push(ln.trim());
    }
    flushPara();
    pushSection();
    return result;
  }

  function parse(md) {
    if (!md) return null;
    const fm = parseFrontmatter(md);
    const body = parseBody(stripFrontmatterAndTitle(md));
    return { fm, body, raw: md };
  }

  function num(v) {
    if (v == null || v === 'null' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function regimeClass(regime) {
    const r = (regime || '').toUpperCase();
    if (r === 'TIGHTENING') return 'rc-regime-tightening';
    if (r === 'EASING')     return 'rc-regime-easing';
    if (r === 'TRANSITION') return 'rc-regime-transition';
    return 'rc-regime-neutral';
  }

  function curveClass(curve) {
    const c = (curve || '').toUpperCase();
    if (c === 'INVERTED')   return 'rc-curve-inverted';
    if (c === 'FLAT')       return 'rc-curve-flat';
    if (c === 'STEEPENING') return 'rc-curve-steep';
    return 'rc-curve-normal';
  }

  function signalLabel(signal) {
    const s = (signal || '').toUpperCase();
    const map = {
      RISK_OFF:      'risk-off',
      LATE_CYCLE:    'late-cycle',
      RISK_ON:       'risk-on',
      RISK_BUILDING: 'risk building',
      CHOPPY:        'choppy',
      WATCH:         'watch',
      NEUTRAL:       'neutraal',
    };
    return map[s] || s.toLowerCase() || 'onbekend';
  }

  function renderRegimeStrip(fm) {
    const regime = fm.regime || 'NEUTRAL';
    const curve = fm.yield_curve || '—';
    const signal = fm.signal || 'NEUTRAL';
    const corr = fm.dollar_correlation || '—';
    return `
      <div class="rc-regime-strip">
        <span class="rc-regime-badge ${regimeClass(regime)}">${escape(regime)}</span>
        <span class="rc-curve-badge ${curveClass(curve)}">curve · ${escape(curve)}</span>
        <span class="rc-signal-badge">signaal · ${escape(signalLabel(signal))}</span>
        <span class="rc-corr-badge">$ ${escape(corr.toLowerCase())}</span>
      </div>
    `;
  }

  function renderYieldCurveSVG(fm) {
    const y2 = num(fm.us2y);
    const y10 = num(fm.us10y);
    const y30 = num(fm.us30y);
    if (y2 == null || y10 == null || y30 == null) return '';

    const W = 320, H = 110, padL = 36, padR = 16, padT = 14, padB = 22;
    const all = [y2, y10, y30];
    const yMin = Math.floor(Math.min(...all) * 4) / 4 - 0.25;
    const yMax = Math.ceil(Math.max(...all) * 4) / 4 + 0.25;
    const xPositions = [padL, padL + (W - padL - padR) * 0.4, W - padR];
    const labels = ['2Y', '10Y', '30Y'];
    const values = [y2, y10, y30];
    const yToPx = (v) => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin));

    const pathD = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPositions[i]} ${yToPx(v)}`).join(' ');
    const points = values.map((v, i) =>
      `<circle cx="${xPositions[i]}" cy="${yToPx(v)}" r="3.5" class="rc-curve-pt" />`
    ).join('');
    const labelsHtml = values.map((v, i) =>
      `<text x="${xPositions[i]}" y="${H - 6}" class="rc-curve-xlabel">${labels[i]}</text>` +
      `<text x="${xPositions[i]}" y="${yToPx(v) - 9}" class="rc-curve-vlabel">${v.toFixed(2)}%</text>`
    ).join('');

    // y-axis ticks
    const ticks = [];
    const step = (yMax - yMin) / 3;
    for (let k = 0; k <= 3; k++) {
      const v = yMin + step * k;
      ticks.push(`<text x="${padL - 6}" y="${yToPx(v) + 3}" class="rc-curve-ytick">${v.toFixed(1)}</text>`);
      ticks.push(`<line x1="${padL}" y1="${yToPx(v)}" x2="${W - padR}" y2="${yToPx(v)}" class="rc-curve-grid" />`);
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" class="rc-curve-svg" preserveAspectRatio="xMidYMid meet" aria-label="US Treasury yield curve">
        ${ticks.join('')}
        <path d="${pathD}" class="rc-curve-line" />
        ${points}
        ${labelsHtml}
      </svg>
    `;
  }

  function renderSpreadsTable(fm) {
    const s102 = num(fm.spread_10y_2y);
    const s3010 = num(fm.spread_30y_10y);
    const real = num(fm.real_yield_10y);
    const breakeven = num(fm.breakeven_10y);
    const fedMid = num(fm.fed_funds_mid);
    const hy = num(fm.hy_spread);

    const cell = (label, value, suffix = ' bps') => {
      if (value == null) return `
        <tr><td>${escape(label)}</td><td class="rc-sp-val">—</td></tr>`;
      const cls = value < 0 ? 'rc-sp-neg' : '';
      return `
        <tr><td>${escape(label)}</td><td class="rc-sp-val ${cls}">${value.toFixed(0)}${suffix}</td></tr>`;
    };
    const pctCell = (label, value) => {
      if (value == null) return `
        <tr><td>${escape(label)}</td><td class="rc-sp-val">—</td></tr>`;
      const cls = value < 0 ? 'rc-sp-neg' : '';
      return `
        <tr><td>${escape(label)}</td><td class="rc-sp-val ${cls}">${value.toFixed(2)}%</td></tr>`;
    };

    return `
      <table class="rc-spreads">
        <tbody>
          ${cell('10y − 2y',   s102)}
          ${cell('30y − 10y',  s3010)}
          ${pctCell('Real yield 10y', real)}
          ${pctCell('Breakeven 10y',  breakeven)}
          ${pctCell('Fed funds mid',  fedMid)}
          ${pctCell('HY OAS',         hy)}
        </tbody>
      </table>
    `;
  }

  function renderDxyTile(fm) {
    const dxy = num(fm.dxy);
    const pct = num(fm.dxy_delta_pct);
    if (dxy == null) return '';
    const arrow = pct == null ? '·' : pct > 0.005 ? '▲' : pct < -0.005 ? '▼' : '·';
    const arrowClass = pct == null ? '' : pct > 0 ? 'rc-arrow-up' : pct < 0 ? 'rc-arrow-down' : '';
    const pctText = pct == null ? '' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    return `
      <div class="rc-dxy-tile">
        <span class="rc-dxy-label">DXY</span>
        <span class="rc-dxy-val">${dxy.toFixed(2)}</span>
        <span class="rc-dxy-delta ${arrowClass}">${arrow} ${escape(pctText)}</span>
      </div>
    `;
  }

  function renderBody(body) {
    if (!body || !body.sections.length) {
      return '<p class="krant-body dim">Geen body beschikbaar.</p>';
    }
    const parts = [];
    if (body.kop) {
      parts.push(`<p class="rc-kop">${escape(body.kop)}</p>`);
    }
    for (const sec of body.sections) {
      if (sec.heading) {
        parts.push(`<h3 class="rc-section-h">${escape(sec.heading)}</h3>`);
      }
      for (const p of sec.paras) {
        parts.push(`<p class="krant-body rc-para">${escape(p)}</p>`);
      }
    }
    return parts.join('\n');
  }

  function render({ container, data }) {
    if (!container) return;
    if (!data) {
      container.innerHTML = `
        <section class="krant-katern rc-katern">
          <header class="krant-nameplate rc-nameplate">
            <h1>Rente &amp; Valuta</h1>
            <span class="krant-sub">rate-complex sensor</span>
          </header>
          <div class="dk-empty"><p class="dim">rate-complex.md niet beschikbaar.</p></div>
        </section>
      `;
      return;
    }
    const fm = data.fm || {};
    const updated = fm.last_updated ? new Date(fm.last_updated) : null;
    const stamp = updated ? updated.toLocaleString('nl-NL', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }) : '—';

    container.innerHTML = `
      <section class="krant-katern rc-katern">
        <header class="krant-nameplate rc-nameplate">
          <h1>Rente &amp; Valuta</h1>
          <span class="krant-sub">rate-complex sensor · ${escape(stamp)}</span>
        </header>

        ${renderRegimeStrip(fm)}

        <div class="rc-grid">
          <div class="rc-grid-left">
            <h3 class="rc-section-h">Yield curve</h3>
            ${renderYieldCurveSVG(fm)}
            ${renderDxyTile(fm)}
          </div>
          <div class="rc-grid-right">
            <h3 class="rc-section-h">Spreads &amp; reals</h3>
            ${renderSpreadsTable(fm)}
          </div>
        </div>

        <div class="rc-body">
          ${renderBody(data.body)}
        </div>
      </section>
    `;
  }

  window.PulseRateComplexKatern = {
    parse,
    parseFrontmatter,
    render,
  };
})();
