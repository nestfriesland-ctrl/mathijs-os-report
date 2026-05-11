// SKYLD EDITORIAL — krant-voorpagina voor tara.puls.frl.
//
// Volgt de anatomie van mathijs.puls.frl: gecentreerde nameplate met dubbele
// lijn, mono pipeline-strip, asymmetrisch 2:1 grid (hoofdkolom links,
// sidebar rechts), footer. Witruimte en typografie scheiden de secties —
// geen cards, geen achtergrondkleuren, geen borders rondom blokken.
//
// Data: scalar counts uit sensor-frontmatter (regime, enrichment_*, invoices_*,
// tasks_*). De sensor exposed nog geen per-layer pipeline counts of factuur/
// taken-lijsten — ontbrekende velden tonen we niet, we vullen ze niet aan.

(function () {
  const U = () => window.PulseUtil;

  // --- helpers ----------------------------------------------------------

  function toInt(v) {
    if (v == null || v === '') return null;
    const n = parseInt(String(v).replace(/\D+/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function fmtNum(n) {
    return n == null ? '—' : n.toLocaleString('nl-NL');
  }

  function hoursSince(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return null;
    return Math.max(0, Math.round(ms / 3_600_000));
  }

  function regimeWord(regime) {
    if (regime === 'OPS_HEALTHY') return 'gezond';
    if (regime === 'OPS_ATTENTION') return 'attentie';
    if (regime === 'OPS_BLOCKED') return 'geblokkeerd';
    return regime ? regime.replace(/^OPS_/, '').toLowerCase() : null;
  }

  // --- headline + body proza --------------------------------------------

  // Eén leesbare openingszin op basis van regime + sensor-feiten. Geen
  // dashboard-frasering ("SKYLD piept"), wel menselijke krantenkop.
  function buildHeadline(fm) {
    const regime = (fm.regime || '').toString();
    const errors = toInt(fm.enrichment_errors_24h);
    const lastE = hoursSince(fm.last_enriched_at);
    const overdue = toInt(fm.invoices_overdue);
    const urgent = toInt(fm.tasks_urgent);

    if (regime === 'OPS_BLOCKED') {
      return 'Daemon staat. Backlog stapelt.';
    }
    if (errors > 0) {
      return `Errors in de pipeline. Daemon vraagt aandacht.`;
    }
    if (lastE != null && lastE >= 24) {
      return `Daemon stil sinds ${lastE} uur. Backlog stapelt.`;
    }
    if (regime === 'OPS_ATTENTION') {
      const last = urgent > 0 ? `${urgent} urgente taken in de wacht.` : `Pipeline onder druk.`;
      return `Daemon draait, mensen aan zet. ${last}`;
    }
    if (overdue > 0) {
      return `Daemon verwerkt. Facturen vragen handwerk.`;
    }
    return 'Daemon verwerkt. Backlog daalt.';
  }

  // Body-paragraaf onder de h1 — leesbare proza met .krant-dropcap. Vertaalt
  // de telde feiten naar een doorlopende zin (geen opsomming).
  function buildBody(fm) {
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const errors = toInt(fm.enrichment_errors_24h);
    const total = toInt(fm.contacts_total);
    const lastE = hoursSince(fm.last_enriched_at);

    const zinnen = [];

    if (pending != null && enriched != null && total != null) {
      const pct = total ? Math.round((enriched / total) * 100) : null;
      zinnen.push(
        `Van ${fmtNum(total)} contacts in de pool zijn er ${fmtNum(enriched)} verrijkt${pct != null ? ` (${pct}%)` : ''} ` +
        `en wachten er ${fmtNum(pending)} op verwerking.`
      );
    } else if (pending != null && enriched != null) {
      zinnen.push(`${fmtNum(enriched)} verrijkt, ${fmtNum(pending)} pending in de pipeline.`);
    } else if (pending != null) {
      zinnen.push(`${fmtNum(pending)} contacts wachten op verrijking.`);
    }

    if (errors === 0) {
      zinnen.push(lastE != null && lastE < 24
        ? `Errors in de laatste 24 uur: nul; de daemon draait foutloos.`
        : `Geen errors in het laatste venster.`);
    } else if (errors != null) {
      zinnen.push(`${errors} ${errors === 1 ? 'error' : 'errors'} in de laatste 24 uur — ruimte voor aandacht.`);
    }

    if (lastE != null) {
      zinnen.push(lastE === 0
        ? `Laatste verrijking: minder dan een uur geleden.`
        : `Laatste verrijking: ${lastE} uur geleden.`);
    }

    return zinnen.join(' ');
  }

  // --- pipeline-strip (mono one-liner onder nameplate) ------------------

  function pipelineStripHtml(fm) {
    const u = U();
    const regime = (fm.regime || '').toString();
    const word = regimeWord(regime);
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const errors = toInt(fm.enrichment_errors_24h);
    const invOpen = toInt(fm.invoices_open);
    const tasksOpen = toInt(fm.tasks_open);

    const parts = [];
    if (word) parts.push(`pipeline ${word}`);
    if (enriched != null) parts.push(`${fmtNum(enriched)} verrijkt`);
    if (pending != null) parts.push(`${fmtNum(pending)} pending`);
    if (errors != null) parts.push(`${errors} errors/24u`);
    if (invOpen != null) parts.push(`${invOpen} facturen`);
    if (tasksOpen != null) parts.push(`${tasksOpen} taken`);

    if (!parts.length) return '';
    return `<p class="skyld-strip">${u.escape(parts.join('  ·  '))}</p>`;
  }

  // --- inline scorebord (drie getallen als typografie, geen cards) ------

  function scorebordHtml(fm) {
    const u = U();
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const errors = toInt(fm.enrichment_errors_24h);

    const cells = [];
    if (enriched != null) cells.push({ num: fmtNum(enriched), label: 'verrijkt' });
    if (pending != null) cells.push({ num: fmtNum(pending), label: 'pending' });
    if (errors != null) cells.push({ num: String(errors), label: 'errors / 24u', neg: errors > 0 });
    if (!cells.length) return '';

    return `
      <div class="skyld-inline-scorebord">
        ${cells.map(c => `
          <div class="skyld-inline-cell">
            <span class="skyld-inline-num${c.neg ? ' is-neg' : ''}">${u.escape(c.num)}</span>
            <span class="krant-meta">${u.escape(c.label)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // --- pipeline-bars (horizontale bars, echte verhouding) ---------------
  //
  // Sensor levert geen per-layer (L0–L4) counts. Tot die in de frontmatter
  // staan, tonen we de echte enrichment-verhouding als twee bars. Niet
  // verzonnen subverdeling — wat er is wordt getoond.

  function pipelineHtml(fm) {
    const u = U();
    const enriched = toInt(fm.enrichment_done) || 0;
    const pending = toInt(fm.enrichment_pending) || 0;
    if (!enriched && !pending) return '';
    const max = Math.max(enriched, pending, 1);
    const rows = [
      { label: 'Verrijkt', count: enriched },
      { label: 'Pending',  count: pending },
    ];
    return `
      <section class="skyld-pipeline">
        <h2 class="krant-h2">Pipeline</h2>
        <hr class="krant-rule-light">
        <div class="skyld-pipeline-rows">
          ${rows.map(r => `
            <div class="skyld-pipeline-row${r.count === 0 ? ' is-empty' : ''}">
              <span class="skyld-pipeline-label">${u.escape(r.label)}</span>
              <div class="skyld-pipeline-bar-wrap">
                <div class="skyld-pipeline-bar" style="width:${Math.max(2, (r.count / max) * 100)}%;"></div>
              </div>
              <span class="skyld-pipeline-count">${fmtNum(r.count)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // --- sidebar: facturen + taken ---------------------------------------

  function sidebarSection(title, lines) {
    if (!lines.length) return '';
    return `
      <section class="skyld-side-section">
        <h2 class="krant-h2">${title}</h2>
        <hr class="krant-rule-light">
        ${lines.map(l => `
          <p class="skyld-side-line${l.neg ? ' is-neg' : ''}">
            <span class="skyld-side-label">${l.label}</span>
            <span class="skyld-side-num">${l.num}</span>
          </p>
        `).join('')}
      </section>
    `;
  }

  function sidebarHtml(fm) {
    const open = toInt(fm.invoices_open);
    const overdue = toInt(fm.invoices_overdue);
    const tasksOpen = toInt(fm.tasks_open);
    const urgent = toInt(fm.tasks_urgent);

    const facturenLines = [];
    if (open != null) facturenLines.push({ label: 'open', num: fmtNum(open) });
    if (overdue != null && overdue > 0) facturenLines.push({ label: 'overdue', num: fmtNum(overdue), neg: true });

    const takenLines = [];
    if (tasksOpen != null) takenLines.push({ label: 'open', num: fmtNum(tasksOpen) });
    if (urgent != null && urgent > 0) takenLines.push({ label: 'urgent', num: fmtNum(urgent), neg: true });

    return sidebarSection('Facturen', facturenLines) + sidebarSection('Taken', takenLines);
  }

  // --- root render ------------------------------------------------------

  function render({ container, content, parseFrontmatter }) {
    if (!container) return;
    const u = U();
    const fm = (parseFrontmatter && parseFrontmatter(content)) || {};

    const today = new Date();
    const datum = today.toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const kop = buildHeadline(fm);
    const body = buildBody(fm);

    container.innerHTML = `
      <div class="skyld-editorial">

        <header class="krant-nameplate">
          <h1 class="krant-nameplate-title">SKYLD</h1>
          <p class="krant-nameplate-sub">Operations — ${u.escape(datum)}</p>
        </header>

        ${pipelineStripHtml(fm)}

        <div class="krant-grid-2-1 skyld-krant-grid">
          <article class="skyld-hoofd">
            <h1 class="krant-h1">${u.escape(kop)}</h1>
            ${body ? `<p class="krant-body krant-dropcap">${u.escape(body)}</p>` : ''}
            ${scorebordHtml(fm)}
            ${pipelineHtml(fm)}
          </article>

          <aside class="skyld-sidebar">
            ${sidebarHtml(fm)}
          </aside>
        </div>

        <footer class="krant-katern-footer skyld-footer">
          <a href="https://app.skyld.nl" target="_blank" rel="noopener">ctrl-engine dashboard →</a>
        </footer>

      </div>
    `;
  }

  window.PulseSkyldEditorial = { render };
})();
