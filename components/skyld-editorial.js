// SKYLD EDITORIAL — voorpagina van het SKYLD-katern als krant.
//
// Verwacht: skyld.md sensor-content (frontmatter + body). Render een volledige
// editorial layout — nameplate, headline-briefing, scorebord, pipeline-funnel,
// facturen-sectie, taken-briefing, daemon-strip, footer. Cream-papier, Lora,
// .krant-* CSS. Geen dashboard-cards, geen grijze blokken.

(function () {
  const U = () => window.PulseUtil;

  // --- helpers ------------------------------------------------------------

  function toInt(v) {
    if (v == null || v === '') return null;
    const n = parseInt(String(v).replace(/\D+/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function fmtNum(n) {
    if (n == null) return '—';
    return n.toLocaleString('nl-NL');
  }

  function fmtPct(num, denom) {
    if (num == null || !denom) return '—';
    return Math.round((num / denom) * 100) + '%';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2, '0');
      const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
      const mm = months[d.getMonth()];
      const yyyy = d.getFullYear();
      return `${dd} ${mm} ${yyyy}`;
    } catch (e) { return iso; }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch (e) { return ''; }
  }

  function hoursSince(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return null;
    return Math.max(0, Math.round(ms / 3_600_000));
  }

  // --- briefing-proza -----------------------------------------------------

  // Vertaal sensor-data naar één leesbare regel ("kop") en één sub-regel ("lead").
  // De ruwe getallen leven verderop in het scorebord — kop blijft menselijk.
  function buildBriefing(fm) {
    const errors24h = toInt(fm.enrichment_errors_24h);
    const pending = toInt(fm.enrichment_pending);
    const overdue = toInt(fm.invoices_overdue);
    const urgent = toInt(fm.tasks_urgent);
    const lastE = hoursSince(fm.last_enriched_at);

    let kop;
    if (errors24h === 0 && lastE != null && lastE < 24) {
      kop = 'Enrichment daemon draait — backlog daalt gestaag.';
    } else if (errors24h > 0) {
      kop = `Enrichment-errors zichtbaar (${errors24h}/24u) — daemon heeft aandacht nodig.`;
    } else if (lastE != null && lastE >= 24) {
      kop = `Daemon stil sinds ${lastE} uur — backlog stapelt.`;
    } else {
      kop = 'SKYLD-pipeline in beweging.';
    }

    const leadParts = [];
    if (overdue != null) leadParts.push(overdue === 0 ? 'geen overdue facturen' : `${overdue} ${overdue === 1 ? 'factuur' : 'facturen'} overdue`);
    if (urgent != null) leadParts.push(`${urgent} urgent ${urgent === 1 ? 'taak' : 'taken'} open`);
    if (pending != null) leadParts.push(`${fmtNum(pending)} pending in pipeline`);
    const lead = leadParts.length ? leadParts.join(', ') + '.' : '';

    return { kop, lead };
  }

  // --- scorebord ----------------------------------------------------------

  function scorebordHtml(fm) {
    const u = U();
    const total = toInt(fm.contacts_total);
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const overdue = toInt(fm.invoices_overdue);
    const open = toInt(fm.invoices_open);
    const urgent = toInt(fm.tasks_urgent);

    const items = [
      { label: 'Contacts totaal', value: fmtNum(total), sub: enriched != null ? `${fmtPct(enriched, total)} verrijkt` : '' },
      { label: 'Pipeline pending', value: fmtNum(pending), sub: total ? `${fmtPct(pending, total)} van pool` : '' },
      { label: 'Facturen open', value: fmtNum(open), sub: overdue != null ? `${overdue} overdue` : '', neg: overdue > 0 },
      { label: 'Taken urgent', value: fmtNum(urgent), sub: '', neg: urgent > 5 },
    ];

    return `
      <section class="skyld-scorebord">
        ${items.map(it => `
          <div class="skyld-scorebord-cell">
            <span class="krant-meta">${u.escape(it.label)}</span>
            <p class="skyld-bignum${it.neg ? ' is-neg' : ''}">${u.escape(it.value)}</p>
            ${it.sub ? `<span class="krant-meta skyld-scorebord-sub">${u.escape(it.sub)}</span>` : ''}
          </div>
        `).join('')}
      </section>
    `;
  }

  // --- pipeline funnel ----------------------------------------------------

  // Layers L0..L6 — sensor-frontmatter heeft nu alleen done/pending counts.
  // Verdeling over layers is hardcoded mockup tot sensor per-layer counts levert.
  // De PROPORTIES tonen wel echte data waar beschikbaar (L6 = enriched, L0 = pending).
  function pipelineFunnelHtml(fm) {
    const u = U();
    const enriched = toInt(fm.enrichment_done) || 0;
    const pending = toInt(fm.enrichment_pending) || 0;
    const total = enriched + pending;

    // Hardcoded mockup-verdeling (sensor-binding later). L0..L6 sommen tot total.
    const layers = [
      { id: 'L0', label: 'Raw',         count: Math.round(pending * 0.55) },
      { id: 'L1', label: 'Resolved',    count: Math.round(pending * 0.25) },
      { id: 'L3', label: 'Company',     count: Math.round(pending * 0.15) },
      { id: 'L4', label: 'Person',      count: Math.round(pending * 0.05) },
      { id: 'L5', label: 'Decision',    count: Math.round(enriched * 0.35) },
      { id: 'L6', label: 'Activated',   count: Math.round(enriched * 0.65) },
    ];

    const max = layers.reduce((m, l) => Math.max(m, l.count), 1);

    return `
      <section class="skyld-funnel">
        <div class="skyld-funnel-head">
          <h2 class="krant-h2">Pipeline</h2>
          <span class="krant-meta">L0 → L6 · ${fmtNum(total)} records</span>
        </div>
        <hr class="krant-rule">
        <div class="skyld-funnel-bars">
          ${layers.map(l => `
            <div class="skyld-funnel-row${l.count === 0 ? ' is-empty' : ''}">
              <span class="skyld-funnel-id">${u.escape(l.id)}</span>
              <span class="skyld-funnel-label">${u.escape(l.label)}</span>
              <div class="skyld-funnel-bar-wrap">
                <div class="skyld-funnel-bar" style="width: ${Math.max(2, (l.count / max) * 100)}%;"></div>
              </div>
              <span class="skyld-funnel-count">${fmtNum(l.count)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // --- facturen -----------------------------------------------------------

  // Sensor levert nog geen factuur-lijst. Hardcoded mockup tot list_invoices
  // gedrag in de sensor-frontmatter exposed wordt. Structuur klaar.
  function facturenHtml(fm) {
    const u = U();
    const overdueCount = toInt(fm.invoices_overdue) || 0;
    const openCount = toInt(fm.invoices_open) || 0;

    // Mockup-records — placeholder tot sensor velden levert.
    const overdueList = [
      { klant: 'Hof en Hiem',     bedrag: '€ 4.250',  dagen: 31 },
      { klant: 'Streekwinkel BV', bedrag: '€ 1.890',  dagen: 18 },
      { klant: 'Drachten Atelier', bedrag: '€ 920',   dagen: 12 },
    ].slice(0, Math.min(3, overdueCount));

    const recentList = [
      { klant: 'NEST Wellness',   bedrag: '€ 3.400',  status: 'verzonden 2d' },
      { klant: 'Friesland.nl',    bedrag: '€ 1.150',  status: 'verzonden 4d' },
    ];

    const paidList = [
      { klant: 'CTRL Engine BV',  bedrag: '€ 2.800',  status: 'betaald ma' },
    ];

    return `
      <section class="skyld-facturen">
        <div class="skyld-section-head">
          <h2 class="krant-h2">Facturen</h2>
          <span class="krant-meta">${openCount} open · ${overdueCount} overdue</span>
        </div>
        <hr class="krant-rule">
        ${overdueList.length ? `
          <ul class="skyld-factuur-list">
            ${overdueList.map(f => `
              <li class="skyld-factuur skyld-factuur--overdue">
                <span class="skyld-factuur-klant">${u.escape(f.klant)}</span>
                <span class="skyld-factuur-bedrag">${u.escape(f.bedrag)}</span>
                <span class="skyld-factuur-meta">${u.escape(f.dagen + ' dagen overdue')}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${recentList.length ? `
          <ul class="skyld-factuur-list">
            ${recentList.map(f => `
              <li class="skyld-factuur">
                <span class="skyld-factuur-klant">${u.escape(f.klant)}</span>
                <span class="skyld-factuur-bedrag">${u.escape(f.bedrag)}</span>
                <span class="skyld-factuur-meta">${u.escape(f.status)}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${paidList.length ? `
          <ul class="skyld-factuur-list">
            ${paidList.map(f => `
              <li class="skyld-factuur skyld-factuur--paid">
                <span class="skyld-factuur-klant">${u.escape(f.klant)}</span>
                <span class="skyld-factuur-bedrag">${u.escape(f.bedrag)}</span>
                <span class="skyld-factuur-meta">${u.escape(f.status)}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </section>
    `;
  }

  // --- taken-briefing -----------------------------------------------------

  function takenHtml(fm, krant) {
    const u = U();
    const open = toInt(fm.tasks_open) || 0;
    const urgent = toInt(fm.tasks_urgent) || 0;
    const overdue = toInt(fm.invoices_overdue) || 0;

    // Briefing-prozaregel — opgebouwd uit sensor-data, niet uit krant.actie
    // (die is te dashboard-achtig). Krant.actie wordt als fallback gebruikt.
    const briefingRegels = [];
    if (overdue > 0) briefingRegels.push(`${overdue} ${overdue === 1 ? 'factuur' : 'facturen'} overdue.`);
    if (urgent > 0) briefingRegels.push(`${urgent} urgent ${urgent === 1 ? 'taak vraagt' : 'taken vragen'} menselijke beslissing.`);
    briefingRegels.push('Backlog inlopen vóór nieuwe import.');
    const briefing = briefingRegels.join(' ');

    // Hardcoded mockup-taken tot sensor list_tasks exposed.
    const taken = [
      { regel: 'Follow-up Hof en Hiem — overdue factuur',     deadline: 'vandaag', urgent: true },
      { regel: 'Bellen Streekwinkel BV',                      deadline: 'vandaag', urgent: true },
      { regel: 'Review enrichment-batch L4 → L5',             deadline: 'morgen',  urgent: false },
      { regel: 'Tenant Mollie status check',                  deadline: 'morgen',  urgent: false },
      { regel: 'Pause nieuwe imports tot backlog < 10k',      deadline: 'deze week', urgent: false },
    ];

    const vervallen = []; // sensor levert deze later; structuur staat

    return `
      <section class="skyld-taken">
        <div class="skyld-section-head">
          <h2 class="krant-h2">Vandaag</h2>
          <span class="krant-meta">${open} taken · ${urgent} urgent · ${vervallen.length} vervallen</span>
        </div>
        <hr class="krant-rule">

        <div class="krant-quote skyld-briefing">
          ${u.escape(briefing)}
        </div>

        <ul class="skyld-taken-list">
          ${taken.map(t => `
            <li class="skyld-taak${t.urgent ? ' is-urgent' : ''}">
              <span class="skyld-taak-regel">${u.escape(t.regel)}</span>
              <span class="skyld-taak-deadline">${u.escape(t.deadline)}</span>
            </li>
          `).join('')}
        </ul>

        ${vervallen.length ? `
          <div class="skyld-vervallen">
            <span class="krant-meta">Vervallen — was dit belangrijk?</span>
            <ul class="skyld-taken-list">
              ${vervallen.map(t => `
                <li class="skyld-taak is-vervallen">
                  <span class="skyld-taak-regel">${u.escape(t.regel)}</span>
                  <span class="skyld-taak-deadline">${u.escape(t.deadline)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </section>
    `;
  }

  // --- daemon-health strip ------------------------------------------------

  // Alleen tonen bij afwijking, of als één-regel-gezond-melding onderaan.
  function daemonStripHtml(fm) {
    const u = U();
    const errors = toInt(fm.enrichment_errors_24h);
    const lastE = hoursSince(fm.last_enriched_at);
    const cycle = toInt(fm.cycle_count);
    const regime = (fm.regime || '').toString();

    const afwijkend = (errors != null && errors > 0)
      || (lastE != null && lastE > 6)
      || regime === 'OPS_BLOCKED';

    if (!afwijkend) {
      return `
        <div class="skyld-daemon-strip is-healthy">
          <span class="krant-meta">Daemon gezond</span>
          <span class="skyld-daemon-fact">cycle ${cycle != null ? cycle : '—'}</span>
          <span class="skyld-daemon-fact">laatste run · ${fmtDate(fm.last_successful_at)} ${fmtTime(fm.last_successful_at)}</span>
          <span class="skyld-daemon-fact">errors 24u · ${errors != null ? errors : '—'}</span>
        </div>
      `;
    }

    return `
      <div class="skyld-daemon-strip is-alert">
        <span class="krant-tag krant-tag--neg">${u.escape(regime || 'AANDACHT')}</span>
        <span class="skyld-daemon-fact">errors 24u · ${errors != null ? errors : '—'}</span>
        <span class="skyld-daemon-fact">laatste verrijking · ${lastE != null ? lastE + ' uur geleden' : '—'}</span>
        <span class="skyld-daemon-fact">cycle ${cycle != null ? cycle : '—'}</span>
      </div>
    `;
  }

  // --- root render --------------------------------------------------------

  function render({ container, content, parseFrontmatter, parseKrant }) {
    if (!container) return;
    const u = U();
    const fm = (parseFrontmatter && parseFrontmatter(content)) || {};
    const krant = (parseKrant && parseKrant(content)) || {};

    const today = new Date();
    const datum = today.toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const briefing = buildBriefing(fm);

    container.innerHTML = `
      <div class="skyld-editorial">

        <div class="krant-nameplate">
          <h1 class="krant-nameplate-title">SKYLD</h1>
          <p class="krant-nameplate-sub">Operations — ${u.escape(datum)}</p>
        </div>

        <section class="skyld-headline">
          <h1 class="krant-h1 krant-dropcap">${u.escape(briefing.kop)}</h1>
          ${briefing.lead ? `<p class="krant-lead">${u.escape(briefing.lead)}</p>` : ''}
        </section>

        ${scorebordHtml(fm)}

        ${pipelineFunnelHtml(fm)}

        <div class="krant-grid-2-1 skyld-bottom-grid">
          <div>${takenHtml(fm, krant)}</div>
          <div>${facturenHtml(fm)}</div>
        </div>

        ${daemonStripHtml(fm)}

        <footer class="krant-katern-footer skyld-footer">
          <a href="#doc/sensors/tara/skyld.md">Sensor-detail →</a>
          <a href="https://app.skyld.nl" target="_blank" rel="noopener">CTRL-engine dashboard →</a>
        </footer>

      </div>
    `;
  }

  window.PulseSkyldEditorial = { render };
})();
