// SKYLD EDITORIAL — krant-voorpagina voor tara.puls.frl.
//
// Volgt het goedgekeurde mockup: gecentreerde SKYLD-nameplate met dubbele
// onderlijn, mono pipeline-strip, 36px Lora headline + italic lead,
// asymmetrisch 62/38 grid (hoofdkolom met dropcap-body, scorebord, pipeline-
// bars, daemon-strip / sidebar met facturen + taken), mono footer.
//
// Data: scalar counts uit sensor-frontmatter en de ## Taken tabel uit de
// body. Ontbrekende velden tonen we als "—"; we vullen niks aan met
// mockup-data.

(function () {
  const U = () => window.PulseUtil;

  // --- helpers ----------------------------------------------------------

  function toInt(v) {
    if (v == null || v === '') return null;
    const n = parseInt(String(v).replace(/\D+/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function fmtNum(n) {
    return n == null ? '—' : Number(n).toLocaleString('nl-NL');
  }

  function fmtDatum(d) {
    return d.toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  function fmtZuluTime(iso) {
    if (!iso || iso === 'never') return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}z`;
  }

  function regimeWord(regime) {
    if (regime === 'OPS_HEALTHY') return 'HEALTHY';
    if (regime === 'OPS_ATTENTION') return 'ATTENTION';
    if (regime === 'OPS_BLOCKED') return 'BLOCKED';
    return regime ? regime.replace(/^OPS_/, '') : null;
  }

  function regimeLabelNl(regime) {
    if (regime === 'OPS_HEALTHY') return 'gezond';
    if (regime === 'OPS_ATTENTION') return 'attentie';
    if (regime === 'OPS_BLOCKED') return 'geblokkeerd';
    return null;
  }

  function regimeColor(regime) {
    if (regime === 'OPS_HEALTHY') return 'var(--krant-accent-pos, #3B6D11)';
    if (regime === 'OPS_BLOCKED') return 'var(--krant-accent-neg)';
    return 'var(--krant-accent)';
  }

  // --- headline + lead --------------------------------------------------

  function buildHeadline(fm) {
    const regime = (fm.regime || '').toString();
    const errors = toInt(fm.enrichment_errors_24h);
    const overdue = toInt(fm.invoices_overdue);
    const lastZ = fmtZuluTime(fm.last_enriched_at);

    if (regime === 'OPS_BLOCKED') return 'Daemon staat. Backlog stapelt.';
    if (errors && errors > 0) return 'Errors in de pipeline. Daemon vraagt aandacht.';
    if (regime === 'OPS_ATTENTION' && overdue > 0) {
      return `Daemon verwerkt weer. ${fmtNum(overdue)} facturen overdue.`;
    }
    if (regime === 'OPS_ATTENTION') return 'Daemon draait, mensen aan zet.';
    if (overdue && overdue > 0) return `Daemon verwerkt. ${fmtNum(overdue)} facturen wachten op handwerk.`;
    return lastZ ? `Daemon verwerkt. Pipeline gezond per ${lastZ}.` : 'Daemon verwerkt. Pipeline gezond.';
  }

  function buildLead(fm) {
    const enriched = toInt(fm.enrichment_done);
    const total = toInt(fm.contacts_total);
    const pending = toInt(fm.enrichment_pending);
    const urgent = toInt(fm.tasks_urgent);

    if (enriched != null && total != null) {
      const pct = total ? Math.round((enriched / total) * 100) : null;
      const tail = urgent != null && urgent > 0
        ? ` ${fmtNum(urgent)} urgente taken in de wacht.`
        : (pending != null ? ` ${fmtNum(pending)} contacts wachten op verrijking.` : '');
      return `${fmtNum(enriched)} van ${fmtNum(total)}${pct != null ? ` (${pct}%)` : ''} verrijkt.${tail}`;
    }
    if (enriched != null && pending != null) {
      return `${fmtNum(enriched)} verrijkt, ${fmtNum(pending)} pending in de pipeline.`;
    }
    return '';
  }

  function buildBody(fm) {
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const errors = toInt(fm.enrichment_errors_24h);
    const total = toInt(fm.contacts_total);
    const lastZ = fmtZuluTime(fm.last_enriched_at);

    const zinnen = [];
    if (total != null && enriched != null) {
      const pct = total ? Math.round((enriched / total) * 100) : null;
      zinnen.push(
        `Van ${fmtNum(total)} contacts in de SKYLD-pool zijn er ${fmtNum(enriched)} verrijkt` +
        (pct != null ? ` (${pct}%)` : '') +
        (pending != null ? ` en wachten er ${fmtNum(pending)} op verwerking.` : '.')
      );
    } else if (pending != null) {
      zinnen.push(`${fmtNum(pending)} contacts wachten op verrijking.`);
    }
    if (errors === 0) {
      zinnen.push('Geen errors in de laatste 24 uur — de daemon draait foutloos.');
    } else if (errors != null) {
      zinnen.push(`${fmtNum(errors)} ${errors === 1 ? 'error' : 'errors'} in de laatste 24 uur — ruimte voor aandacht.`);
    }
    if (lastZ) zinnen.push(`Laatste verrijking liep om ${lastZ}.`);
    return zinnen.join(' ');
  }

  // --- pipeline-strip ---------------------------------------------------

  function pipelineStripHtml(fm) {
    const u = U();
    const regime = (fm.regime || '').toString();
    const word = regimeWord(regime);
    const color = regimeColor(regime);

    const enriched = toInt(fm.enrichment_done);
    const invOpen = toInt(fm.invoices_open);
    const tasksOpen = toInt(fm.tasks_open);

    const parts = [];
    if (word) parts.push(`<span style="color:${color};font-weight:600">${u.escape(word)}</span>`);
    if (enriched != null) parts.push(`${u.escape(fmtNum(enriched))} verrijkt`);
    if (invOpen != null) parts.push(`${u.escape(fmtNum(invOpen))} facturen`);
    if (tasksOpen != null) parts.push(`${u.escape(fmtNum(tasksOpen))} taken`);
    if (!parts.length) return '';

    return `<p class="krant-pipeline-strip">ops ${parts.join('  ·  ')}</p>`;
  }

  // --- scorebord (3 cellen, vertikaal gescheiden) -----------------------

  function scorebordHtml(fm) {
    const u = U();
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    const errors = toInt(fm.enrichment_errors_24h);

    const cells = [
      { num: fmtNum(enriched), label: 'verrijkt' },
      { num: fmtNum(pending), label: 'pending' },
      { num: fmtNum(errors), label: 'errors / 24u', neg: (errors != null && errors > 0) },
    ];

    return `
      <div class="krant-scorebord">
        ${cells.map(c => `
          <div class="krant-scorebord-cell">
            <span class="krant-scorebord-num${c.neg ? ' is-neg' : ''}">${u.escape(c.num)}</span>
            <span class="krant-scorebord-label">${u.escape(c.label)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // --- pipeline-bars ----------------------------------------------------
  //
  // Sensor exposeert (nog) geen per-laag L0–L6 counts; we tonen de echte
  // verhouding uit de frontmatter (Verrijkt vs Pending) als horizontale
  // bars met mosterd-fill op grijs track. Geen verzonnen sub-verdeling.

  function pipelineBarsHtml(fm) {
    const u = U();
    const enriched = toInt(fm.enrichment_done);
    const pending = toInt(fm.enrichment_pending);
    if (enriched == null && pending == null) return '';

    const rows = [
      { label: 'Verrijkt', count: enriched },
      { label: 'Pending',  count: pending },
    ];
    const max = Math.max(...rows.map(r => r.count || 0), 1);

    return `
      <section class="krant-pipeline-section">
        ${rows.map(r => {
          const count = r.count == null ? null : r.count;
          const width = count == null ? 0 : Math.max(2, (count / max) * 100);
          return `
            <div class="krant-pipeline-row">
              <span class="krant-pipeline-row-label">${u.escape(r.label)}</span>
              <div class="krant-pipeline-row-track">
                <div class="krant-pipeline-row-fill" style="width:${width}%"></div>
              </div>
              <span class="krant-pipeline-row-count">${u.escape(fmtNum(count))}</span>
            </div>
          `;
        }).join('')}
      </section>
    `;
  }

  // --- daemon-strip (onderaan hoofdkolom) -------------------------------

  function daemonStripHtml(fm) {
    const u = U();
    const regime = (fm.regime || '').toString();
    const word = regimeLabelNl(regime);
    const enriched = toInt(fm.enrichment_done);
    const lastZ = fmtZuluTime(fm.last_enriched_at);

    const parts = [];
    if (word) parts.push(`daemon ${word}`);
    if (enriched != null) parts.push(`${fmtNum(enriched)} verwerkt`);
    if (lastZ) parts.push(`laatst actief ${lastZ}`);
    if (!parts.length) return '';

    const color = regime === 'OPS_HEALTHY'
      ? 'var(--krant-accent-pos, #3B6D11)'
      : regime === 'OPS_BLOCKED'
        ? 'var(--krant-accent-neg)'
        : 'var(--krant-accent)';

    return `<p class="krant-daemon-strip" style="color:${color}">${u.escape(parts.join(' · '))}</p>`;
  }

  // --- factuur-regels (markdown ## Facturen, indien aanwezig) -----------

  function parseFacturenSection(body) {
    if (!body) return [];
    const m = body.match(/##\s+Facturen\s*\n([\s\S]*?)(?:\n##\s|$)/);
    if (!m) return [];
    const rows = [];
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (!t.startsWith('|')) continue;
      const cells = t.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length < 2) continue;
      if (/^klant$/i.test(cells[0])) continue;
      if (/^[-:\s]+$/.test(cells[0])) continue;
      rows.push({
        klant: cells[0],
        bedrag: cells[1] || '',
        status: cells[2] || '',
        dagen: cells[3] || '',
      });
    }
    return rows;
  }

  function facturenSectionHtml(fm, body) {
    const u = U();
    const open = toInt(fm.invoices_open);
    const overdue = toInt(fm.invoices_overdue);
    const rows = parseFacturenSection(body);

    let inner = '';
    if (rows.length) {
      inner = rows.map(r => {
        const isOverdue = /overdue|vervallen/i.test(r.status) || (r.dagen && /^\d+/.test(r.dagen));
        const isPaid = /betaald/i.test(r.status);
        const cls = isOverdue ? ' is-neg' : (isPaid ? ' is-muted' : '');
        const metaParts = [r.bedrag, r.dagen || r.status].filter(Boolean);
        return `
          <div class="krant-side-item${cls}">
            <span class="krant-side-item-name">${u.escape(r.klant)}</span>
            <span class="krant-side-item-meta">${u.escape(metaParts.join(' · '))}</span>
          </div>
        `;
      }).join('');
    } else {
      const lines = [];
      if (open != null) lines.push({ label: 'open', num: fmtNum(open) });
      if (overdue != null) lines.push({ label: 'overdue', num: fmtNum(overdue), neg: overdue > 0 });
      if (!lines.length) {
        inner = `<p class="krant-side-empty">—</p>`;
      } else {
        inner = lines.map(l => `
          <div class="krant-side-item${l.neg ? ' is-neg' : ''}">
            <span class="krant-side-item-name">${u.escape(l.label)}</span>
            <span class="krant-side-item-meta">${u.escape(l.num)}</span>
          </div>
        `).join('');
      }
    }

    return `
      <section class="krant-side-section">
        <h2 class="krant-side-head">FACTUREN</h2>
        <hr class="krant-rule-light">
        <div class="krant-side-list">${inner}</div>
      </section>
    `;
  }

  // --- taken-regels (markdown ## Taken) ---------------------------------

  function parseTakenSection(body) {
    if (!body) return [];
    const m = body.match(/##\s+Taken\s*\n([\s\S]*?)(?:\n##\s|$)/);
    if (!m) return [];
    const rows = [];
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (!t.startsWith('|')) continue;
      const cells = t.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length < 4) continue;
      if (/^contact$/i.test(cells[0])) continue;
      if (/^[-:\s]+$/.test(cells[0])) continue;
      rows.push({
        contact: cells[0],
        company: cells[1] || '',
        type: cells[2] || '',
        priority: cells[3] || '',
        trigger: cells[4] || '',
      });
    }
    return rows;
  }

  function takenSectionHtml(fm, body) {
    const u = U();
    const taken = parseTakenSection(body);
    const open = toInt(fm.tasks_open);
    const urgent = toInt(fm.tasks_urgent);

    let inner;
    if (taken.length) {
      inner = taken.map(t => {
        const isUrgent = /urgent/i.test(t.priority);
        const meta = [t.company, t.type, t.trigger].filter(Boolean).join(' · ');
        return `
          <div class="krant-side-item${isUrgent ? ' is-neg' : ''}">
            <span class="krant-side-item-name">${u.escape(t.contact)}</span>
            <span class="krant-side-item-meta">${u.escape(meta)}</span>
          </div>
        `;
      }).join('');
    } else {
      const lines = [];
      if (open != null) lines.push({ label: 'open', num: fmtNum(open) });
      if (urgent != null) lines.push({ label: 'urgent', num: fmtNum(urgent), neg: urgent > 0 });
      inner = lines.length
        ? lines.map(l => `
            <div class="krant-side-item${l.neg ? ' is-neg' : ''}">
              <span class="krant-side-item-name">${u.escape(l.label)}</span>
              <span class="krant-side-item-meta">${u.escape(l.num)}</span>
            </div>
          `).join('')
        : `<p class="krant-side-empty">—</p>`;
    }

    const totaalParts = [];
    if (urgent != null) totaalParts.push(`${fmtNum(urgent)} urgent`);
    if (open != null && urgent != null) totaalParts.push(`${fmtNum(Math.max(0, open - urgent))} gepland`);
    else if (open != null) totaalParts.push(`${fmtNum(open)} open`);
    const totaalLine = totaalParts.length
      ? `<p class="krant-side-totalen">${u.escape(totaalParts.join(' · '))}</p>`
      : '';

    return `
      <section class="krant-side-section">
        <h2 class="krant-side-head">TAKEN</h2>
        <hr class="krant-rule-light">
        <div class="krant-side-list">${inner}</div>
        ${totaalLine}
      </section>
    `;
  }

  // --- placeholder-katernen (Tara multi-katern structuur) ---------------
  //
  // Tara heeft (nog) maar één echte data-bron: SKYLD. Maar het krant-gevoel
  // van mathijs.puls.frl vraagt om meerdere secties op de voorpagina. Daarom
  // rendert tara onder de SKYLD-editorial drie placeholder-katernen — pure
  // structuur, geen data. Worden gevuld zodra de bijbehorende sensors live
  // zijn (outreach-batches, voorraad-sensor, segment-tagging in NOF).
  //
  // Geen nieuwe CSS: bestaande .krant-* classes + inline border-top voor de
  // scheiding tussen katernen (zelfde patroon als mathijs-katernen).

  function placeholderKaternenHtml() {
    const sep = 'border-top: 1px solid var(--krant-ink); margin-top: 2rem; padding-top: 2rem;';
    const leadStyle = 'color: var(--krant-ink-muted);';
    const katernen = [
      {
        titel: 'Outreach',
        meta: 'binnenkort',
        lead: 'Sniper-batches, open rates, replies. Wordt gevuld zodra de eerste batch verstuurd is.',
      },
      {
        titel: 'Voorraad & Leveringen',
        meta: 'binnenkort',
        lead: 'Voorraadstand, lopende leveringen, wachtend op betaling. Wordt gevuld zodra de voorraadsensor live is.',
      },
      {
        titel: 'Pipeline Noordoost-Friesland',
        meta: 'zorg-segment',
        lead: 'Zorg-prospects in NOF — aantallen, scores, snipe-ready. Wordt gevuld na segment-tagging.',
      },
    ];
    return katernen.map(k => `
      <div class="krant-katern" style="${sep}">
        <div class="krant-katern-head">
          <h2 class="krant-h2">${k.titel}</h2>
          <span class="krant-meta">${k.meta}</span>
        </div>
        <hr class="krant-rule-light">
        <p class="krant-lead" style="${leadStyle}">
          ${k.lead}
        </p>
      </div>
    `).join('');
  }

  // --- footer -----------------------------------------------------------

  function footerHtml(fm) {
    const u = U();
    const cycle = toInt(fm.cycle_count);
    const lastAt = fm.last_attempted_at && fm.last_attempted_at !== 'never'
      ? fmtZuluTime(fm.last_attempted_at)
      : null;
    const parts = [];
    if (cycle != null) parts.push(`sensor cycle ${cycle}`);
    if (lastAt) parts.push(`dispatch ${lastAt}`);
    const right = parts.length ? `<span>${u.escape(parts.join(' · '))}</span>` : '';
    return `
      <footer class="krant-katern-footer skyld-footer">
        <a href="https://app.skyld.nl" target="_blank" rel="noopener">ctrl-engine dashboard →</a>
        ${right}
      </footer>
    `;
  }

  // --- root render ------------------------------------------------------

  function render(opts) {
    const container = opts && opts.container;
    const content = (opts && opts.content) || '';
    const parseFrontmatter = opts && opts.parseFrontmatter;
    if (!container) return;

    const u = U();
    const fm = (parseFrontmatter && parseFrontmatter(content)) || {};
    const bodyMd = (content || '').replace(/^---[\s\S]*?\n---\s*\n?/, '');

    const datum = fmtDatum(new Date());
    const kop = buildHeadline(fm);
    const lead = buildLead(fm);
    const proza = buildBody(fm);

    container.innerHTML = `
      <div class="skyld-editorial">

        <header class="krant-nameplate">
          <h1 class="krant-nameplate-title">SKYLD</h1>
          <p class="krant-nameplate-sub">Operations — ${u.escape(datum)}</p>
        </header>

        ${pipelineStripHtml(fm)}

        <header class="skyld-headline">
          <h2 class="krant-headline">${u.escape(kop)}</h2>
          ${lead ? `<p class="krant-lead">${u.escape(lead)}</p>` : ''}
        </header>

        <div class="krant-grid-62-38 skyld-krant-grid">
          <article class="skyld-hoofd">
            ${proza ? `<p class="krant-body krant-dropcap">${u.escape(proza)}</p>` : ''}
            ${scorebordHtml(fm)}
            ${pipelineBarsHtml(fm)}
            ${daemonStripHtml(fm)}
          </article>

          <aside class="skyld-sidebar">
            ${facturenSectionHtml(fm, bodyMd)}
            <hr class="krant-rule-light">
            ${takenSectionHtml(fm, bodyMd)}
          </aside>
        </div>

        ${placeholderKaternenHtml()}

        ${footerHtml(fm)}

      </div>
    `;
  }

  window.PulseSkyldEditorial = { render };
})();
