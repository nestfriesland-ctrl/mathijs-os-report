// TARA EDITORIAL — krant-voorpagina + Lichaam katern voor tara.puls.frl.
//
// Identieke krant-grammar als Mathijs/SKYLD: Lora serif, IBM Plex Mono meta,
// cream papier (#F8F5EE), mosterd accent (#A87B2E), dubbele lijn-nameplate,
// dropcap, 62/38 asymmetrisch grid.
//
// Twee renderers:
//   renderVoorpagina  — nameplate "TARA" + hoofdverhaal + leads. Bron:
//                       sensors/tara/voorpagina.md (mag ontbreken — placeholder).
//   renderLichaam     — Lichaam-katern: protocol + cyclus secties. Bron:
//                       sensors/tara-protocol.md + sensors/tara-cyclus.md
//                       (beide mogen ontbreken — placeholder).

(function () {
  const U = () => window.PulseUtil;

  function esc(s) {
    if (s == null) return '';
    const u = U();
    return u && u.escape ? u.escape(String(s)) : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtDatum(d) {
    return d.toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  function editieNr(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = Math.floor((d - start) / 86400000) + 1;
    return `Nr. ${String(diff).padStart(3, '0')} · Jg. ${d.getFullYear() - 2024}`;
  }

  // Minimale frontmatter parser — als app-wide parser niet beschikbaar is.
  function parseFm(md) {
    const fm = {};
    const m = (md || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return fm;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.+)$/);
      if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
    return fm;
  }

  function stripFm(md) {
    return (md || '').replace(/^---[\s\S]*?\n---\s*\n?/, '');
  }

  // Eerste paragraaf uit body (na frontmatter, na headings) — voor dropcap.
  function firstParagraph(md) {
    const body = stripFm(md);
    const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (const p of paras) {
      if (p.startsWith('#') || p.startsWith('-') || p.startsWith('|')) continue;
      return p.replace(/\s+/g, ' ');
    }
    return '';
  }

  // ## Secties extractie — geeft { heading, body } reeks.
  function parseSections(md) {
    const body = stripFm(md);
    const out = [];
    const re = /(^|\n)##\s+([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      out.push({ heading: m[2].trim(), body: m[3].trim() });
    }
    return out;
  }

  // --- VOORPAGINA -------------------------------------------------------

  function voorpaginaPlaceholder(now) {
    return {
      kop: 'Het lichaam telt nog niet.',
      lead: 'Eerste cyclus wordt geregistreerd zodra de tara-voorpagina sensor live is.',
      proza: 'Deze voorpagina is de redactionele dispatch van het Tara-protocol — een krant over het lichaam, gelezen in cycli. Zodra sensors/tara/voorpagina.md geschreven wordt, komen hier hoofdverhaal, leads en cyclus-stand te staan.',
      leads: [
        { kicker: 'protocol', kop: 'Lichaam', meta: 'binnenkort', tekst: 'Het tara-protocol verschijnt zodra sensors/tara-protocol.md geschreven is.' },
        { kicker: 'cyclus', kop: 'Cyclus', meta: 'binnenkort', tekst: 'De huidige cyclus wordt gemeten in sensors/tara-cyclus.md — nog niet live.' },
        { kicker: 'ops', kop: 'SKYLD', meta: 'live', tekst: 'Operationeel overzicht van de daemon staat in het SKYLD-katern — zie de navigatie.' },
      ],
    };
  }

  function voorpaginaFromSensor(fm, body) {
    const kop = fm.headline || fm.kop || firstParagraph('## ' + body).split('.')[0] || 'Voorpagina';
    const lead = fm.lead || '';
    const proza = firstParagraph(body) || '';
    const sections = parseSections(body);
    const leads = sections.slice(0, 3).map(s => ({
      kicker: s.heading.toLowerCase().split(' ')[0],
      kop: s.heading,
      meta: '',
      tekst: s.body.split(/\n\s*\n/)[0].replace(/\s+/g, ' '),
    }));
    return { kop, lead, proza, leads };
  }

  function renderVoorpagina(opts) {
    const container = opts && opts.container;
    const content = (opts && opts.content) || '';
    if (!container) return;

    const now = new Date();
    const datum = fmtDatum(now);
    const editie = editieNr(now);
    const subtitle = (opts && opts.subtitle) || 'De krant die het lichaam in cycli leest';

    const fm = parseFm(content);
    const body = stripFm(content);
    const data = body.trim()
      ? voorpaginaFromSensor(fm, body)
      : voorpaginaPlaceholder(now);

    const leadsHtml = data.leads.map(l => `
      <article class="krant-side-item">
        <span class="krant-meta">${esc(l.kicker)} · ${esc(l.meta)}</span>
        <h3 class="krant-h2" style="font-size: 18px; margin: 0.25rem 0 0.5rem;">${esc(l.kop)}</h3>
        <p class="krant-body" style="font-size: 14px; line-height: 1.5;">${esc(l.tekst)}</p>
      </article>
    `).join('<hr class="krant-rule-light">');

    container.innerHTML = `
      <div class="tara-editorial">
        <header class="krant-nameplate">
          <h1 class="krant-nameplate-title">TARA</h1>
          <p class="krant-nameplate-sub">${esc(subtitle)}</p>
        </header>

        <p class="krant-pipeline-strip">${esc(editie)} · ${esc(datum)}</p>

        <header class="tara-headline" style="margin-bottom: 2rem;">
          <h2 class="krant-h1" style="font-size: 36px;">${esc(data.kop)}</h2>
          ${data.lead ? `<p class="krant-lead" style="margin-top: 0.75rem;">${esc(data.lead)}</p>` : ''}
        </header>

        <div class="krant-grid-62-38">
          <article class="tara-hoofd">
            ${data.proza ? `<p class="krant-body krant-dropcap">${esc(data.proza)}</p>` : ''}
          </article>

          <aside class="tara-sidebar">
            <h2 class="krant-side-head" style="font-family: var(--krant-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--krant-ink-muted); margin: 0 0 1rem;">LEADS</h2>
            <hr class="krant-rule-light">
            <div class="tara-leads">${leadsHtml}</div>
          </aside>
        </div>

        <footer class="krant-katern-footer">
          <span>Tara · krant van het lichaam · ${esc(datum)}</span>
        </footer>
      </div>
    `;
  }

  // --- LICHAAM-KATERN ---------------------------------------------------

  // --- Rich markdown rendering voor lichaam-katern ----------------------

  function mdToHtml(md) {
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(md, { gfm: true, breaks: false });
    }
    // Minimale fallback — alleen veilig escapen.
    return `<pre class="krant-body">${esc(md)}</pre>`;
  }

  // Detecteer of een tabel de dagtijdlijn-tabel is (kolom 1 = tijdstip).
  function isTimelineTable(table) {
    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return false;
    return /tijdstip/i.test(ths[0].textContent);
  }

  // Detecteer een fase-tabel (kolomkop "Fase" of "Phase").
  function isFaseTable(table) {
    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return false;
    return /^\s*fase\s*$/i.test(ths[0].textContent);
  }

  // Render een rij van de dagtijdlijn als horizontale tijdblok-card.
  function renderTimelineCards(table) {
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (!rows.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tara-timeline';
    for (const tr of rows) {
      const cells = Array.from(tr.cells).map(c => c.innerHTML.trim());
      if (cells.length < 3) continue;
      const block = document.createElement('article');
      block.className = 'tara-timeline-block';
      block.innerHTML = `
        <div class="tara-timeline-tijd">${cells[0]}</div>
        <div class="tara-timeline-body">
          <h4 class="tara-timeline-inname">${cells[1]}</h4>
          <p class="tara-timeline-functie">${cells[2]}</p>
        </div>
      `;
      wrap.appendChild(block);
    }
    return wrap;
  }

  // Kleur per fase (folliculair-groen, ovulatie-mosterd, luteaal-rood, menstruatie-blauw).
  function faseColor(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('foll')) return 'var(--krant-accent-pos, #3B6D11)';
    if (l.includes('ovul')) return 'var(--krant-accent)';
    if (l.includes('lute')) return 'var(--krant-accent-neg)';
    if (l.includes('menstr')) return '#3B5B7A';
    return 'var(--krant-ink-muted)';
  }

  // Post-process de marked-output: voeg krant-classes toe, herken speciale
  // secties (RED-S → brick-red border, Bronnen → mono small, Dagtijdlijn
  // tabel → visuele cards, Fase-tabel → 2-koloms vergelijking).
  function decorate(rootEl) {
    // Eerste paragraaf na de hoogste heading → dropcap.
    const firstP = rootEl.querySelector('h1 + p, h2 + p');
    if (firstP && firstP.textContent.length > 80) {
      firstP.classList.add('krant-body', 'krant-dropcap', 'tara-lead-para');
    }

    // Alle resterende paragrafen → krant-body.
    rootEl.querySelectorAll('p').forEach(p => {
      if (!p.classList.contains('krant-dropcap')) p.classList.add('krant-body');
    });

    // Tabellen → krant-table styling.
    rootEl.querySelectorAll('table').forEach(table => {
      table.classList.add('tara-md-table');
      if (isTimelineTable(table)) {
        const cards = renderTimelineCards(table);
        if (cards) table.parentNode.replaceChild(cards, table);
      } else if (isFaseTable(table)) {
        table.classList.add('tara-fase-table');
        // Color-code de fase-kolom.
        table.querySelectorAll('tbody tr').forEach(tr => {
          const first = tr.cells[0];
          if (first) {
            first.style.borderLeft = `3px solid ${faseColor(first.textContent)}`;
            first.style.fontWeight = '600';
          }
        });
      }
    });

    // Speciale secties op basis van heading-tekst.
    rootEl.querySelectorAll('h1, h2, h3').forEach(h => {
      const txt = h.textContent.trim();
      h.classList.add('krant-h2');
      // RED-S → wrap volgende blok in een rood-omrand kader.
      if (/RED-S/i.test(txt) || /alarmsignalen/i.test(txt)) {
        wrapSectionUntilNextHeading(h, 'tara-reds-block');
      }
      // Bronnen → small mono.
      if (/^(bronnen|sources|referenties)$/i.test(txt)) {
        wrapSectionUntilNextHeading(h, 'tara-bronnen-block');
      }
      // Fase headings (folliculair, luteaal, ovulatie, menstruatie) → kleur-strip.
      const lvl = parseInt(h.tagName.slice(1), 10);
      if (lvl >= 3 && /foll|lute|ovul|menstr/i.test(txt)) {
        h.style.borderLeft = `3px solid ${faseColor(txt)}`;
        h.style.paddingLeft = '0.6rem';
      }
    });
  }

  // Pak heading + alles tot volgende heading en wrap in een div met class.
  function wrapSectionUntilNextHeading(headingEl, cls) {
    const lvl = parseInt(headingEl.tagName.slice(1), 10);
    const parent = headingEl.parentNode;
    const wrap = document.createElement('section');
    wrap.className = cls;
    parent.insertBefore(wrap, headingEl);
    let node = headingEl;
    while (node) {
      const next = node.nextSibling;
      wrap.appendChild(node);
      if (!next) break;
      if (next.nodeType === 1 && /^H[1-6]$/.test(next.tagName)) {
        const nextLvl = parseInt(next.tagName.slice(1), 10);
        if (nextLvl <= lvl) break;
      }
      node = next;
    }
  }

  function lichaamPlaceholderSection(naam, pad) {
    return `
      <section class="tara-katern-section">
        <div class="krant-katern-head">
          <h2 class="krant-h2">${esc(naam)}</h2>
          <span class="krant-meta">binnenkort</span>
        </div>
        <hr class="krant-rule-light">
        <p class="krant-lead" style="color: var(--krant-ink-muted);">
          ${esc(naam)} wordt geregistreerd zodra ${esc(pad)} geschreven is.
        </p>
      </section>
    `;
  }

  function lichaamSensorSection(naam, content) {
    const fm = parseFm(content);
    const body = stripFm(content);
    const meta = fm.last_updated || fm.lastUpdated || fm.version || '';
    const rawHtml = mdToHtml(body);
    // Render in een DOM-container zodat we kunnen decoreren.
    const sec = document.createElement('section');
    sec.className = 'tara-katern-section';
    const head = document.createElement('div');
    head.className = 'krant-katern-head';
    head.innerHTML = `
      <h2 class="krant-h2">${esc(naam)}</h2>
      ${meta ? `<span class="krant-meta">${esc(meta)}</span>` : ''}
    `;
    sec.appendChild(head);
    const rule = document.createElement('hr');
    rule.className = 'krant-rule-light';
    sec.appendChild(rule);
    const body_el = document.createElement('div');
    body_el.className = 'tara-md-body';
    body_el.innerHTML = rawHtml;
    decorate(body_el);
    sec.appendChild(body_el);
    return sec.outerHTML;
  }

  function renderLichaam(opts) {
    const container = opts && opts.container;
    if (!container) return;
    const now = new Date();
    const datum = fmtDatum(now);
    const protocolContent = (opts && opts.protocolContent) || '';
    const cyclusContent = (opts && opts.cyclusContent) || '';

    const protocolHtml = protocolContent.trim()
      ? lichaamSensorSection('Protocol', protocolContent)
      : lichaamPlaceholderSection('Protocol', 'sensors/tara-protocol.md');

    const cyclusHtml = cyclusContent.trim()
      ? lichaamSensorSection('Cyclus', cyclusContent)
      : lichaamPlaceholderSection('Cyclus', 'sensors/tara-cyclus.md');

    container.innerHTML = `
      <div class="container katern-page skyld-katern-wrap tara-lichaam-wrap">
        <a href="#voorpagina" class="back-link skyld-back-link">← Voorpagina</a>
        <div class="tara-editorial tara-lichaam-editorial">
          <header class="krant-nameplate">
            <h1 class="krant-nameplate-title">Lichaam</h1>
            <p class="krant-nameplate-sub">Protocol &amp; Cyclus — ${esc(datum)}</p>
          </header>
          ${protocolHtml}
          ${cyclusHtml}
          <footer class="krant-katern-footer">
            <a href="#doc/sensors/tara-protocol.md">protocol-brondocument</a>
            <a href="#doc/sensors/tara-cyclus.md">cyclus-brondocument</a>
          </footer>
        </div>
      </div>
    `;
  }

  window.PulseTaraEditorial = { renderVoorpagina, renderLichaam };
})();
