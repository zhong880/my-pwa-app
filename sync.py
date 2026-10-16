#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
攒息账本 · 每日行情同步脚本
- 读取 seed.js 中的代码（持仓 + 心选 + 股息基数键）
- 通过腾讯 qt.gtimg.cn 拉取实时股价（稳定、无需密钥、覆盖 A/B股/港股）
- 仅重写 market.js 的行情段，不触碰用户持仓数据
- 行情段同时写入腾讯口径股息率 dy（腾讯行情 GP- 标志位后第 3 个字段），
  页面优先用它展示股息率，与腾讯自选股显示值完全一致
- 股息率兜底 = 页面内计算的「每股年分红 ÷ 本脚本写入的实时股价」
  （口径见 app.js 宏 DIVIDEND_YIELD_ALIGN_TENCENT；无分红事件时回退 seed.js 的 dividendBasis.perShare）

用法：python sync.py
依赖：仅标准库（urllib）。无第三方包。
"""
import urllib.request
import json
import re
import datetime
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SEED_PATH = os.path.join(BASE, "seed.js")
MARKET_PATH = os.path.join(BASE, "market.js")

UA = {"User-Agent": "Mozilla/5.0"}


def read_seed():
    """从 seed.js 解析 window.SEED = {...} 为 dict"""
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"window\.SEED\s*=\s*(\{.*\})\s*;?\s*$", txt, re.DOTALL)
    if not m:
        raise RuntimeError("无法在 seed.js 中找到 window.SEED")
    return json.loads(m.group(1))


def to_qt_code(code):
    """000538.SZ -> sz000538 ; 601318.SH -> sh601318 ; 00700.HK -> hk00700"""
    code = code.strip().upper()
    if code.endswith(".SZ"):
        return "sz" + code[:6]
    if code.endswith(".SH"):
        return "sh" + code[:6]
    if code.endswith(".HK"):
        return "hk" + code[:5]
    if code.endswith(".BJ"):
        return "bj" + code[:6]
    return code.lower()


def parse_yield(fields):
    """从腾讯行情字段解析股息率(%)：GP-A / GP-A-CYB / GP-A-KCB 等市场标志位之后第 3 个字段。
    与腾讯自选股显示值同源（实测宁德时代 2.97、中国平安 5.26）；取不到返回 None。"""
    for i, f in enumerate(fields):
        if f.startswith("GP-"):
            try:
                v = float(fields[i + 3])
            except (IndexError, ValueError):
                return None
            return v if v > 0 else None
    return None


def fetch_prices(qt_codes):
    url = "https://qt.gtimg.cn/q=" + ",".join(qt_codes)
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=25).read().decode("gbk", "ignore")
    out = {}
    for line in raw.split(";"):
        line = line.strip()
        if not line.startswith("v_"):
            continue
        code = line[2:line.index("=")]
        s = line[line.index('"') + 1:line.rindex('"')]
        p = s.split("~")
        if len(p) < 5:
            continue
        try:
            item = {"name": p[1], "price": float(p[3])}
        except ValueError:
            continue
        dy = parse_yield(p)
        if dy is not None:
            item["dy"] = dy
        out[code] = item
    return out


def main():
    seed = read_seed()
    codes = set()
    for h in seed.get("holdings", []):
        codes.add(h["code"])
    for w in seed.get("watchlist", []):
        codes.add(w["code"])
    for k in seed.get("dividendBasis", {}):
        codes.add(k)

    qt_map = {to_qt_code(c): c for c in codes}
    prices = fetch_prices(list(qt_map.keys()))

    items = {}
    for qt_code, seed_code in qt_map.items():
        if qt_code in prices:
            items[seed_code] = {
                "name": prices[qt_code]["name"],
                "price": prices[qt_code]["price"],
            }
            if prices[qt_code].get("dy") is not None:
                items[seed_code]["dy"] = prices[qt_code]["dy"]  # 腾讯口径股息率(%)
        else:
            print(f"  [warn] 未取到行情: {seed_code}")

    market = {
        "updatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "items": items,
    }
    with open(MARKET_PATH, "w", encoding="utf-8") as f:
        f.write("/* 攒息账本 · 行情数据（window.MARKET）\n")
        f.write(" * 由 sync.py 自动生成，请勿手动编辑。\n")
        f.write(" */\n")
        f.write("window.MARKET = " + json.dumps(market, ensure_ascii=False, indent=2) + ";\n")

    print(f"同步完成：{len(items)}/{len(codes)} 只更新，时间 {market['updatedAt']}")


if __name__ == "__main__":
    main()
