// Observer-event endpoint — append-only logger naar wiki/observer/clickstream.jsonl.
//
// POST { events: [{ katern, sensor?, action, ts }, ...] }
//
// Strikt observatie. Geen feedback-loop terug naar andere sensors of headline-
// rewriting. Output wordt eens daags gelezen door observer-residue prompt
// (PR #7) om één falsifieerbare stelling over Mathijs's eigen aandacht-
// patroon te produceren. Dat is alles.
//
// Rate-limiting is CLIENT-side (localStorage batcht 60s, flush stuurt batch).
// Server-side commit is één GitHub commit per POST. Bij N=1 user verwacht
// ~1 commit per 5 minuten actieve sessie. Acceptabel.
//
// Bij 404 op clickstream-bestand: endpoint maakt het bestand aan (eerste-
// event creation). Geen apart bootstrap-commit nodig.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Origin-check — weert drive-by browser-bots. Voor pulse N=1 op vaste
  // Vercel-domein is dit voldoende defense. Curl-aanvaller met gespoofde
  // Origin valt buiten dit threat-model en wordt door PAT-scoping (issue
  // op wiki) op blast-radius beperkt.
  const ALLOWED_ORIGINS = new Set([
    'https://pulse-nestfriesland.vercel.app',
  ]);
  // Preview deploys hebben URL-pattern: pulse-<hash>-nestfriesland-ctrls-projects.vercel.app
  const PREVIEW_RE = /^https:\/\/pulse-[a-z0-9]+-nestfriesland-ctrls-projects\.vercel\.app$/;
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const refOrigin = referer ? new URL(referer).origin : '';
  const ok = (o) => ALLOWED_ORIGINS.has(o) || PREVIEW_RE.test(o);
  if (!ok(origin) && !ok(refOrigin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }

  const PAT = process.env.GITHUB_PAT;
  if (!PAT) {
    return res.status(500).json({ error: 'GITHUB_PAT not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) { return res.status(400).json({ error: 'invalid JSON body' }); }
  }
  if (!body || !Array.isArray(body.events)) {
    return res.status(400).json({ error: 'expected { events: [...] }' });
  }

  // Validate per event. Drop invalid ones silently.
  const ALLOWED_ACTIONS = new Set(['view', 'click', 'dwell']);
  const valid = body.events.filter(e =>
    e && typeof e === 'object'
    && typeof e.katern === 'string' && e.katern.length && e.katern.length <= 32
    && typeof e.action === 'string' && ALLOWED_ACTIONS.has(e.action)
    && typeof e.ts === 'string' && e.ts.length && e.ts.length <= 32
    && (e.sensor == null || (typeof e.sensor === 'string' && e.sensor.length <= 64))
  );
  if (!valid.length) {
    return res.status(400).json({ error: 'no valid events in batch' });
  }
  if (valid.length > 500) {
    return res.status(400).json({ error: 'batch too large (max 500)' });
  }

  const lines = valid.map(e => JSON.stringify({
    katern: e.katern,
    sensor: e.sensor || null,
    action: e.action,
    ts: e.ts,
  })).join('\n') + '\n';

  const baseUrl = 'https://api.github.com/repos/nestfriesland-ctrl/wiki';
  const filePath = 'observer/clickstream.jsonl';

  try {
    // Read current file (may 404 — file doesn't exist yet).
    const getRes = await fetch(`${baseUrl}/contents/${filePath}?ref=main`, {
      headers: {
        'Authorization': `token ${PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'pulse-observer',
      },
    });

    let currentSha = null;
    let currentContent = '';
    if (getRes.ok) {
      const data = await getRes.json();
      currentSha = data.sha;
      if (data.content && data.encoding === 'base64') {
        currentContent = Buffer.from(data.content, 'base64').toString('utf-8');
      }
    } else if (getRes.status !== 404) {
      const err = await getRes.text();
      return res.status(getRes.status).json({
        error: `GET clickstream failed (${getRes.status}): ${err.slice(0, 160)}`,
      });
    }

    const newContent = currentContent + lines;
    const putBody = {
      message: `observer: append ${valid.length} event(s)`,
      content: Buffer.from(newContent, 'utf-8').toString('base64'),
      branch: 'main',
    };
    if (currentSha) putBody.sha = currentSha;

    const putRes = await fetch(`${baseUrl}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'pulse-observer',
      },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      return res.status(putRes.status).json({
        error: `commit failed (${putRes.status}): ${err.slice(0, 160)}`,
      });
    }

    return res.status(200).json({ committed: valid.length });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 200) });
  }
}
