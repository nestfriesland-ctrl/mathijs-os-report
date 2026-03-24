# mathijs-os v2 — Systeem Documentatie

Cowork-native trading intelligence. Geen lokale daemon, geen Qwen.
Claude is het brein. Hyblock is de data. Telegram is de interface.

## Architectuur

```
Cowork Skills (brein)
  ├── hyblock skill      → research cycles, signal backtesting
  ├── scheduled tasks    → polling, alert push
  └── on-demand          → "hoe staat BTC", "push report"

mathijs-os-report repo (dit)
  ├── index.html         → live dashboard (Vercel auto-deploy)
  ├── lib/
  │   ├── telegram.py    → TG push (bot API, zero deps)
  │   ├── hyblock.py     → Hyblock API client (zero deps)
  │   └── report.py      → HTML report generator
  ├── config.env.example → credentials template
  └── docs/SYSTEM.md     → dit document

Flow:
1. Scheduled task (Cowork, elke 15 min)
   → pull Hyblock data via lib/hyblock.py
   → check signals (logic defined in hyblock skill)
   → if signal fires: push via lib/telegram.py
   → regenerate index.html via lib/report.py
   → git push → Vercel auto-deploy

2. Research cycle (on-demand via hyblock skill)
   → backtest signal hypotheses
   → rewrite hyblock SKILL.md with measured results
   → push to hyblock-skill repo

3. Ad-hoc (Cowork chat)
   → "hoe staat BTC" → live scan + TG push
   → "push report" → generate + push + deploy
```

## Credentials

Zie `config.env.example`. In Cowork worden deze als env vars gezet.

| Var | Wat | Rotatie |
|-----|-----|---------|
| TG_BOT_TOKEN | Telegram @mathijsdeluxebot | Permanent |
| TG_CHAT_ID | Mathijs's private chat | Auto-detect |
| HB_CLIENT_ID | Hyblock OAuth | Permanent |
| HB_CLIENT_SECRET | Hyblock OAuth | Permanent |
| HB_API_KEY | Hyblock x-api-key | Permanent |

## Signal Logic

Signalen worden gedefinieerd en getest in de hyblock skill.
Na PROVEN status worden ze hier als alerting rules geïmplementeerd.

### Huidige signals (na cycle 1)

| Signal | Status | Horizon | WR | Avg | Sharpe |
|--------|--------|---------|----|----|--------|
| S1 CVD div (unfiltered) | REFINE | 7d | 73.2% | +1.77% | 0.44 |
| S1 CVD div (strong) | REFINE | 7d | 80.3% | +2.45% | 0.66 |
| S1 CVD div (intraday) | ANTI-PATTERN | 1h-24h | <50% | neg | neg |
| S2 Retail long% | UNTESTED | — | — | — | — |
| S3 Bid-ask ratio | UNTESTED | — | — | — | — |
| S4 Funding reversion | UNTESTED | — | — | — | — |
| S5 OI cluster | UNTESTED | — | — | — | — |

## Verwijzingen

- hyblock skill: `nestfriesland-ctrl/hyblock-skill` (SKILL.md = levend document)
- Dashboard: mathijs-os-report.vercel.app
- Telegram bot: @mathijsdeluxebot
- Archive v1: branch `archive/v1` in dit repo
