// NECROLOGIE-viz — aggregate-staafdiagram doodsoorzaak-categorieën.
//
// Eén toegestane viz in NECROLOGIE-katern. Op katern-pagina-niveau, NIET
// binnen individuele begrafenissen (ritueel = formule + vorm — een grafiek
// bij een dood-bericht is feature-creep).
//
// CLAIM: doodsoorzaak-distributie toont dominante faalmodes in eigen
// onderzoek. Welke categorie dominant is = welke aanname-soort het meest
// neergaat in dit systeem.
// FALSIFIEERBAAR: één categorie >80% van totaal = categorisering-bias of
// paradigma-tunneling (alle dood om dezelfde reden = de categorisering
// onderscheidt onvoldoende, niet werkelijk distributie-patroon). Dan
// schema-revisie, niet meer-data.
//
// D3 mini-bar (al geladen via lightweight-charts neighbor in index.html).
// Vier categorieën horizontaal, hoogte = count. Kleuren uit --ink/--bear
// per categorie — geen sentiment-encoding (alle begrafenissen zijn neutraal
// historisch).

(function () {
  const CATEGORIES = [
    'INSUFFICIENT_OOS_SIGNAL',
    'BROKEN_ASSUMPTION',
    'PARAMETER_DRIFT',
    'REAL_WORLD_INVALIDATION',
  ];

  const SHORT = {
    INSUFFICIENT_OOS_SIGNAL: 'IOS',
    BROKEN_ASSUMPTION: 'BA',
    PARAMETER_DRIFT: 'PD',
    REAL_WORLD_INVALIDATION: 'RWI',
  };

  function readVar(name, fallback) {
    if (typeof getComputedStyle !== 'function') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function aggregate(entries) {
    const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    let unknown = 0;
    for (const e of entries) {
      if (!e || !e.doodsoorzaak) { unknown++; continue; }
      if (counts.hasOwnProperty(e.doodsoorzaak)) counts[e.doodsoorzaak]++;
      else unknown++;
    }
    return { counts, unknown };
  }

  function renderNecrologie({ container, entries }) {
    if (!container) return;
    if (typeof window.d3 === 'undefined') {
      container.innerHTML = '<div class="chart-fallback">D3 niet geladen — staafdiagram unavailable.</div>';
      return;
    }
    if (!Array.isArray(entries) || !entries.length) {
      container.innerHTML = '<div class="chart-fallback">Geen begrafenissen om te aggregeren.</div>';
      return;
    }

    const { counts, unknown } = aggregate(entries);
    const max = Math.max(1, ...Object.values(counts));
    const total = entries.length;

    container.innerHTML = '';
    const svgWidth = container.clientWidth || 480;
    const svgHeight = 180;
    const margin = { top: 16, right: 8, bottom: 36, left: 8 };
    const innerW = svgWidth - margin.left - margin.right;
    const innerH = svgHeight - margin.top - margin.bottom;

    const ink = readVar('--ink', '#16140f');
    const inkSoft = readVar('--ink-soft', '#4a463c');
    const inkMute = readVar('--ink-mute', '#756f5f');
    const paperRule = readVar('--paper-rule', '#d9d2c3');

    const svg = window.d3.select(container).append('svg')
      .attr('width', svgWidth)
      .attr('height', svgHeight);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const barW = innerW / CATEGORIES.length;
    const barPad = barW * 0.2;

    CATEGORIES.forEach((cat, i) => {
      const c = counts[cat];
      const h = (c / max) * innerH;
      const x = i * barW + barPad / 2;
      const y = innerH - h;
      const w = barW - barPad;

      g.append('rect')
        .attr('x', x).attr('y', y).attr('width', w).attr('height', h)
        .attr('fill', ink).attr('opacity', c ? 0.85 : 0.15);

      // Count above bar (or at top if zero)
      g.append('text')
        .attr('x', x + w / 2)
        .attr('y', c ? y - 4 : innerH - 4)
        .attr('text-anchor', 'middle')
        .attr('font-family', "'IBM Plex Mono', monospace")
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .attr('fill', c ? ink : inkMute)
        .text(c);

      // Short label below bar
      g.append('text')
        .attr('x', x + w / 2)
        .attr('y', innerH + 14)
        .attr('text-anchor', 'middle')
        .attr('font-family', "'IBM Plex Sans Condensed', sans-serif")
        .attr('font-size', 10)
        .attr('letter-spacing', '0.16em')
        .attr('fill', inkSoft)
        .text(SHORT[cat]);

      // Full name as tooltip via title element
      g.append('title').text(`${cat}: ${c}/${total}`);
    });

    // X-axis baseline rule
    g.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', innerH).attr('y2', innerH)
      .attr('stroke', paperRule).attr('stroke-width', 1);

    // Caption with totaal + falsifier-drempel
    const dominantPct = total ? Math.max(...Object.values(counts)) / total : 0;
    const falsifyFlag = dominantPct > 0.8 ? ' · DOMINANT >80% — categorisering-bias-flag' : '';
    const caption = document.createElement('div');
    caption.className = 'chart-caption';
    caption.textContent = `n=${total} begrafenissen · IOS=${SHORT.INSUFFICIENT_OOS_SIGNAL ? counts.INSUFFICIENT_OOS_SIGNAL : 0} BA=${counts.BROKEN_ASSUMPTION} PD=${counts.PARAMETER_DRIFT} RWI=${counts.REAL_WORLD_INVALIDATION}${unknown ? ` · ${unknown} unknown` : ''}${falsifyFlag}`;
    container.appendChild(caption);
  }

  if (!window.PulseKaternViz) window.PulseKaternViz = {};
  window.PulseKaternViz.renderNecrologie = renderNecrologie;
})();
