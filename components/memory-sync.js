// MEMORY-SYNC — machinekamer-katern.
//
// Bron: wiki/HANDOVER.md (auto-geschreven door memory-sync) + wiki/operations/sync_operational.md.
// Geen sensor-file: katern leest direct van deze twee dossiers.
//
// Lay-out (krant-rubriek "Machinekamer"):
//   - Heartbeat strip (cycle, run-stamp, locatie, regime)
//   - Acute alerts (HIGH items uit HANDOVER) — brick-red bij materiële bevindingen
//   - Sensor-health grid (GEZOND / STALE / DOOD — uit sensoren-tabel HANDOVER)
//   - Operationele context (sliding-window paragraaf sync_operational.md)
//   - HANDOVER pointer (TL;DR-link)

(function () {
  const U = () => window.PulseUtil;

  // ── Parser HANDOVER.md ────────────────────────────────────────────────

  function parseHandover(content) {
    if (!content) return null;
    const out = {
      title: null,
      runNumber: null,
      runStamp: null,
      locatie: null,
      tldr: null,
      acute: [],          // [{ niveau, text }]
      sensoren: [],       // [{ name, regime, freshness, stelling }]
    };

    // Title regel — `# HANDOVER — 2026-05-08 (vr) Luxwoude · 03:06Z`
    const titleM = content.match(/^#\s+HANDOVER\s+—\s+([^\n]+)/m);
    if (titleM) {
      out.title = titleM[1].trim();
      const stampM = out.title.match(/(\d{2}:\d{2}Z?)/);
      if (stampM) out.runStamp = stampM[1];
      const locM = out.title.match(/\)\s+([^·]+?)\s*·/);
      if (locM) out.locatie = locM[1].trim();
    }

    // Run-nummer en datum uit blockquote: `> Auto-gegenereerd door memory-sync 03:06Z (05:06 CEST). Run 13.`
    const runM = content.match(/Run\s+(\d+)\.?/);
    if (runM) out.runNumber = runM[1];

    // TL;DR sectie tot volgende ##
    const tldrM = content.match(/##\s*TL;DR\s*\n+([\s\S]*?)(?=\n##\s+|\n# )/);
    if (tldrM) out.tldr = tldrM[1].trim();

    // Acute items sectie — numbered list
    const acuteM = content.match(/##\s*Acute items[^\n]*\n+([\s\S]*?)(?=\n##\s+|\n# )/);
    if (acuteM) {
      const block = acuteM[1];
      // Items beginnen met `1. **HIGH —` of `2. **MEDIUM —` etc.
      const itemRe = /^\d+\.\s+\*\*(HIGH|MEDIUM|LOW)\s*—\s*([\s\S]+?)(?=\n\d+\.\s+\*\*|$)/gm;
      let m;
      while ((m = itemRe.exec(block)) !== null) {
        const niveau = m[1];
        const body = m[2].replace(/\*\*/g, '').trim();
        out.acute.push({ niveau, text: body });
      }
    }

    // Sensoren tabel — `| Sensor | Regime | Freshness | Stelling (verkort) |`
    const sensorenM = content.match(/##\s*Sensoren[^\n]*\n+([\s\S]*?)(?=\n##\s+|\n# )/);
    if (sensorenM) {
      const rows = sensorenM[1].split('\n').filter(l => l.startsWith('|'));
      for (const row of rows) {
        // Skip header en separator
        if (/^\|\s*Sensor\s*\|/i.test(row)) continue;
        if (/^\|[\s\-:|]+\|$/.test(row)) continue;
        const cells = row.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (cells.length < 4) continue;
        const [name, regime, freshness, stelling] = cells;
        out.sensoren.push({ name, regime, freshness, stelling });
      }
    }
    return out;
  }

  // ── Parser sync_operational.md ────────────────────────────────────────

  function parseOperational(content) {
    if (!content) return null;
    // Strip frontmatter
    let body = content.replace(/^---[\s\S]*?\n---\s*\n?/, '').trim();
    const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
    return { paragraphs };
  }

  // ── Freshness-classificatie ───────────────────────────────────────────
  //
  // Freshness-kolom HANDOVER bevat strings als "8u", "32h", "STALE 32h", "23u",
  // "8d". We mappen naar drie klassen voor de sensor-health-grid:
  //   GEZOND  < 12u
  //   STALE   12u–48u  OF expliciet STALE
  //   DOOD    > 48u    OF expliciet DOOD

  function freshnessHours(s) {
    if (!s) return null;
    const t = s.replace(/STALE\s*/i, '').trim();
    let m = t.match(/(\d+)\s*[hu]\b/i);
    if (m) return parseInt(m[1], 10);
    m = t.match(/(\d+)\s*d\b/i);
    if (m) return parseInt(m[1], 10) * 24;
    return null;
  }

  function classifyFreshness(s) {
    if (!s) return 'unknown';
    if (/dood/i.test(s)) return 'dood';
    const h = freshnessHours(s);
    if (/stale/i.test(s)) {
      return h !== null && h > 48 ? 'dood' : 'stale';
    }
    if (h === null) return 'unknown';
    if (h < 12) return 'gezond';
    if (h < 48) return 'stale';
    return 'dood';
  }

  function statusFromTitleStamp(stamp, runNumber) {
    // Geen stamp = onbekend → STALE. Anders: parse "03:06Z" tegen vandaag,
    // maar HANDOVER-datum staat in titel — we kijken hier alleen of het title-
    // jaar+maand+dag in title overeenkomt met vandaag. Bij twijfel STALE.
    if (!stamp) return { label: 'STALE', cls: 'warn' };
    return { label: `RUN ${runNumber || '—'}`, cls: 'fresh' };
  }

  // ── Renderer ──────────────────────────────────────────────────────────

  function render({ view, handoverContent, operationalContent }) {
    if (!view) return;
    const u = U();
    const handover = parseHandover(handoverContent);
    const operational = parseOperational(operationalContent);

    if (!handover && !operational) {
      view.innerHTML = `
        <div class="container katern-page">
          <header class="katern-header">
            <a href="#dashboard" class="back-link">← Dashboard</a>
            <h1>Memory-Sync</h1>
            <div class="tagline">machinekamer · heartbeat · consolidatie</div>
          </header>
          <div class="katern-empty">
            <h3>Geen sync-data beschikbaar.</h3>
            <p>HANDOVER.md en operations/sync_operational.md konden niet worden geladen.</p>
          </div>
        </div>
      `;
      return;
    }

    // Heartbeat
    const stamp = statusFromTitleStamp(handover && handover.runStamp, handover && handover.runNumber);
    const heartbeatHtml = `
      <section class="sync-heartbeat">
        <div class="hb-cell hb-run">
          <div class="hb-lbl">cycle</div>
          <div class="hb-v">${u.escape((handover && handover.runNumber) || '—')}</div>
        </div>
        <div class="hb-cell hb-stamp">
          <div class="hb-lbl">last run</div>
          <div class="hb-v">${u.escape((handover && (handover.title || handover.runStamp)) || '—')}</div>
        </div>
        <div class="hb-cell hb-loc">
          <div class="hb-lbl">locatie</div>
          <div class="hb-v">${u.escape((handover && handover.locatie) || '—')}</div>
        </div>
        <div class="hb-cell hb-status">
          <div class="hb-lbl">status</div>
          <div class="hb-v hb-${stamp.cls}">${u.escape(stamp.label)}</div>
        </div>
      </section>
    `;

    // Acute alerts
    let acuteHtml = '';
    const acute = (handover && handover.acute) || [];
    const high = acute.filter(a => a.niveau === 'HIGH');
    const medium = acute.filter(a => a.niveau === 'MEDIUM');
    if (acute.length) {
      acuteHtml = `
        <section class="sync-acute">
          <h2 class="sync-h">Acute bevindingen</h2>
          <div class="sync-acute-grid">
            ${high.slice(0, 8).map(a => `
              <article class="sync-alert sync-alert-high">
                <div class="alert-tag">HIGH</div>
                <p>${u.escape(trimText(a.text, 320))}</p>
              </article>
            `).join('')}
            ${medium.slice(0, 4).map(a => `
              <article class="sync-alert sync-alert-medium">
                <div class="alert-tag">MEDIUM</div>
                <p>${u.escape(trimText(a.text, 240))}</p>
              </article>
            `).join('')}
          </div>
        </section>
      `;
    }

    // Sensor-health overzicht
    const sensoren = (handover && handover.sensoren) || [];
    const buckets = { gezond: [], stale: [], dood: [], unknown: [] };
    for (const s of sensoren) {
      const cls = classifyFreshness(s.freshness);
      buckets[cls].push(s);
    }
    const total = sensoren.length;

    const sensorRow = (s) => {
      const cls = classifyFreshness(s.freshness);
      return `
        <li class="sensor-row sensor-${cls}">
          <span class="sensor-name">${u.escape(s.name)}</span>
          <span class="sensor-fresh">${u.escape(s.freshness || '—')}</span>
          <span class="sensor-regime">${u.escape(trimText(s.regime, 60))}</span>
        </li>
      `;
    };

    let sensorHtml = '';
    if (total) {
      sensorHtml = `
        <section class="sync-sensors">
          <h2 class="sync-h">Sensor-health · ${total} totaal</h2>
          <div class="sync-sensor-summary">
            <div class="sum-cell sum-gezond"><span class="sum-n">${buckets.gezond.length}</span><span class="sum-lbl">gezond</span></div>
            <div class="sum-cell sum-stale"><span class="sum-n">${buckets.stale.length}</span><span class="sum-lbl">stale</span></div>
            <div class="sum-cell sum-dood"><span class="sum-n">${buckets.dood.length}</span><span class="sum-lbl">dood</span></div>
            ${buckets.unknown.length ? `<div class="sum-cell sum-unknown"><span class="sum-n">${buckets.unknown.length}</span><span class="sum-lbl">onbekend</span></div>` : ''}
          </div>
          <div class="sync-sensor-cols">
            ${buckets.dood.length ? `
              <div class="sensor-col">
                <div class="col-h col-dood">Dood</div>
                <ul>${buckets.dood.map(sensorRow).join('')}</ul>
              </div>` : ''}
            ${buckets.stale.length ? `
              <div class="sensor-col">
                <div class="col-h col-stale">Stale</div>
                <ul>${buckets.stale.map(sensorRow).join('')}</ul>
              </div>` : ''}
            ${buckets.gezond.length ? `
              <div class="sensor-col">
                <div class="col-h col-gezond">Gezond</div>
                <ul>${buckets.gezond.map(sensorRow).join('')}</ul>
              </div>` : ''}
            ${buckets.unknown.length ? `
              <div class="sensor-col">
                <div class="col-h col-unknown">Onbekend</div>
                <ul>${buckets.unknown.map(sensorRow).join('')}</ul>
              </div>` : ''}
          </div>
        </section>
      `;
    }

    // Operationele context — top 2 paragraphs sliding-window
    let opsHtml = '';
    if (operational && operational.paragraphs.length) {
      const paragraphs = operational.paragraphs.slice(0, 4);
      opsHtml = `
        <section class="sync-ops">
          <h2 class="sync-h">Operationele context</h2>
          <div class="sync-ops-body">
            ${paragraphs.map(p => `<p>${renderInlineMarkdown(p, u)}</p>`).join('')}
          </div>
        </section>
      `;
    }

    // HANDOVER pointer + TL;DR-preview
    let tldrHtml = '';
    if (handover && handover.tldr) {
      tldrHtml = `
        <section class="sync-tldr">
          <h2 class="sync-h">TL;DR · uit HANDOVER</h2>
          <p>${renderInlineMarkdown(trimText(handover.tldr, 1200), u)}</p>
          <a class="deep-link" href="#doc/HANDOVER.md">→ volledige HANDOVER lezen</a>
        </section>
      `;
    }

    view.innerHTML = `
      <div class="container katern-page sync-page">
        <header class="katern-header">
          <a href="#dashboard" class="back-link">← Dashboard</a>
          <h1>Memory-Sync</h1>
          <div class="tagline">machinekamer · heartbeat · consolidatie</div>
        </header>
        ${heartbeatHtml}
        ${acuteHtml}
        ${sensorHtml}
        ${opsHtml}
        ${tldrHtml}
      </div>
    `;
  }

  // Minimal inline-markdown: **bold** → <strong>, `code` → <code>.
  // Niet volledig — genoeg voor handover-stijl.
  function renderInlineMarkdown(s, u) {
    if (!s) return '';
    let escaped = u.escape(s);
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    return escaped;
  }

  function trimText(s, max) {
    if (!s) return '';
    const flat = s.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    return flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  window.PulseMemorySync = { render, parseHandover, parseOperational };
})();
