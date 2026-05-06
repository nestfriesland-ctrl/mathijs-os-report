// STRIP — kleine sensor-status items als footer-strip (krant-stijl).
// Per-sensor compacte regel: NAME + één kerngetal/status. Sensor-specifieke
// extractie zodat de strip leesbaar blijft (geen ruwe-Stelling-truncatie).

(function () {
  const U = () => window.PulseUtil;

  function fmtItem(label, value, cls) {
    const u = U();
    const valueCls = cls ? ` ${cls}` : '';
    return `
      <div class="item">
        <div class="name">${u.escape(label)}</div>
        <div class="v${valueCls}">${u.escape(value)}</div>
      </div>
    `;
  }

  // --- per-sensor extractors -------------------------------------------

  function extractEnrichment(content) {
    if (!content) return { value: '—', cls: 'dim' };
    // SKYLD row from the per-tenant table: "| SKYLD | 5490 | +144 | 0 | 9m geleden | 20/20 |"
    const m = content.match(/\|\s*SKYLD\s*\|\s*\d+\s*\|\s*([+\-]?\d+)\s*\|\s*\d+\s*\|\s*([^|]+?)\s*\|/);
    if (m) {
      const delta = parseInt(m[1], 10);
      const lastWhen = m[2].trim();
      const cls = delta > 0 ? 'bull' : delta === 0 ? 'dim' : 'bear';
      return { value: `SKYLD Δ${m[1]} · ${lastWhen}`, cls };
    }
    // Fallback to a generic regime line.
    const reg = content.match(/regime:\s*([^\n]+)/i);
    return { value: reg ? reg[1].trim().slice(0, 40) : 'FLOWING', cls: 'bull' };
  }

  function extractInfra(content) {
    if (!content) return { value: '—', cls: 'dim' };
    const m = content.match(/SITES:\s*([^\n]+)/);
    if (m) {
      const parts = m[1].split('|');
      const ok = parts.filter(p => /\b2\d{2}\b/.test(p)).length;
      const total = parts.length;
      const cls = ok === total ? 'bull' : ok < total - 1 ? 'bear' : 'warn';
      return { value: `SITES ${ok}/${total}`, cls };
    }
    const bridge = content.match(/M4-BRIDGE:\s*([^\n]+)/);
    return bridge ? { value: bridge[1].trim().slice(0, 28), cls: '' } : { value: 'LIVE', cls: 'bull' };
  }

  function extractNestSeo(content) {
    if (!content) return { value: '—', cls: 'dim' };
    const dr = content.match(/DR:\s*([0-9.]+)/);
    const ref = content.match(/Ref domains:\s*(\d+)/i);
    const parts = [];
    if (dr) parts.push(`DR ${dr[1]}`);
    if (ref) parts.push(`${ref[1]} refs`);
    return { value: parts.join(' · ') || '—', cls: '' };
  }

  function extractBacktest(content) {
    if (!content) return { value: '—', cls: 'dim' };
    // "REFUTED-CARRY N=66" pattern
    const m = content.match(/(PROVEN|REFUTED|INCONCLUSIVE|NO_EDGE)[A-Z\-]*\s*N=(\d+)/);
    if (m) {
      const cls = m[1] === 'PROVEN' ? 'bull' : m[1] === 'REFUTED' ? 'bear' : 'warn';
      return { value: `${m[1]} N=${m[2]}`, cls };
    }
    const proven = content.match(/proven:\s*(\d+)/);
    const refuted = content.match(/refuted:\s*(\d+)/);
    if (proven && refuted) return { value: `proven ${proven[1]} · refuted ${refuted[1]}`, cls: '' };
    return { value: '—', cls: 'dim' };
  }

  function extractMachinekamer(content) {
    if (!content) return { value: '—', cls: 'dim' };
    const m = content.match(/(?:^|\n)>\s*regime:\s*([^\n]+)/i)
      || content.match(/^regime:\s*([^\n]+)/im);
    return m ? { value: m[1].trim().slice(0, 40), cls: '' } : { value: 'NOMINAL', cls: '' };
  }

  function extractGeneric(name, content) {
    if (!content) return { value: '—', cls: 'dim' };
    const m = content.match(/(?:^|\n)>\s*regime:\s*([^\n]+)/i)
      || content.match(/^regime:\s*([^\n]+)/im);
    if (m) return { value: m[1].trim().slice(0, 40), cls: '' };
    return { value: name.toUpperCase(), cls: 'dim' };
  }

  const EXTRACTORS = {
    'enrichment': extractEnrichment,
    'infra': extractInfra,
    'nest-seo': extractNestSeo,
    'backtest': extractBacktest,
    'machinekamer': extractMachinekamer,
  };

  function render({ section, slots }) {
    if (!section) return;
    if (!slots || !slots.length) {
      section.innerHTML = '';
      return;
    }
    const html = slots.map(s => {
      const ext = EXTRACTORS[s.name] || ((c) => extractGeneric(s.name, c));
      const { value, cls } = ext(s.content);
      const label = s.label || s.name;
      return fmtItem(label, value, cls);
    }).join('');
    section.innerHTML = html;
  }

  window.PulseStrip = { render };
})();
