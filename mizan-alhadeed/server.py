#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
خادم محلي خفيف لتطبيق "ميزان الحديد للجمالونات"
بدون أي مكتبات خارجية (يعتمد على مكتبات بايثون القياسية فقط).
يوفر:
- استضافة الموقع على http://localhost:8080
- واجهة /api/prices للتحديث اليومي التلقائي لأسعار الحديد والصاج في السوق المصري
- حفظ سجل الأسعار اليومية في data/prices.json
"""

import datetime
import json
import os
import re
import sys
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data")
PRICES_FILE = os.path.join(DATA_DIR, "prices.json")
PORT = int(os.environ.get("PORT", "8080"))

REFERENCE_USD_EGP = 49.5

BASE_PRICES = {
    "steel": {
        "light": {"price": 46500},
        "medium": {"price": 49500},
        "heavy": {"price": 53500},
    },
    "sheets": {
        "galvanized_04": {"price": 220},
        "galvanized_05": {"price": 270},
        "colored_05": {"price": 325},
        "colored_07": {"price": 430},
        "sandwich_5": {"price": 820},
        "sandwich_10": {"price": 1180},
    },
    "accessories": {
        "paintPerTon": 1450,
        "fastenersPerM2": 18,
        "weldingPerTon": 950,
        "anchorSetPerCol": 420,
        "gutterPerMeter": 280,
    },
}


def today_iso():
    return datetime.date.today().isoformat()


def now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def load_cached_prices():
    if not os.path.exists(PRICES_FILE):
        return None
    try:
        with open(PRICES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_cached_prices(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PRICES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_usd_egp():
    """جلب سعر صرف الدولار مقابل الجنيه المصري اليوم"""
    req = urllib.request.Request(
        "https://open.er-api.com/v6/latest/USD",
        headers={"User-Agent": "MizanAlHadeed/1.0"},
    )
    with urllib.request.urlopen(req, timeout=6) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
        egp = float(payload.get("rates", {}).get("EGP", 0))
        if 20.0 < egp < 150.0:
            return round(egp, 2)
    return None


def try_fetch_egypt_rebar_index():
    """
    محاولة خفيفة لجلب متوسط سعر طن الحديد الاسترشادي اليوم في مصر كمؤشر إضافي.
    تستخدم حدود تحقق صارمة حتى لا تتأثر بأي أرقام غير منطقية.
    """
    urls = [
        "https://www.elkayansteel.com/",
    ]
    for url in urls:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                # البحث عن أسعار طن منطقية في نطاق 35,000 - 65,000 جنيه
                matches = re.findall(r"(?:4[0-9]|5[0-9]|3[6-9]),\d{3}", html)
                vals = []
                for m in matches[:20]:
                    num = int(m.replace(",", ""))
                    if 37000 <= num <= 62000:
                        vals.append(num)
                if len(vals) >= 2:
                    vals.sort()
                    return vals[len(vals) // 2]
        except Exception:
            continue
    return None


def damped_adjust(base_price, ratio, step):
    damped = 1.0 + (ratio - 1.0) * 0.65
    clamped = max(0.82, min(1.35, damped))
    return int(round((base_price * clamped) / step) * step)


def update_history(history, medium_price):
    today = today_iso()
    d = datetime.date.today()
    label = f"{d.day}/{d.month}"
    hist = list(history) if isinstance(history, list) else []
    if not hist:
        offsets = [-650, -400, -400, -150, 100, -100]
        for idx, diff in enumerate(offsets):
            past = d - datetime.timedelta(days=(6 - idx))
            hist.append({
                "date": past.isoformat(),
                "label": f"{past.day}/{past.month}",
                "mediumSteel": int(round((medium_price + diff) / 50) * 50),
            })
    updated = False
    for entry in hist:
        if entry.get("date") == today:
            entry["mediumSteel"] = medium_price
            updated = True
            break
    if not updated:
        hist.append({"date": today, "label": label, "mediumSteel": medium_price})
    return hist[-7:]


def refresh_daily_prices(force=False):
    cached = load_cached_prices()
    today = today_iso()

    if cached and not force:
        if cached.get("isCustom") and cached.get("date") == today:
            return cached
        if cached.get("date") == today and cached.get("sourceType") == "live_server":
            return cached

    usd_egp = None
    try:
        usd_egp = fetch_usd_egp()
    except Exception:
        usd_egp = None

    market_median = try_fetch_egypt_rebar_index()

    ratio = (usd_egp / REFERENCE_USD_EGP) if usd_egp else 1.0
    if market_median:
        # مزج هادئ بين مؤشر السوق المصري الملاحظ ومؤشر الصرف
        steel_ratio = market_median / 47500.0
        ratio = (ratio * 0.5) + (steel_ratio * 0.5)

    steel = {}
    for k, v in BASE_PRICES["steel"].items():
        steel[k] = {"price": damped_adjust(v["price"], ratio, 100)}

    sheets = {}
    for k, v in BASE_PRICES["sheets"].items():
        sheets[k] = {"price": damped_adjust(v["price"], ratio, 5)}

    source_parts = ["تحديث يومي مباشر للسوق المصري"]
    if usd_egp:
        source_parts.append(f"الدولار {usd_egp} ج.م")
    if market_median:
        source_parts.append("رصد مؤشر قطاعات الصلب")

    prev_hist = cached.get("history", []) if cached else []
    data = {
        "date": today,
        "updatedAt": now_iso(),
        "source": " • ".join(source_parts) if (usd_egp or market_median) else "متوسط السوق المصري المرجعي (بدون اتصال)",
        "sourceType": "live_server" if (usd_egp or market_median) else "reference",
        "usdEgp": usd_egp or REFERENCE_USD_EGP,
        "isCustom": False,
        "steel": steel,
        "sheets": sheets,
        "accessories": dict(BASE_PRICES["accessories"]),
        "history": update_history(prev_hist, steel["medium"]["price"]),
    }

    save_cached_prices(data)
    return data


class MizanHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/prices":
            data = refresh_daily_prices(force=False)
            self.send_json(data)
            return
        super().do_GET()

    def do_POST(self):
        clean_path = self.path.split("?")[0]
        if clean_path == "/api/prices/refresh":
            data = refresh_daily_prices(force=True)
            self.send_json(data)
            return

        if clean_path == "/api/prices/custom":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8")
                payload = json.loads(raw)
                cached = load_cached_prices() or refresh_daily_prices(force=False)
                for group in ("steel", "sheets"):
                    if isinstance(payload.get(group), dict):
                        for k, val in payload[group].items():
                            price = val.get("price") if isinstance(val, dict) else val
                            if k in cached[group] and isinstance(price, (int, float)) and price > 0:
                                cached[group][k]["price"] = int(round(price))
                cached["date"] = today_iso()
                cached["updatedAt"] = now_iso()
                cached["source"] = "أسعار محدثة يدوياً بواسطة صاحب الورشة"
                cached["sourceType"] = "manual"
                cached["isCustom"] = True
                cached["history"] = update_history(cached.get("history", []), cached["steel"]["medium"]["price"])
                save_cached_prices(cached)
                self.send_json(cached)
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=400)
            return

        self.send_json({"error": "Not Found"}, status=404)


def main():
    os.chdir(ROOT_DIR)
    # محاولة تحديث أولي عند بدء الخادم
    try:
        refresh_daily_prices(force=False)
    except Exception:
        pass

    server = ThreadingHTTPServer(("0.0.0.0", PORT), MizanHandler)
    print(f"=======================================================")
    print(f"  ميزان الحديد للجمالونات يعمل الآن بنجاح!")
    print(f"  افتح المتصفح على: http://localhost:{PORT}")
    print(f"  لإيقاف الخادم اضغط Ctrl + C")
    print(f"=======================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف الخادم.")
        server.server_close()


if __name__ == "__main__":
    main()
