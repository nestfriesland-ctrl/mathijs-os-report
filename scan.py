#!/usr/bin/env python3
"""
mathijs-os v2 — Hyblock market scanner.
Pulls live data, computes signals, detects changes, pushes alerts.
"""
import sys
import os
import json
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.hyblock import HB
from lib.telegram import TG
from lib.report import Report

LAST_SCAN_PATH = "/tmp/hyblock_last_scan_v2.json"
HEARTBEAT_PATH = "/tmp/hyblock_last_heartbeat_v2.json"


def load_previous():
    if os.path.exists(LAST_SCAN_PATH):
        with open(LAST_SCAN_PATH) as f:
            return json.load(f)
    return None


def save_current(state):
    with open(LAST_SCAN_PATH, "w") as f:
        json.dump(state, f, indent=2)


def safe_get(func, label, **kwargs):
    try:
        data = func(**kwargs)
        if not data:
            print(f"  [WARN] {label}: empty response")
            return []
        print(f"  [OK] {label}: {len(data)} rows")
        return data
    except Exception as e:
        print(f"  [ERR] {label}: {e}")
        return []


def compute_signals(klines, cvd_spot, cvd_perp, funding_data, retail_data, bid_ask_data):
    signals = {}

    # --- Price ---
    price_now = None
    price_1h_chg = None
    price_24h_chg = None
    if klines and len(klines) >= 2:
        last = klines[-1]
        price_now = float(last.get("close", last.get("c", 0)))
        prev = klines[-2]
        price_prev = float(prev.get("close", prev.get("c", 0)))
        if price_prev > 0:
            price_1h_chg = ((price_now - price_prev) / price_prev) * 100
        if len(klines) >= 25:
            p24 = klines[-25]
            price_24 = float(p24.get("close", p24.get("c", 0)))
            if price_24 > 0:
                price_24h_chg = ((price_now - price_24) / price_24) * 100

    signals["price"] = price_now
    signals["price_1h_chg"] = price_1h_chg
    signals["price_24h_chg"] = price_24h_chg

    # --- S1: CVD Divergence ---
    cvd_direction = "NEUTRAL"
    cvd_magnitude = 0.0
    if cvd_spot and cvd_perp and len(cvd_spot) >= 24 and len(cvd_perp) >= 24:
        spot_now = float(cvd_spot[-1].get("cumulativeDelta", cvd_spot[-1].get("value", 0)))
        spot_24 = float(cvd_spot[-24].get("cumulativeDelta", cvd_spot[-24].get("value", 0)))
        perp_now = float(cvd_perp[-1].get("cumulativeDelta", cvd_perp[-1].get("value", 0)))
        perp_24 = float(cvd_perp[-24].get("cumulativeDelta", cvd_perp[-24].get("value", 0)))

        spot_delta = spot_now - spot_24
        perp_delta = perp_now - perp_24

        if spot_delta > 0 and perp_delta < 0:
            cvd_direction = "BULLISH"
            cvd_magnitude = abs(spot_delta) + abs(perp_delta)
        elif spot_delta < 0 and perp_delta > 0:
            cvd_direction = "BEARISH"
            cvd_magnitude = abs(spot_delta) + abs(perp_delta)
        else:
            cvd_direction = "NEUTRAL"
            cvd_magnitude = 0.0

    signals["cvd_direction"] = cvd_direction
    signals["cvd_magnitude"] = cvd_magnitude

    # --- Funding extreme ---
    funding_rate = None
    funding_extreme = False
    if funding_data and len(funding_data) >= 1:
        last_f = funding_data[-1]
        funding_rate = float(last_f.get("fundingRate", last_f.get("value", 0)))
        funding_extreme = abs(funding_rate) > 0.01

    signals["funding_rate"] = funding_rate
    signals["funding_extreme"] = funding_extreme

    # --- Retail extreme ---
    retail_long_pct = None
    retail_extreme = False
    retail_extreme_dir = "NEUTRAL"
    if retail_data and len(retail_data) >= 1:
        last_r = retail_data[-1]
        retail_long_pct = float(last_r.get("longPercent", last_r.get("longPct", last_r.get("value", 50))))
        if retail_long_pct > 60:
            retail_extreme = True
            retail_extreme_dir = "BEARISH"
        elif retail_long_pct < 40:
            retail_extreme = True
            retail_extreme_dir = "BULLISH"

    signals["retail_long_pct"] = retail_long_pct
    signals["retail_extreme"] = retail_extreme
    signals["retail_extreme_dir"] = retail_extreme_dir

    # --- Bid-ask shift ---
    bid_ask_ratio = None
    bid_ask_flip = False
    if bid_ask_data and len(bid_ask_data) >= 4:
        ratios = []
        for row in bid_ask_data[-4:]:
            r = float(row.get("bidAskRatio", row.get("ratio", row.get("value", 0))))
            ratios.append(r)
        bid_ask_ratio = ratios[-1]
        for i in range(1, len(ratios)):
            if (ratios[i-1] > 0 and ratios[i] < 0) or (ratios[i-1] < 0 and ratios[i] > 0):
                bid_ask_flip = True
                break

    signals["bid_ask_ratio"] = bid_ask_ratio
    signals["bid_ask_flip"] = bid_ask_flip

    return signals


def detect_changes(current, previous):
    changes = []
    if previous is None:
        changes.append("FIRST_SCAN")
        return changes

    if current.get("cvd_direction") != previous.get("cvd_direction"):
        if current["cvd_direction"] != "NEUTRAL":
            changes.append(f"CVD_FLIP_{current['cvd_direction']}")

    if current.get("funding_extreme") and not previous.get("funding_extreme"):
        changes.append("FUNDING_EXTREME")
    elif not current.get("funding_extreme") and previous.get("funding_extreme"):
        changes.append("FUNDING_NORMALIZED")

    if current.get("retail_extreme") and not previous.get("retail_extreme"):
        changes.append(f"RETAIL_EXTREME_{current['retail_extreme_dir']}")

    if current.get("bid_ask_flip"):
        changes.append("BID_ASK_FLIP")

    return changes


def should_heartbeat():
    now = datetime.datetime.now(datetime.timezone.utc)
    if now.hour % 4 != 0:
        return False
    if os.path.exists(HEARTBEAT_PATH):
        with open(HEARTBEAT_PATH) as f:
            hb = json.load(f)
        if hb.get("hour") == now.hour and hb.get("day") == now.day:
            return False
    with open(HEARTBEAT_PATH, "w") as f:
        json.dump({"hour": now.hour, "day": now.day}, f)
    return True


def build_tg_message(signals, changes):
    lines = []
    price = signals.get("price")
    if price:
        chg_24 = signals.get("price_24h_chg")
        chg_str = f" ({chg_24:+.1f}%)" if chg_24 is not None else ""
        lines.append(f"<b>BTC ${price:,.0f}</b>{chg_str}")

    lines.append("")

    cvd_dir = signals.get("cvd_direction", "NEUTRAL")
    icon = "\U0001f7e2" if cvd_dir == "BULLISH" else "\U0001f534" if cvd_dir == "BEARISH" else "\U0001f7e1"
    lines.append(f"{icon} CVD Divergence: <b>{cvd_dir}</b>")

    fr = signals.get("funding_rate")
    if fr is not None:
        extreme_tag = " \u26a0\ufe0f" if signals.get("funding_extreme") else ""
        lines.append(f"\U0001f4ca Funding: <code>{fr:.4f}%</code>{extreme_tag}")

    rl = signals.get("retail_long_pct")
    if rl is not None:
        extreme_tag = f" \u26a0\ufe0f {signals.get('retail_extreme_dir', '')}" if signals.get("retail_extreme") else ""
        lines.append(f"\U0001f465 Retail Long: <code>{rl:.1f}%</code>{extreme_tag}")

    ba = signals.get("bid_ask_ratio")
    if ba is not None:
        flip_tag = " \U0001f504" if signals.get("bid_ask_flip") else ""
        lines.append(f"\U0001f4c8 Bid/Ask: <code>{ba:.4f}</code>{flip_tag}")

    if changes and changes != ["FIRST_SCAN"]:
        lines.append("")
        lines.append(f"<b>Changes:</b> {', '.join(changes)}")

    ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=1))).strftime("%H:%M CET")
    lines.append(f"\n<i>mathijs-os \u00b7 {ts}</i>")

    return "\n".join(lines)


def build_report(signals):
    r = Report()

    price = signals.get("price")
    if price:
        r.price(price, change_pct=signals.get("price_24h_chg"))

    cvd = signals.get("cvd_direction", "NEUTRAL")
    funding_ext = signals.get("funding_extreme", False)

    if cvd == "BULLISH" and not funding_ext:
        regime = "MOMENTUM"
    elif cvd == "BEARISH" and funding_ext:
        regime = "DISTRIBUTIE"
    elif cvd == "BEARISH":
        regime = "ACCUMULATIE"
    elif cvd == "NEUTRAL":
        regime = "CHOP"
    else:
        regime = "UNKNOWN"
    r.regime(regime)

    cvd_conf = min(90, int(signals.get("cvd_magnitude", 0) / 1000)) if signals.get("cvd_magnitude") else None
    r.signal("CVD Divergence", cvd, confidence=cvd_conf, detail="spot vs perp 24h delta")

    fr = signals.get("funding_rate")
    if fr is not None:
        fd = "BEARISH" if fr > 0.01 else "BULLISH" if fr < -0.01 else "NEUTRAL"
        r.signal("Funding Rate", fd, detail=f"{fr:.4f}%")

    rl = signals.get("retail_long_pct")
    if rl is not None:
        rd = signals.get("retail_extreme_dir", "NEUTRAL")
        if not signals.get("retail_extreme"):
            rd = "NEUTRAL"
        r.signal("Retail Sentiment", rd, detail=f"Long: {rl:.1f}%")

    ba = signals.get("bid_ask_ratio")
    if ba is not None:
        bd = "BULLISH" if ba > 0 else "BEARISH" if ba < 0 else "NEUTRAL"
        flip_note = " (flipped)" if signals.get("bid_ask_flip") else ""
        r.signal("Bid-Ask Ratio", bd, detail=f"{ba:.4f}{flip_note}")

    if price:
        chg_1h = signals.get("price_1h_chg")
        if chg_1h is not None:
            color = "green" if chg_1h >= 0 else "red"
            r.metric("1h Change", f"{chg_1h:+.2f}%", color=color)
        chg_24h = signals.get("price_24h_chg")
        if chg_24h is not None:
            color = "green" if chg_24h >= 0 else "red"
            r.metric("24h Change", f"{chg_24h:+.2f}%", color=color)

    if fr is not None:
        r.metric("Funding Rate", f"{fr:.4f}%", color="green" if fr < 0 else "red" if fr > 0.01 else None)
    if rl is not None:
        r.metric("Retail Long %", f"{rl:.1f}%")

    return r.render()


def main():
    print("=== mathijs-os v2 Market Scanner ===")
    print(f"Time: {datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=1))).strftime('%Y-%m-%d %H:%M CET')}")

    hb = HB()
    tg = TG()

    print("\n[1] Pulling Hyblock data...")
    klines = safe_get(hb.klines, "klines", limit=50)
    cvd_spot = safe_get(hb.cvd_spot, "cvd_spot", limit=50)
    cvd_perp = safe_get(hb.cvd_perp, "cvd_perp", limit=50)
    funding_data = safe_get(hb.funding, "funding", limit=50)
    retail_data = safe_get(hb.retail, "retail", limit=50)
    bid_ask_data = safe_get(hb.bid_ask, "bid_ask", limit=50)

    if not klines:
        print("\n[ABORT] No klines data. Skipping scan.")
        return

    print("\n[2] Computing signals...")
    signals = compute_signals(klines, cvd_spot, cvd_perp, funding_data, retail_data, bid_ask_data)
    print(f"  Price: ${signals.get('price', 0):,.0f}")
    print(f"  CVD: {signals.get('cvd_direction')}")
    print(f"  Funding: {signals.get('funding_rate')}")
    print(f"  Retail Long: {signals.get('retail_long_pct')}")
    print(f"  Bid/Ask: {signals.get('bid_ask_ratio')}")

    print("\n[3] Detecting changes...")
    previous = load_previous()
    changes = detect_changes(signals, previous)
    save_current(signals)

    if changes:
        print(f"  Changes detected: {changes}")
    else:
        print("  No changes detected.")

    print("\n[4] Telegram push logic...")
    heartbeat = should_heartbeat()

    if changes and changes != ["FIRST_SCAN"]:
        print("  Sending ALERT (signal changed)...")
        msg = build_tg_message(signals, changes)
        try:
            tg.push_html(msg, silent=False)
            print("  [OK] Alert sent.")
        except Exception as e:
            print(f"  [ERR] TG push failed: {e}")
    elif heartbeat:
        print("  Sending HEARTBEAT (4h interval)...")
        msg = build_tg_message(signals, [])
        try:
            tg.push_html(msg, silent=True)
            print("  [OK] Heartbeat sent.")
        except Exception as e:
            print(f"  [ERR] TG heartbeat failed: {e}")
    elif changes and "FIRST_SCAN" in changes:
        print("  First scan - sending initial state...")
        msg = build_tg_message(signals, ["INITIAL"])
        try:
            tg.push_html(msg, silent=True)
            print("  [OK] Initial state sent.")
        except Exception as e:
            print(f"  [ERR] TG push failed: {e}")
    else:
        print("  No changes, no heartbeat needed. Silent.")

    print("\n[5] Updating dashboard...")
    html = build_report(signals)
    repo_dir = os.path.dirname(os.path.abspath(__file__))
    index_path = os.path.join(repo_dir, "index.html")

    with open(index_path, "w") as f:
        f.write(html)

    if changes or previous is None:
        print("  Dashboard updated. Committing and pushing...")
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ret = os.system(f'cd {repo_dir} && git add index.html scan.py && git commit -m "scan: update dashboard {ts}" && git push origin main')
        if ret == 0:
            print("  [OK] Pushed to GitHub.")
        else:
            print(f"  [WARN] Git push returned code {ret}")
    else:
        print("  No meaningful changes. Skipping git push.")

    print("\n=== Scan complete ===")


if __name__ == "__main__":
    main()
