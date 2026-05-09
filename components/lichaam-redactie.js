// Lichaam-redactie — voorpagina + drie diepte-routes (today/predictions/falsifier).
// Parsed cortex.md (verplicht) en brier.md (optioneel) uit wiki/sensors/.
//
// Vier renderers, hergebruik bestaande CSS-klassen:
//   renderVoorpagina   → spiegelt <section class="lead"> (lichaam-lead variant)
//   renderHoofdartikel → triple met cortex-card + brier-card + bloed-stub
//   renderPredictions  → scorebord-tabel uit cortex.md
//   renderFalsifier    → Brier-trend + in-band-rate per metric
//
// Geen nieuwe CSS — strikt hergebruik van: lead, triple, kicker, deck, byline,
// rule, meta-row, label, dim. Terracotta-kicker via 'compressie' bestaande klasse.

(function () {
  const U = () => window.PulseUtil;

  function escape(s) {
    if (s === null || s === undefined) return '';
    const u = U();
    return u && u.escape ? u.escape(String(s)) : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // -- Inline parsers (cortex/brier zijn markdown met **Kop:** / **Stelling:** etc.)
  // We hergebruiken parseKrant/parseRegime/parseSensorMeta als window globals.

  // Brier 30d-regel vorm: "**Brier 30d:** 0.18 (DEGRADED)" of "Brier (30d): 0.21 / NOMINAL".
  function parseInlineBrier(content) {
    if (!content) return null;
    const m = content.match(/Brier[^:\n]{0,12}:\s*([0-9.]+)\s*[\(\/\|]?\s*([A-Z\-]+)?/i);
    if (!m) return null;
    return {
      score: parseFloat(m[1]),
      status: m[2] ? m[2].toUpperCase() : null,
    };
  }

  // Predictions inline — telt **Prediction:** of `- prediction:` regels.
  // Geeft globaal totaal terug zonder de tabel zelf te lezen (die doet parseScorebord).
  function parseInlinePredictions(content) {
    if (!content) return null;
    const matches = content.match(/(?:^|\n)\s*[-*]?\s*\*?\*?Prediction\*?\*?:/gi);
    if (!matches) return null;
    return { count: matches.length };
  }

  // Scorebord — een markdown-tabel onder een ## Predictions of ## Scorebord heading.
  // Resultaat: { headers: [...], rows: [[col, col, ...], ...] } of null.
  function parseScorebord(content) {
    if (!content) return null;
    const headRe = /^##+\s*(predictions|scorebord|score[-\s]?bord|track[-\s]?record)\s*$/im;
    const head = content.match(headRe);
    if (!head) return null;
    const start = head.index + head[0].length;
    const tail = content.slice(start);
    // Eerste markdown-tabel na de heading.
    const tableMatch = tail.match(/\n(\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/);
    if (!tableMatch) return null;
    const lines = tableMatch[1].trim().split('\n').filter(Boolean);
    if (lines.length < 2) return null;
    const headers = lines[0].slice(1, -1).split('|').map(s => s.trim());
    const rows = lines.slice(2).map(l =>
      l.slice(1, -1).split('|').map(s => s.trim())
    ).filter(r => r.some(c => c.length));
    return { headers, rows };
  }

  // In-band-rate per metric — herkent regels als "HRV: in-band 78% (n=14)".
  function parseInBandRates(content) {
    if (!content) return [];
    const out = [];
    const re = /([A-Za-z][A-Za-z0-9_\-\s]{0,24}?):\s*in[-\s]?band\s*([0-9]{1,3})\s*%(?:\s*\(n=([0-9]+)\))?/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
      out.push({
        metric: m[1].trim(),
        rate: parseInt(m[2], 10),
        n: m[3] ? parseInt(m[3], 10) : null,
      });
    }
    return out;
  }

  // Brier-trend — opeenvolgende score-snippets in tijd. Herkent "YYYY-MM-DD ... 0.18".
  function parseBrierTrend(content) {
    if (!content) return [];
    const out = [];
    const re = /(\d{4}-\d{2}-\d{2})[^\n]{0,80}?Brier[^:\n]{0,12}:\s*([0-9.]+)/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
      out.push({ date: m[1], score: parseFloat(m[2]) });
    }
    return out;
  }

  // Top-level parse — bundelt cortex + brier in één data-object.
  // Inputs zijn raw md-strings; brierContent mag null zijn.
  function parse({ cortexContent, brierContent }) {
    const cortexKrant = (cortexContent && window.parseKrant)
      ? window.parseKrant(cortexContent)
      : (cortexContent ? null : null);
    // window.parseKrant niet exporteert — gebruik fallback inline parser.
    const krant = cortexContent ? parseKrantInline(cortexContent) : null;
    const cortexRegime = cortexContent ? parseRegimeInline(cortexContent) : null;
    const cortexMeta = cortexContent ? parseMetaInline(cortexContent) : null;

    const brierKrant = brierContent ? parseKrantInline(brierContent) : null;
    const brierMeta = brierContent ? parseMetaInline(brierContent) : null;
    const brierFromBrier = brierContent ? parseInlineBrier(brierContent) : null;
    const brierFromCortex = cortexContent ? parseInlineBrier(cortexContent) : null;
    const brier = brierFromBrier || brierFromCortex;

    return {
      cortex: cortexContent ? {
        content: cortexContent,
        krant,
        regime: cortexRegime,
        meta: cortexMeta,
      } : null,
      brier: brierContent ? {
        content: brierContent,
        krant: brierKrant,
        meta: brierMeta,
      } : null,
      brierScore: brier,
      predictions: cortexContent ? parseInlinePredictions(cortexContent) : null,
      scorebord: cortexContent ? parseScorebord(cortexContent) : null,
      inBand: brierContent ? parseInBandRates(brierContent) : (cortexContent ? parseInBandRates(cortexContent) : []),
      brierTrend: brierContent ? parseBrierTrend(brierContent) : [],
    };
  }

  // Inline kopieën — app.js exporteert parseKrant/parseRegime/parseSensorMeta
  // niet als window-globals. We doen daarom slim-equivalente inline-parsers
  // op de delen die we nodig hebben.
  function parseKrantInline(content) {
    if (!content) return null;
    const k = {};
    const kop = content.match(/\*\*Kop:\*\*\s*(.+)/);
    const stell = content.match(/\*\*Stelling:\*\*\s*(.+)/);
    const les = content.match(/\*\*Les:\*\*\s*(.+)/);
    const actie = content.match(/\*\*Actie:\*\*\s*(.+)/);
    const bewijs = content.match(/\*\*Bewijs:\*\*\s*([\s\S]*?)(?=\n\*\*Les:|\n\*\*Actie:|\n##)/);
    k.kop = kop ? kop[1].trim() : null;
    k.stelling = stell ? stell[1].trim() : null;
    k.bewijs = bewijs ? bewijs[1].trim() : null;
    k.les = les ? les[1].trim() : null;
    k.actie = actie ? actie[1].trim() : null;
    k.hasKrant = !!(k.kop || k.stelling || k.les);
    return k;
  }

  function parseRegimeInline(content) {
    let m = content.match(/^>\s*regime:\s*(.+)/mi);
    if (m) return m[1].trim();
    m = content.match(/^regime:\s*(.+)/mi);
    if (m) return m[1].trim();
    m = content.match(/\*\*State:\*\*\s*([^\/\n]+)/);
    if (m) return m[1].trim();
    return null;
  }

  function parseMetaInline(content) {
    const meta = { lastUpdated: null, status: 'unknown' };
    const ts = content.match(/^[>\s-]*last_updated:\s*([^\n]+)/mi);
    if (ts) meta.lastUpdated = ts[1].trim();
    const stateRe = content.match(/\*\*State:\*\*\s*([A-Z\-]+)/);
    if (stateRe) meta.status = stateRe[1];
    return meta;
  }

  // chooseVoorpaginaKop — brier wint wanneer DEGRADED/CRITICAL, anders cortex.
  function chooseVoorpaginaKop(data) {
    if (!data) return null;
    const brierStatus = data.brierScore && data.brierScore.status;
    const isDegraded = brierStatus && /^(DEGRADED|CRITICAL|FAIL|BROKEN)/i.test(brierStatus);
    if (isDegraded && data.brier && data.brier.krant && data.brier.krant.kop) {
      return { source: 'brier', krant: data.brier.krant, regime: brierStatus };
    }
    if (data.cortex && data.cortex.krant && data.cortex.krant.kop) {
      return { source: 'cortex', krant: data.cortex.krant, regime: data.cortex.regime };
    }
    if (data.brier && data.brier.krant && data.brier.krant.kop) {
      return { source: 'brier', krant: data.brier.krant, regime: brierStatus };
    }
    if (data.cortex && data.cortex.krant) {
      return { source: 'cortex', krant: data.cortex.krant, regime: data.cortex.regime };
    }
    return null;
  }

  // -- Voorpagina (boven nemesis-front op dashboard) -----------------------
  function renderVoorpagina({ section, data }) {
    if (!section) return;
    if (!data || (!data.cortex && !data.brier)) {
      section.innerHTML = `<div class="loading">Lichaam-redactie laadt…</div>`;
      return;
    }
    const choice = chooseVoorpaginaKop(data);
    if (!choice) {
      section.innerHTML = `
        <div>
          <div class="kicker dim">Lichaam-redactie · placeholder</div>
          <h1>Lichaam-katern wacht op fysiologie-data</h1>
          <p class="deck">Cortex en Brier bestaan nog niet als sensor-files in deze pass.</p>
        </div>
        <aside>
          <div class="label">diepte</div>
          <div class="meta-row"><span></span><span><a href="#lichaam/today">→ hoofdartikel</a></span></div>
          <div class="meta-row"><span></span><span><a href="#lichaam/predictions">→ scorebord</a></span></div>
          <div class="meta-row"><span></span><span><a href="#lichaam/falsifier">→ falsifier</a></span></div>
        </aside>
      `;
      return;
    }

    const k = choice.krant;
    const brierLine = data.brierScore
      ? `Brier 30d ${data.brierScore.score.toFixed(2)}${data.brierScore.status ? ` · ${data.brierScore.status}` : ''}`
      : null;
    const predLine = data.predictions ? `${data.predictions.count} predictions tracked` : null;

    section.innerHTML = `
      <div>
        <div class="kicker compressie">Lichaam-redactie · ${escape(choice.source)}</div>
        <h1>${escape(k.kop || k.stelling || 'Lichaam-stelling')}</h1>
        ${k.stelling && k.kop && k.stelling !== k.kop ? `<p class="deck">${escape(k.stelling)}</p>` : ''}
        <div class="lead-body">
          ${k.les ? `<p>${escape(k.les)}</p>` : ''}
          ${k.actie ? `<p><strong>Actie.</strong> ${escape(k.actie)}</p>` : ''}
        </div>
      </div>
      <aside>
        <div class="label">fysiologie</div>
        ${choice.regime ? `<div class="meta-row"><span>Regime</span><span>${escape(choice.regime)}</span></div>` : ''}
        ${brierLine ? `<div class="meta-row"><span>Brier</span><span>${escape(brierLine)}</span></div>` : ''}
        ${predLine ? `<div class="meta-row"><span>Predictions</span><span>${escape(predLine)}</span></div>` : ''}
        <div class="meta-row"><span>Diepte</span><span><a href="#lichaam/today">→ hoofdartikel</a></span></div>
        <div class="meta-row"><span></span><span><a href="#lichaam/predictions">→ scorebord</a></span></div>
        <div class="meta-row"><span></span><span><a href="#lichaam/falsifier">→ falsifier</a></span></div>
      </aside>
    `;
  }

  // -- Hoofdartikel (#lichaam/today) — triple cortex + brier + bloed-stub ---
  function cardArticle({ kicker, title, byline, body, isStub }) {
    return `
      <article>
        <div class="kicker ${isStub ? 'dim' : ''}">${escape(kicker || '')}</div>
        <h2>${escape(title || '—')}</h2>
        ${byline ? `<div class="byline">${escape(byline)}</div>` : ''}
        ${body || ''}
      </article>
    `;
  }

  function renderHoofdartikel({ container, data }) {
    if (!container) return;
    if (!data) {
      container.innerHTML = `<section class="lead"><div class="loading">hoofdartikel laadt…</div></section>`;
      return;
    }

    const cortex = data.cortex;
    const cortexBody = cortex && cortex.krant
      ? [
          cortex.krant.bewijs ? `<p>${escape(cortex.krant.bewijs)}</p>` : '',
          cortex.krant.les ? `<p>${escape(cortex.krant.les)}</p>` : '',
          cortex.krant.actie ? `<p><strong>Actie.</strong> ${escape(cortex.krant.actie)}</p>` : '',
        ].filter(Boolean).join('')
      : '<p class="dim">Cortex-data niet beschikbaar.</p>';

    const cortexCard = cardArticle({
      kicker: 'cortex · whoop',
      title: cortex && cortex.krant ? (cortex.krant.kop || cortex.krant.stelling || 'Cortex') : 'Cortex',
      byline: cortex && cortex.regime ? `regime: ${cortex.regime}` : (cortex ? '' : 'placeholder'),
      body: cortexBody,
      isStub: !cortex,
    });

    let brierBody;
    let brierTitle = 'Brier';
    let brierByline = '';
    if (data.brier && data.brier.krant) {
      brierBody = [
        data.brier.krant.bewijs ? `<p>${escape(data.brier.krant.bewijs)}</p>` : '',
        data.brier.krant.les ? `<p>${escape(data.brier.krant.les)}</p>` : '',
      ].filter(Boolean).join('') || '<p class="dim">Geen Brier-tekst.</p>';
      brierTitle = data.brier.krant.kop || data.brier.krant.stelling || 'Brier';
      brierByline = data.brier.meta && data.brier.meta.status ? `state: ${data.brier.meta.status}` : '';
    } else if (data.brierScore) {
      brierBody = `<p>Brier-score 30d: <strong>${data.brierScore.score.toFixed(2)}</strong>${data.brierScore.status ? ` (${escape(data.brierScore.status)})` : ''}.</p>
        <p class="dim">Inline-fallback uit cortex.md — eigen brier.md ontbreekt nog.</p>`;
      brierTitle = `Brier 30d · ${data.brierScore.score.toFixed(2)}`;
      brierByline = data.brierScore.status || '';
    } else {
      brierBody = '<p class="dim">Geen Brier-data.</p>';
      brierByline = 'placeholder';
    }
    const brierCard = cardArticle({
      kicker: 'brier · falsifier',
      title: brierTitle,
      byline: brierByline,
      body: brierBody,
      isStub: !data.brier && !data.brierScore,
    });

    const bloedCard = cardArticle({
      kicker: 'bloed · stub',
      title: 'Bloed-panel volgt',
      byline: 'gepland — nog geen sensor-file',
      body: '<p class="dim">Wanneer een bloed-sensor (lipiden, ferritine, hsCRP) wordt aangezet, verschijnt hier de derde kolom. Tot die tijd: stub.</p>',
      isStub: true,
    });

    container.innerHTML = `
      <section class="triple lichaam-triple" id="lichaam-today">
        ${cortexCard}
        <div class="rule"></div>
        ${brierCard}
        <div class="rule"></div>
        ${bloedCard}
      </section>
      <section class="strip">
        <div class="byline">
          <a href="#lichaam">← voorpagina</a>
          &nbsp;·&nbsp;
          <a href="#lichaam/predictions">→ scorebord</a>
          &nbsp;·&nbsp;
          <a href="#lichaam/falsifier">→ falsifier</a>
          &nbsp;·&nbsp;
          <a href="#dashboard">← dashboard</a>
        </div>
      </section>
    `;
  }

  // -- Predictions (#lichaam/predictions) — scorebord-tabel uit cortex.md ---
  function renderPredictions({ container, data }) {
    if (!container) return;
    const sb = data && data.scorebord;
    if (!sb || !sb.rows || !sb.rows.length) {
      container.innerHTML = `
        <section class="lead lichaam-predictions" id="lichaam-predictions">
          <div>
            <div class="kicker dim">Lichaam · predictions · placeholder</div>
            <h1>Geen scorebord-tabel gevonden</h1>
            <p class="deck">Cortex.md mist een markdown-tabel onder ## Predictions of ## Scorebord.</p>
            <div class="lead-body">
              <p>Wanneer cortex predictions begint te tracken (verwacht: outcome | predicted | actual | brier), verschijnt hier de tabel.</p>
            </div>
          </div>
          <aside>
            <div class="label">links</div>
            <div class="meta-row"><span></span><span><a href="#lichaam/today">← hoofdartikel</a></span></div>
            <div class="meta-row"><span></span><span><a href="#lichaam/falsifier">→ falsifier</a></span></div>
            <div class="meta-row"><span></span><span><a href="#dashboard">← dashboard</a></span></div>
          </aside>
        </section>
      `;
      return;
    }

    const headerCells = sb.headers.map(h => `<th>${escape(h)}</th>`).join('');
    const rowsHtml = sb.rows.map(r =>
      `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`
    ).join('');

    const brierLine = data.brierScore
      ? `Brier 30d ${data.brierScore.score.toFixed(2)}${data.brierScore.status ? ` · ${data.brierScore.status}` : ''}`
      : null;

    container.innerHTML = `
      <section class="lead lichaam-predictions" id="lichaam-predictions">
        <div>
          <div class="kicker compressie">Lichaam · predictions</div>
          <h1>Scorebord</h1>
          <p class="deck">${sb.rows.length} predictions getrackt${brierLine ? ` · ${escape(brierLine)}` : ''}.</p>
          <div class="lead-body">
            <table style="width:100%; border-collapse:collapse; font-family:var(--mono, monospace); font-size:0.9em;">
              <thead>
                <tr style="border-bottom:1px solid currentColor;">${headerCells}</tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
        <aside>
          <div class="label">scorebord-meta</div>
          <div class="meta-row"><span>Aantal</span><span>${sb.rows.length}</span></div>
          ${brierLine ? `<div class="meta-row"><span>Brier</span><span>${escape(brierLine)}</span></div>` : ''}
          <div class="meta-row"><span></span><span><a href="#lichaam/today">← hoofdartikel</a></span></div>
          <div class="meta-row"><span></span><span><a href="#lichaam/falsifier">→ falsifier</a></span></div>
          <div class="meta-row"><span></span><span><a href="#dashboard">← dashboard</a></span></div>
        </aside>
      </section>
    `;
  }

  // -- Falsifier (#lichaam/falsifier) — Brier-trend + in-band-rate ----------
  function renderFalsifier({ container, data }) {
    if (!container) return;
    const trend = (data && data.brierTrend) || [];
    const inBand = (data && data.inBand) || [];

    const trendHtml = trend.length
      ? `
        <article>
          <div class="kicker">brier-trend</div>
          <h2>Brier-score over tijd</h2>
          <table style="width:100%; border-collapse:collapse; font-family:var(--mono, monospace); font-size:0.9em;">
            <thead>
              <tr style="border-bottom:1px solid currentColor;">
                <th style="text-align:left;">Datum</th>
                <th style="text-align:right;">Brier</th>
              </tr>
            </thead>
            <tbody>
              ${trend.map(p => `<tr><td>${escape(p.date)}</td><td style="text-align:right;">${p.score.toFixed(3)}</td></tr>`).join('')}
            </tbody>
          </table>
        </article>
      `
      : `
        <article>
          <div class="kicker dim">brier-trend · placeholder</div>
          <h2>Geen tijdreeks gevonden</h2>
          <p class="dim">Brier.md mist datum-gestempelde scores. Een falsifier zonder trend is alleen een snapshot.</p>
        </article>
      `;

    const inBandHtml = inBand.length
      ? `
        <article>
          <div class="kicker">in-band-rate per metric</div>
          <h2>Calibratie per metric</h2>
          <table style="width:100%; border-collapse:collapse; font-family:var(--mono, monospace); font-size:0.9em;">
            <thead>
              <tr style="border-bottom:1px solid currentColor;">
                <th style="text-align:left;">Metric</th>
                <th style="text-align:right;">In-band</th>
                <th style="text-align:right;">n</th>
              </tr>
            </thead>
            <tbody>
              ${inBand.map(m => `
                <tr>
                  <td>${escape(m.metric)}</td>
                  <td style="text-align:right;">${m.rate}%</td>
                  <td style="text-align:right;">${m.n != null ? m.n : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </article>
      `
      : `
        <article>
          <div class="kicker dim">in-band-rate · placeholder</div>
          <h2>Geen in-band-data per metric</h2>
          <p class="dim">Verwacht patroon: "HRV: in-band 78% (n=14)". Geen match in cortex/brier.</p>
        </article>
      `;

    const currentBrier = data && data.brierScore;

    container.innerHTML = `
      <section class="lead lichaam-falsifier" id="lichaam-falsifier">
        <div>
          <div class="kicker compressie">Lichaam · falsifier</div>
          <h1>Falsifier</h1>
          <p class="deck">Een lichaam-katern dat zichzelf niet kan falsifiëren is wellness-theater. Brier-trend en in-band-rate zijn de twee getallen die het systeem eerlijk houden.</p>
        </div>
        <aside>
          <div class="label">huidig</div>
          ${currentBrier ? `<div class="meta-row"><span>Brier 30d</span><span>${currentBrier.score.toFixed(2)}</span></div>` : ''}
          ${currentBrier && currentBrier.status ? `<div class="meta-row"><span>Status</span><span>${escape(currentBrier.status)}</span></div>` : ''}
          <div class="meta-row"><span>Trend-punten</span><span>${trend.length}</span></div>
          <div class="meta-row"><span>Metrics</span><span>${inBand.length}</span></div>
          <div class="meta-row"><span></span><span><a href="#lichaam/today">← hoofdartikel</a></span></div>
          <div class="meta-row"><span></span><span><a href="#lichaam/predictions">← scorebord</a></span></div>
          <div class="meta-row"><span></span><span><a href="#dashboard">← dashboard</a></span></div>
        </aside>
      </section>
      <section class="triple lichaam-falsifier-detail">
        ${trendHtml}
        <div class="rule"></div>
        ${inBandHtml}
      </section>
    `;
  }

  window.PulseLichaamRedactie = {
    parse,
    parseInlineBrier,
    parseInlinePredictions,
    parseScorebord,
    chooseVoorpaginaKop,
    renderVoorpagina,
    renderHoofdartikel,
    renderPredictions,
    renderFalsifier,
  };
})();
