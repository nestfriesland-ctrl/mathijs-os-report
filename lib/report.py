"""
HTML report generator for mathijs-os v2.

Dark luxury theme. Mobile-first. Generates a single self-contained HTML file.
Design carried over from v1 dashboard.

Usage:
    from lib.report import Report
    r = Report()
    r.price(83244, change_pct=2.1)
    r.regime("MOMENTUM")
    r.signal("S1 CVD Divergence", "BULLISH", confidence=73, detail="spot↑ perp↓ 7d horizon")
    r.metric("Funding", "+0.012%", color="green")
    r.note("Absorption detected on 1h. Wait for 3d+ confirmation.")
    html = r.render()
"""
from __future__ import annotations

import datetime

# --- CSS (dark luxury, inherited from v1) ---

_CSS = """
:root{
  --bg:#0a0c10;--sf:#12161e;--sf2:#181d28;--sf3:#1e2433;
  --brd:#262d3d;--tx:#e4e7ec;--tx2:#b0b7c5;--txd:#636d80;
  --grn:#34d399;--grn-bg:rgba(52,211,153,.08);
  --red:#f87171;--red-bg:rgba(248,113,113,.08);
  --amb:#fbbf24;--amb-bg:rgba(251,191,36,.08);
  --blu:#60a5fa;--blu-bg:rgba(96,165,250,.06);
  --m:'SF Mono','Fira Code','JetBrains Mono',monospace;
  --s:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--tx);font-family:var(--s);
  line-height:1.55;padding:16px 14px 40px;max-width:540px;margin:0 auto;
  -webkit-font-smoothing:antialiased}
.hdr{padding:0 0 20px;border-bottom:1px solid var(--brd);margin-bottom:20px}
.hdr-l{font-size:.68rem;font-weight:600;color:var(--txd);letter-spacing:.12em;text-transform:uppercase}
.hdr-p{font-size:2.2rem;font-weight:700;font-family:var(--m);letter-spacing:-.03em;margin:4px 0 2px}
.hdr-m{font-size:.74rem;color:var(--txd)}
.c{background:var(--sf);border:1px solid var(--brd);border-radius:12px;padding:16px;margin-bottom:14px}
.ct{margin-bottom:12px}
.ct h3{font-size:.68rem;font-weight:600;color:var(--txd);letter-spacing:.1em;text-transform:uppercase}
.rb{display:inline-block;font-family:var(--m);font-size:.78rem;font-weight:700;
  letter-spacing:.06em;padding:5px 14px;border-radius:6px;margin-top:6px}
.r-MOMENTUM{background:#0d3320;color:#34d399;border:1px solid #166534}
.r-ACCUMULATIE{background:#0c2341;color:#60a5fa;border:1px solid #1e3a5f}
.r-DISTRIBUTIE{background:#431a04;color:#fb923c;border:1px solid #7c2d12}
.r-CAPITULATIE{background:#450a0a;color:#f87171;border:1px solid #7f1d1d}
.r-CHOP{background:#362107;color:#fbbf24;border:1px solid #713f12}
.r-UNKNOWN{background:#1a1d24;color:#636d80;border:1px solid var(--brd)}
.sig{display:flex;align-items:center;justify-content:space-between;
  padding:10px 12px;background:var(--sf2);border-radius:8px;margin-bottom:6px}
.sig-name{font-size:.78rem;color:var(--tx2)}
.sig-badge{font-family:var(--m);font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:4px}
.sig-bull{background:var(--grn-bg);color:var(--grn)}
.sig-bear{background:var(--red-bg);color:var(--red)}
.sig-neutral{background:var(--amb-bg);color:var(--amb)}
.sig-detail{font-size:.68rem;color:var(--txd);margin-top:2px}
.mr{display:flex;align-items:center;justify-content:space-between;
  padding:10px 12px;background:var(--sf2);border-radius:8px;margin-bottom:6px}
.mk{font-size:.66rem;color:var(--txd);text-transform:uppercase;letter-spacing:.04em}
.mv{font-family:var(--m);font-size:1.05rem;font-weight:600}
.note{background:var(--sf2);border-left:3px solid var(--amb);padding:12px 14px;
  border-radius:0 8px 8px 0;font-size:.8rem;line-height:1.6;color:var(--tx2);margin-bottom:10px}
.ft{text-align:center;padding:24px 0;font-size:.66rem;color:var(--txd)}
"""


class Report:
    """Builds an HTML report section by section."""

    def __init__(self, title: str = "MATHIJS-OS"):
        self._title = title
        self._price_val: float | None = None
        self._price_change: float | None = None
        self._regime_val: str | None = None
        self._signals: list[dict] = []
        self._metrics: list[dict] = []
        self._notes: list[str] = []
        self._ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=1)))

    def price(self, value: float, change_pct: float | None = None):
        self._price_val = value
        self._price_change = change_pct
        return self

    def regime(self, name: str):
        self._regime_val = name.upper()
        return self

    def signal(self, name: str, direction: str, confidence: int | None = None, detail: str = ""):
        self._signals.append({
            "name": name,
            "direction": direction.upper(),
            "confidence": confidence,
            "detail": detail,
        })
        return self

    def metric(self, label: str, value: str, color: str | None = None):
        self._metrics.append({"label": label, "value": value, "color": color})
        return self

    def note(self, text: str):
        self._notes.append(text)
        return self

    def render(self) -> str:
        parts = [self._html_head(), self._html_header()]

        if self._regime_val:
            parts.append(self._html_regime())

        if self._signals:
            parts.append(self._html_signals())

        if self._metrics:
            parts.append(self._html_metrics())

        for n in self._notes:
            parts.append(f'<div class="note">{_esc(n)}</div>')

        parts.append(self._html_footer())
        return "\n".join(parts)

    def render_tg(self) -> str:
        """Render a compact Telegram HTML message (not a full page)."""
        lines = []
        if self._price_val:
            chg = f" ({self._price_change:+.1f}%)" if self._price_change else ""
            lines.append(f"<b>BTC ${self._price_val:,.0f}</b>{chg}")
        if self._regime_val:
            lines.append(f"Regime: <code>{self._regime_val}</code>")
        for s in self._signals:
            icon = "🟢" if s["direction"] == "BULLISH" else "🔴" if s["direction"] == "BEARISH" else "🟡"
            conf = f" ({s['confidence']}%)" if s.get("confidence") else ""
            lines.append(f"{icon} {s['name']}: {s['direction']}{conf}")
            if s["detail"]:
                lines.append(f"   <i>{s['detail']}</i>")
        for m in self._metrics:
            lines.append(f"{m['label']}: <code>{m['value']}</code>")
        for n in self._notes:
            lines.append(f"\n💡 {n}")
        ts = self._ts.strftime("%d %b %Y %H:%M CET")
        lines.append(f"\n<i>{ts}</i>")
        return "\n".join(lines)

    # --- private renderers ---

    def _html_head(self) -> str:
        return (
            '<!DOCTYPE html>\n<html lang="nl"><head><meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<meta name="robots" content="noindex,nofollow">\n'
            f'<title>{self._title}</title>\n'
            f'<style>{_CSS}</style></head><body>'
        )

    def _html_header(self) -> str:
        price_str = f"${self._price_val:,.0f}" if self._price_val else "—"
        ts = self._ts.strftime("%A %d %B %Y · %H:%M CET")
        chg = ""
        if self._price_change is not None:
            color = "var(--grn)" if self._price_change >= 0 else "var(--red)"
            chg = f' <span style="font-size:1rem;color:{color}">{self._price_change:+.1f}%</span>'
        return (
            f'<div class="hdr">'
            f'<div class="hdr-l">{self._title} · Report</div>'
            f'<div class="hdr-p">{price_str}{chg}</div>'
            f'<div class="hdr-m">{ts}</div></div>'
        )

    def _html_regime(self) -> str:
        r = self._regime_val or "UNKNOWN"
        return (
            f'<div class="c"><div class="ct"><h3>Regime</h3></div>'
            f'<span class="rb r-{r}">{r}</span></div>'
        )

    def _html_signals(self) -> str:
        rows = []
        for s in self._signals:
            d = s["direction"]
            cls = "sig-bull" if d == "BULLISH" else "sig-bear" if d == "BEARISH" else "sig-neutral"
            conf = f" {s['confidence']}%" if s.get("confidence") else ""
            detail = f'<div class="sig-detail">{_esc(s["detail"])}</div>' if s["detail"] else ""
            rows.append(
                f'<div class="sig"><div><div class="sig-name">{_esc(s["name"])}</div>'
                f'{detail}</div>'
                f'<span class="sig-badge {cls}">{d}{conf}</span></div>'
            )
        return f'<div class="c"><div class="ct"><h3>Signals</h3></div>{"".join(rows)}</div>'

    def _html_metrics(self) -> str:
        rows = []
        for m in self._metrics:
            style = ""
            if m["color"] == "green":
                style = ' style="color:var(--grn)"'
            elif m["color"] == "red":
                style = ' style="color:var(--red)"'
            rows.append(
                f'<div class="mr"><div class="mk">{_esc(m["label"])}</div>'
                f'<div class="mv"{style}>{_esc(m["value"])}</div></div>'
            )
        return f'<div class="c"><div class="ct"><h3>Metrics</h3></div>{"".join(rows)}</div>'

    def _html_footer(self) -> str:
        return (
            f'<div class="ft">mathijs-os v2 · Cowork-native · '
            f'{self._ts.strftime("%H:%M CET")}</div></body></html>'
        )


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
