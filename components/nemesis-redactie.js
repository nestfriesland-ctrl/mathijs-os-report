// NEMESIS-redactie — getrapte krant-sectie + drie diepte-routes.
// Parsed YAML-frontmatter uit wiki/nemesis/redactie.md (via js-yaml).
// Vier renderers, allen hergebruik van bestaande CSS-klassen:
//   renderVoorpagina  → spiegelt <section class="lead">
//   renderHoofdartikel → hergebruikt lead-template volledig
//   renderTribunaal    → spiegelt <section class="triple">
//   renderGraveyard    → één-koloms lijst van rouwadvertenties
//
// Geen nieuwe CSS — strikt hergebruik van: lead, triple, kicker, deck,
// byline, rule, meta-row, label, falsifier.

(function () {
  const U = () => window.PulseUtil;

  // Parse YAML-frontmatter via js-yaml (loaded via CDN). Returns object
  // with keys: voorpagina, hoofdartikel, tribunaal, graveyard, plus meta.
  function parseNemesisRedactie(content) {
    if (!content) return null;
    const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return null;
    const yamlText = m[1];
    let parsed;
    try {
      parsed = (window.jsyaml || window.jsYaml).load(yamlText);
    } catch (e) {
      console.error('[nemesis-redactie] YAML parse error:', e);
      return null;
    }
    return parsed || null;
  }

  function escape(s) {
    if (s === null || s === undefined) return '';
    const u = U();
    return u && u.escape ? u.escape(String(s)) : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // -- Voorpagina-tile (boven heat-index) -----------------------------------
  // Spiegelt lead-template: kicker + h1 + deck + body + sidebar met meta.
  function renderVoorpagina({ section, data }) {
    if (!section) return;
    if (!data || !data.voorpagina) {
      section.innerHTML = `<div class="loading">NEMESIS-redactie laadt…</div>`;
      return;
    }
    const v = data.voorpagina;
    const placeholder = data.placeholder === true;
    const kickerCls = placeholder ? 'dim' : 'compressie';
    const kickerText = placeholder
      ? `NEMESIS-redactie · placeholder`
      : `NEMESIS-redactie · ${v.kicker || 'tribunaal'}`;

    const modelLine = data.tribunaal && data.tribunaal.modellen
      ? data.tribunaal.modellen.map(m => `${m.id || ''}`).filter(Boolean).join(' · ')
      : '';
    const sidebar = `
      <aside>
        <div class="label">tribunaal</div>
        <h3>${escape(v.kicker || 'tribunaal')}</h3>
        ${modelLine ? `<p class="byline">${escape(modelLine)}</p>` : ''}
        ${data.last_updated ? `<div class="meta-row"><span>Pass</span><span>${escape(data.last_updated)}</span></div>` : ''}
        ${data.confidence ? `<div class="meta-row"><span>Confidence</span><span>${escape(data.confidence)}</span></div>` : ''}
        ${data.survival_counter !== undefined ? `<div class="meta-row"><span>Survival</span><span>${escape(data.survival_counter)}</span></div>` : ''}
        <div class="meta-row"><span>Diepte</span><span><a href="#nemesis/today">→ hoofdartikel</a></span></div>
        <div class="meta-row"><span></span><span><a href="#nemesis/tribunal">→ tribunaal</a></span></div>
        <div class="meta-row"><span></span><span><a href="#nemesis/graveyard">→ graveyard</a></span></div>
      </aside>
    `;

    section.innerHTML = `
      <div>
        <div class="kicker ${kickerCls}">${escape(kickerText)}</div>
        <h1>${escape(v.kop || 'NEMESIS-redactie')}</h1>
        ${v.lead ? `<p class="deck">${escape(v.lead)}</p>` : ''}
        <div class="lead-body">
          <p>${escape(v.lead || '')}</p>
        </div>
      </div>
      ${sidebar}
    `;
  }

  // -- Hoofdartikel-route (#nemesis/today) ---------------------------------
  function renderHoofdartikel({ container, data }) {
    if (!container) return;
    if (!data || !data.hoofdartikel) {
      container.innerHTML = `<section class="lead"><div class="loading">hoofdartikel laadt…</div></section>`;
      return;
    }
    const h = data.hoofdartikel;
    const placeholder = data.placeholder === true;
    const alineas = Array.isArray(h.alineas) ? h.alineas : [];
    const bodyHtml = alineas.map(p => `<p>${escape(p)}</p>`).join('\n');

    const modelList = data.tribunaal && data.tribunaal.modellen
      ? data.tribunaal.modellen.map(m =>
          `<div class="meta-row"><span>${escape(m.rol || '')}</span><span>${escape(m.id || '')}</span></div>`).join('')
      : '';

    container.innerHTML = `
      <section class="lead nemesis-lead" id="nemesis-today">
        <div>
          <div class="kicker ${placeholder ? 'dim' : ''}">NEMESIS · hoofdartikel${placeholder ? ' · placeholder' : ''}</div>
          <h1>${escape(h.kop || 'NEMESIS-hoofdartikel')}</h1>
          ${h.deck ? `<p class="deck">${escape(h.deck)}</p>` : ''}
          <div class="lead-body">
            ${bodyHtml}
            ${h.sluitstuk ? `<p><em>${escape(h.sluitstuk)}</em></p>` : ''}
          </div>
        </div>
        <aside>
          <div class="label">tribunaal-modellen</div>
          ${modelList}
          <div class="meta-row"><span>Methodologie</span><span>${escape((data.tribunaal && data.tribunaal.methodologie) || '—')}</span></div>
          <div class="meta-row"><span></span><span><a href="#nemesis/tribunal">→ debat lezen</a></span></div>
          <div class="meta-row"><span></span><span><a href="#dashboard">← terug</a></span></div>
        </aside>
      </section>
    `;
  }

  // -- Tribunaal-route (#nemesis/tribunal) ---------------------------------
  function modelArticleHtml(m, placeholder) {
    if (!m) return `<article><div class="kicker dim">geen data</div></article>`;
    return `
      <article>
        <div class="kicker ${placeholder ? 'dim' : ''}">${escape(m.rol || '')}</div>
        <h2>${escape(m.stelling || '—')}</h2>
        <div class="byline">${escape(m.id || '')}</div>
        <p>${escape(m.bewijs || '')}</p>
      </article>
    `;
  }

  function renderTribunaal({ container, data }) {
    if (!container) return;
    if (!data || !data.tribunaal) {
      container.innerHTML = `<section class="triple"><article><div class="kicker dim">tribunaal laadt…</div></article></section>`;
      return;
    }
    const t = data.tribunaal;
    const placeholder = data.placeholder === true;
    const modellen = Array.isArray(t.modellen) ? t.modellen : [];
    const articles = modellen.length
      ? modellen.map(m => modelArticleHtml(m, placeholder))
      : ['<article><div class="kicker dim">geen modellen</div></article>'];
    const articlesHtml = articles.join('\n<div class="rule"></div>\n');

    const disputesHtml = Array.isArray(t.disputes) && t.disputes.length
      ? t.disputes.map(d => `
          <article>
            <div class="kicker">dispuut</div>
            <h2>${escape(d.punt || '—')}</h2>
            <p><strong>Empiricus:</strong> ${escape(d.empiricus_positie || '—')}</p>
            <p><strong>Scepticus:</strong> ${escape(d.scepticus_positie || '—')}</p>
            <p><em>Resolutie:</em> ${escape(d.resolutie || '—')}</p>
          </article>
        `).join('\n<div class="rule"></div>\n')
      : '';

    const openHtml = Array.isArray(t.open) && t.open.length
      ? `
          <article>
            <div class="kicker">wat ter discussie staat</div>
            <ul>${t.open.map(o => `<li>${escape(o)}</li>`).join('')}</ul>
            <div class="byline">methodologie: ${escape(t.methodologie || '—')}</div>
          </article>
        `
      : '';

    container.innerHTML = `
      <section class="triple nemesis-tribunal" id="nemesis-tribunal">
        ${articlesHtml}
      </section>
      ${disputesHtml ? `<section class="triple">${disputesHtml}</section>` : ''}
      ${openHtml ? `<section class="triple">${openHtml}</section>` : ''}
      <section class="strip">
        <div class="byline">
          <a href="#nemesis/today">← hoofdartikel</a>
          &nbsp;·&nbsp;
          <a href="#nemesis/graveyard">→ graveyard</a>
          &nbsp;·&nbsp;
          <a href="#dashboard">← dashboard</a>
        </div>
      </section>
    `;
  }

  // -- Graveyard-route (#nemesis/graveyard) -------------------------------
  function renderGraveyard({ container, data }) {
    if (!container) return;
    const items = (data && Array.isArray(data.graveyard)) ? data.graveyard : [];
    const placeholder = data && data.placeholder === true;

    if (!items.length) {
      container.innerHTML = `
        <section class="lead nemesis-graveyard" id="nemesis-graveyard">
          <div>
            <div class="kicker ${placeholder ? 'dim' : ''}">NEMESIS · graveyard${placeholder ? ' · placeholder' : ''}</div>
            <h1>Geen gevallen theses deze cycle</h1>
            <p class="deck">Wanneer een thesis falsifieerd wordt, verschijnt hier een rouwadvertentie. Niet om te lachen — om te onthouden welke residue blijft.</p>
            <div class="lead-body">
              <p>Lege graveyard betekent: ofwel alle theses overleefden deze cycle, ofwel de tribunaal-pass heeft geen weerlegde stellingen geïdentificeerd. Beide zijn legitiem.</p>
            </div>
          </div>
          <aside>
            <div class="label">links</div>
            <div class="meta-row"><span></span><span><a href="#nemesis/today">← hoofdartikel</a></span></div>
            <div class="meta-row"><span></span><span><a href="#nemesis/tribunal">← tribunaal</a></span></div>
            <div class="meta-row"><span></span><span><a href="#dashboard">← dashboard</a></span></div>
          </aside>
        </section>
      `;
      return;
    }

    const obits = items.map(it => `
      <article>
        <div class="kicker">rouwadvertentie</div>
        <h2><em>${escape(it.thesis || '—')}</em></h2>
        <div class="byline">geboren ${escape(it.geboren || '?')} · gefalsifieerd ${escape(it.gefalsifieerd || '?')}</div>
        <p><strong>Methode:</strong> ${escape(it.methode || '—')}</p>
        <p><strong>Residue:</strong> ${escape(it.residue || '—')}</p>
        ${it.rouwadvertentie ? `<pre style="font-family:var(--serif);font-style:italic;white-space:pre-wrap;">${escape(it.rouwadvertentie)}</pre>` : ''}
      </article>
    `).join('\n<div class="rule"></div>\n');

    container.innerHTML = `
      <section class="triple nemesis-graveyard" id="nemesis-graveyard">
        ${obits}
      </section>
      <section class="strip">
        <div class="byline">
          <a href="#nemesis/today">← hoofdartikel</a>
          &nbsp;·&nbsp;
          <a href="#nemesis/tribunal">← tribunaal</a>
          &nbsp;·&nbsp;
          <a href="#dashboard">← dashboard</a>
        </div>
      </section>
    `;
  }

  window.PulseNemesisRedactie = {
    parse: parseNemesisRedactie,
    renderVoorpagina,
    renderHoofdartikel,
    renderTribunaal,
    renderGraveyard,
  };
})();
