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

  function lichaamPlaceholderSection(naam, pad) {
    return `
      <section class="krant-katern" style="border-top: 1px solid var(--krant-ink); margin-top: 2rem; padding-top: 2rem; max-width: none;">
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
    const proza = firstParagraph(body);
    const sections = parseSections(body);
    const sectionsHtml = sections.slice(0, 4).map(s => `
      <div style="margin-top: 1.25rem;">
        <h3 class="krant-h2" style="font-size: 18px;">${esc(s.heading)}</h3>
        <p class="krant-body" style="font-size: 14px;">${esc(s.body.split(/\n\s*\n/)[0].replace(/\s+/g, ' '))}</p>
      </div>
    `).join('');
    const meta = fm.last_updated || fm.lastUpdated || fm.cycle || '';
    return `
      <section class="krant-katern" style="border-top: 1px solid var(--krant-ink); margin-top: 2rem; padding-top: 2rem; max-width: none;">
        <div class="krant-katern-head">
          <h2 class="krant-h2">${esc(naam)}</h2>
          ${meta ? `<span class="krant-meta">${esc(meta)}</span>` : ''}
        </div>
        <hr class="krant-rule-light">
        ${proza ? `<p class="krant-body krant-dropcap">${esc(proza)}</p>` : ''}
        ${sectionsHtml}
      </section>
    `;
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
      <div class="container katern-page skyld-katern-wrap">
        <a href="#voorpagina" class="back-link skyld-back-link">← Voorpagina</a>
        <div class="tara-editorial">
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
