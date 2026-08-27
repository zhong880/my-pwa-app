/* 攒息账本 · 前端逻辑（原生 JS，无依赖） */
(function () {
  "use strict";

  var LS_KEY = "jar_v2";
  /* 版本号：主.次.月日时分（部署时写死，重新推送后改此值即可确认线上是否已更新） */
  var APP_VERSION = "1.0.08270843";
  var SEED = window.SEED || window.SEED_EXAMPLE || {};
  var LS_MARKET_KEY = "jar_market_v1";
  /* 代理开关：Worker/pages.dev 国内不可达，走零部署 JSONP 直连东财分红接口。
     留空 = 零部署；若日后有可用的代理域名再填（前端会用 fetch 转发新浪，港股也仅代理可用）。 */
  var PROXY_URL = "";
  function loadMarket() {
    var scriptM = (window.MARKET && window.MARKET.items) ? window.MARKET : null;
    var localM = null;
    try { localM = JSON.parse(localStorage.getItem(LS_MARKET_KEY) || "null"); } catch (e) {}
    if (scriptM && localM) return (new Date(localM.updatedAt || 0) >= new Date(scriptM.updatedAt || 0)) ? localM : scriptM;
    return localM || scriptM || { items: {}, updatedAt: "" };
  }
  var MARKET = loadMarket();
  var FX = (SEED.meta && SEED.meta.fx && SEED.meta.fx.HKD_CNY) ? SEED.meta.fx.HKD_CNY : 1;

  /* ---------- 状态（localStorage 覆盖 SEED） ---------- */
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function loadState() {
    var def = {
      holdings: deepCopy(SEED.holdings || []),
      watchlist: deepCopy(SEED.watchlist || []),
      dividendEvents: deepCopy(SEED.dividendEvents || []),
      dividendBasis: deepCopy(SEED.dividendBasis || {}),
      hideSensitive: false
    };
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        /* 与默认字段合并：旧备份/老版本 state 可能缺少新字段（如 dividendBasis） */
        return {
          holdings: s.holdings || def.holdings,
          watchlist: s.watchlist || def.watchlist,
          dividendEvents: s.dividendEvents || def.dividendEvents,
          dividendBasis: s.dividendBasis || def.dividendBasis,
          hideSensitive: typeof s.hideSensitive === "boolean" ? s.hideSensitive : def.hideSensitive
        };
      }
    } catch (e) {}
    return def;
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();

  /* ---------- 工具 ---------- */
  function sym(code) {
    if (!code) return "¥";
    if (code.indexOf(".HK") >= 0) return "HK$";
    var b = basis(code);
    if (b && b.currency === "HKD") return "HK$";
    return "¥";
  }
  function price(code) {
    var it = MARKET.items && MARKET.items[code];
    return it ? it.price : null;
  }
  /* 取某代码的股息基数：优先用运行时录入的（state），回退到 SEED 预设 */
  function basis(code) {
    if (state.dividendBasis && state.dividendBasis[code]) return state.dividendBasis[code];
    return (SEED.dividendBasis && SEED.dividendBasis[code]) || null;
  }
  function money(n, code, forceCNY) {
    if (n == null || isNaN(n)) return "—";
    var s = forceCNY ? "¥" : sym(code);
    return s + n.toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  function pct(n) {
    if (n == null || isNaN(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function cls(n) { return n > 0 ? "up" : (n < 0 ? "down" : ""); }
  /* 敏感数据屏蔽：眼睛闭上 -> 显示 •••• */
  function sen(v) { return state.hideSensitive ? "••••" : v; }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 1600);
  }

  /* ---------- 持仓计算 ---------- */
  function calcHolding(h) {
    var shares = 0, cost = 0;
    (h.lots || []).forEach(function (l) {
      var amt = (l.shares || 0) * (l.price || 0) + (l.fee || 0);
      if (l.type === "sell") { shares -= l.shares || 0; cost -= (l.shares || 0) * (l.price || 0); }
      else { shares += l.shares || 0; cost += amt; }
    });
    var p = price(h.code);
    var mv = (p != null) ? shares * p : null;
    var profit = (mv != null) ? mv - cost : null;
    var profitPct = (profit != null && cost) ? profit / cost * 100 : null;
    var b = basis(h.code);
    // 累计收息（来自已登记派息事件，exDate 已过）：用实时持股 shares，与年股息口径一致，
    // 避免把已卖出部分也算进累计收息（回本进度虚高）。
    var cum = 0;
    var todayStr = new Date().toISOString().slice(0, 10);
    (state.dividendEvents || []).forEach(function (e) {
      if (e.code === h.code && (!e.exDate || e.exDate <= todayStr)) cum += (e.perShare || 0) * shares;
    });
    // 预计年股息：用「最近财年 perShare 合计 × 股数」口径，与股息率、收息日历预测一致（对齐腾讯静态股息率）。
    var annualPerShare = annualPerShareOf(h.code);
    var annualDiv = (annualPerShare != null) ? annualPerShare * shares : null;
    /* 股息率显示用「最近财年 perShare 合计 ÷ 现价」，对齐腾讯自选股 */
    var yld = (annualPerShareOf(h.code) != null && p) ? annualPerShareOf(h.code) / p * 100 : null;
    var payback = (cost) ? cum / cost * 100 : null;
    return { shares: shares, cost: cost, mv: mv, profit: profit, profitPct: profitPct,
             yield: yld, annualDiv: annualDiv, cumDiv: cum, payback: payback,
             currency: b ? (b.currency || "CNY") : "CNY" };
  }

  /* ---------- 渲染：持仓 ---------- */
  function renderHoldings() {
    var hs = state.holdings || [];
    var totMv = 0, totCost = 0, totAnnual = 0, hasPrice = false;
    hs.forEach(function (h) {
      var c = calcHolding(h);
      var b = basis(h.code);
      var conv = (b && b.currency === "HKD") ? FX : 1;
      if (c.mv != null) { totMv += c.mv * conv; totCost += c.cost * conv; hasPrice = true; }
      if (c.annualDiv != null) totAnnual += c.annualDiv * conv;
    });
    var totProfit = totMv - totCost;
    var totPct = totCost ? totProfit / totCost * 100 : null;
    var totYld = (totCost && totMv) ? totAnnual / totMv * 100 : null;
    var sm = document.getElementById("holdSummary");
    sm.innerHTML =
      cell("总市值", hasPrice ? sen(money(totMv)) : "—") +
      cell("总成本", sen(money(totCost))) +
      cell("总盈亏", state.hideSensitive ? "••••" : ((totProfit >= 0 ? "赚 " : "亏 ") + money(Math.abs(totProfit))), state.hideSensitive ? "" : cls(totProfit)) +
      cell("整体股息率", totYld != null ? pct(totYld) : "—", "small") +
      cell("预计年股息", money(totAnnual)) +
      cell("持仓数", hs.length + " 只") +
      cell("HKD汇率", "1 : " + FX.toFixed(2), "small");

    var list = document.getElementById("holdList");
    list.innerHTML = "";
    hs.forEach(function (h) {
      var c = calcHolding(h);
      var b = basis(h.code);
      var yLabel = b ? b.label : "";
      var row = document.createElement("div");
      row.className = "row";
      var profitTxt = c.profit == null ? "—" : (c.profit >= 0 ? "赚 " : "亏 ") + money(Math.abs(c.profit), h.code);
      row.innerHTML =
        '<div class="line1"><span><span class="name">' + h.name + '</span>' +
        '<span class="code">' + h.code + '</span></span>' +
        '<span class="line1-right">' +
        (c.yield != null ? '<span class="yield-badge">' + c.yield.toFixed(2) + '%</span>' : '<span class="yield-badge">—</span>') +
        '<button class="del-btn" data-del="' + h.code + '" title="删除持仓">✕</button>' +
        '</span></div>' +
        '<div class="grid2">' +
        item("持股", c.shares + " 股" +
          '<span class="shares-btns">' +
          '<button class="step-btn" data-dec="' + h.code + '" title="减少100股">−</button>' +
          '<button class="step-btn" data-inc="' + h.code + '" title="增加100股">＋</button>' +
          '</span>') +
        item("现价", price(h.code) != null ? money(price(h.code), h.code) : "—") +
        item("成本", sen(money(c.cost, h.code))) +
        item("市值", c.mv != null ? sen(money(c.mv, h.code)) : "—") +
        item("盈亏", state.hideSensitive ? "••••" : profitTxt, state.hideSensitive ? "" : cls(c.profit)) +
        item("预计年股息", (c.annualDiv != null
          ? (c.currency === "HKD" ? money(c.annualDiv * FX, h.code, true) : money(c.annualDiv, h.code))
          : "—") +
          '<button class="link-btn" data-basis="' + h.code + '" title="补填/修改每股年分红">' +
          (c.annualDiv != null ? "改分红" : "补分红") + '</button>') +
        item("回本进度", c.payback != null ? sen(c.payback.toFixed(1) + "%") : "—") +
        '</div>' +
        (yLabel ? '<div class="code" style="margin-top:6px">' + yLabel + '</div>' : '');
      list.appendChild(row);
    });
    if (!hs.length) list.innerHTML = '<div class="row code">暂无持仓，点下方“新增持仓”</div>';
  }
  function cell(k, v, c) {
    return '<div class="sum-cell"><div class="k">' + k + '</div><div class="v ' + (c || "") + '">' + v + '</div></div>';
  }
  function item(k, v, c) {
    return '<div class="it"><div class="k">' + k + '</div><div class="v ' + (c || "") + '">' + v + '</div></div>';
  }

  /* ---------- 渲染：收息日历（对齐"已收/预计全年 + 分红对账"） ---------- */
  /* 金额折算：港股按 FX 折算人民币，保证与持仓汇总口径一致 */
  function amountCNY(perShare, shares, code) {
    var v = (perShare || 0) * (shares || 0);
    if (code && code.indexOf(".HK") >= 0) v = v * FX;
    return v;
  }
  /* 生成本地日期字符串 YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
  function localDateStr(d) {
    var y = d.getFullYear();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + day;
  }
  function renderCalendar() {
    var evs = state.dividendEvents || [];
    var today = new Date();
    var todayStr = localDateStr(today);
    var yr = today.getFullYear();

    /* 年度派息预测：用「最近财年(fy) perShare 合计」× 股数，与股息率、持仓卡片「预计年股息」口径一致
       （对齐腾讯静态股息率，非两年 TTM）。币种换算保留原 amountCNY 处理。 */
    var predictedAnnual = 0;
    (state.holdings || []).forEach(function (h) {
      var c = calcHolding(h);
      if (!c.shares) return;
      var perShare = annualPerShareOf(h.code); /* 两财年合计，含回退 basis */
      if (perShare != null) predictedAnnual += amountCNY(perShare, c.shares, h.code);
    });

    /* 按事件拆分：已收（除权日已过）/ 预计（未到或待实施），并落月到月度柱 */
    var collectedMonths = new Array(12).fill(0);
    var predictedMonths = new Array(12).fill(0);
    var collectedThisYear = 0; /* 今年已实际到账（用于分红对账） */
    evs.forEach(function (e) {
      var amt = amountCNY(e.perShare, e.shares, e.code);
      var passed = e.exDate && e.exDate <= todayStr;
      var m = e.exDate ? parseInt(e.exDate.slice(5, 7), 10) : 0;
      if (passed) {
        if (e.exDate.indexOf(yr) === 0) collectedThisYear += amt;
        if (m >= 1 && m <= 12) collectedMonths[m - 1] += amt;
      } else {
        if (m >= 1 && m <= 12) predictedMonths[m - 1] += amt;
      }
    });

    /* 分红对账：待收 = 预测 − 已收；进度 = 已收 / 预测 */
    var pending = predictedAnnual - collectedThisYear;
    if (pending < 0) pending = 0;
    var progress = predictedAnnual > 0 ? collectedThisYear / predictedAnnual * 100 : 0;

    var sm = document.getElementById("calSummary");
    sm.innerHTML =
      cell("年度派息预测", money(predictedAnnual)) +
      cell("今年已收", money(collectedThisYear)) +
      cell("待收", money(pending)) +
      cell("收息进度", pct(progress), "small");

    /* 月度现金流：已收(实色) + 预计(浅色) 堆叠柱 */
    var monthsTot = new Array(12).fill(0);
    for (var i = 0; i < 12; i++) monthsTot[i] = collectedMonths[i] + predictedMonths[i];
    var maxM = Math.max.apply(null, monthsTot.concat([1]));
    var flow = document.getElementById("flowChart");
    flow.innerHTML = "";
    var names = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    monthsTot.forEach(function (v, i) {
      var col = document.createElement("div");
      col.className = "col";
      var hGot = Math.round(collectedMonths[i] / maxM * 90);
      var hWill = Math.round(predictedMonths[i] / maxM * 90);
      col.innerHTML = '<div class="amt">' + (v ? Math.round(v) : "") + '</div>' +
        '<div class="bar"><div class="bar-will" style="height:' + hWill + 'px"></div>' +
        '<div class="bar-got" style="height:' + hGot + 'px"></div></div>' +
        '<div class="lab">' + names[i] + '</div>';
      flow.appendChild(col);
    });

    var list = document.getElementById("eventList");
    list.innerHTML = "";
    evs.slice().sort(function (a, b) { return (a.exDate < b.exDate ? 1 : -1); }).forEach(function (e) {
      var amt = amountCNY(e.perShare, e.shares, e.code);
      var passed = e.exDate && e.exDate <= todayStr;
      var tag = passed
        ? '<span class="tag got">已收</span>'
        : '<span class="tag will">预计</span>';
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<div class="line1"><span><span class="name">' + e.name + '</span>' +
        '<span class="code">' + e.exDate + '</span>' + tag + '</span>' +
        '<span class="v" style="font-weight:700">' + money(amt, e.code) + '</span></div>' +
        '<div class="grid2">' +
        item("每股", money(e.perShare, e.code)) +
        item("股数", (e.shares || 0) + " 股") +
        item("备注", e.note || "—") +
        item("代码", e.code) + '</div>';
      list.appendChild(row);
    });
    if (!evs.length) list.innerHTML = '<div class="row code">暂无派息记录</div>';
  }

  /* ---------- 渲染：心选 ---------- */
  function renderWatch() {
    var ws = state.watchlist || [];
    var list = document.getElementById("watchList");
    list.innerHTML = "";
    /* 旧数据兼容：单档 targetPrice/targetYield 回退到①档 */
    ws.forEach(function (w) {
      if (w.targetPrice != null && w.targetPrice1 == null) w.targetPrice1 = w.targetPrice;
      if (w.targetYield != null && w.targetYield1 == null) w.targetYield1 = w.targetYield;
    });
    ws.forEach(function (w) {
      var p = price(w.code);
      var b = basis(w.code);
      /* 股息率显示用「最近财年 perShare 合计 ÷ 现价」，对齐腾讯自选股静态股息率 */
      var yld = (annualPerShareOf(w.code) != null && p) ? annualPerShareOf(w.code) / p * 100 : null;
      /* 三档目标：价格达成 = 现价≤目标价；股息达成 = 当前股息率≥目标 */
      var tiers = [
        { tp: w.targetPrice1, ty: w.targetYield1 },
        { tp: w.targetPrice2, ty: w.targetYield2 },
        { tp: w.targetPrice3, ty: w.targetYield3 }
      ];
      var tags = [];
      tiers.forEach(function (t, i) {
        var reach = false, label = "";
        if (p != null && t.tp) {
          if (p <= t.tp) { reach = true; label = "①②③④⑤⑥⑦⑧⑨".charAt(i) + "价"; }
        }
        if (yld != null && t.ty) {
          if (yld >= t.ty) { reach = true; label += (label ? "+" : "") + "息"; }
        }
        if (reach) tags.push('<span class="tag buy">第' + (i + 1) + '档达成' + (label ? "·" + label : "") + '</span>');
      });
      var tagHtml = tags.length ? tags.join("") : "";
      /* 三档行 */
      var tierRows = tiers.map(function (t, i) {
        var tpStr = t.tp ? money(t.tp, w.code) : "—";
        var tyStr = t.ty != null ? t.ty + "%" : "—";
        var okP = (p != null && t.tp) ? (p <= t.tp) : false;
        var okY = (yld != null && t.ty) ? (yld >= t.ty) : false;
        /* 同时满足「目标价≤现价」且「当前股息率≥目标股息率」→ 目标价文字标红 */
        var hit = okP && okY;
        return item("目标价" + "①②③".charAt(i), tpStr + (okP ? " ✓" : ""), hit ? "red" : "") +
               item("目标股息率" + "①②③".charAt(i), tyStr + (okY ? " ✓" : ""));
      }).join("");
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<div class="line1"><span><span class="name">' + w.name + '</span>' +
        '<span class="code">' + w.code + '</span>' + (w.group ? '<span class="tag">' + w.group + '</span>' : '') + '</span>' +
        '<span class="line1-right">' +
        (yld != null ? '<span class="yield-badge">' + yld.toFixed(2) + '%</span>' : '<span class="yield-badge">—</span>') +
        '<button class="edit-btn" data-edit="' + w.code + '" title="编辑心选">✎</button>' +
        '<button class="del-btn" data-del="' + w.code + '" title="删除心选">✕</button>' +
        '</span></div>' +
        '<div class="grid2">' +
        item("现价", p != null ? money(p, w.code) : "—") +
        item("当前股息率", yld != null ? pct(yld) : "—") +
        '</div>' +
        '<div class="grid2" style="margin-top:6px">' + tierRows + '</div>' +
        (tagHtml ? '<div style="margin-top:8px">' + tagHtml + '</div>' : '');
      list.appendChild(row);
    });
    if (!ws.length) list.innerHTML = '<div class="row code">暂无心选，点下方“新增心选”</div>';
  }

  /* 一键同步：把当前持仓账本的所有股票批量加入心选（去重，已在心选的跳过） */
  function syncHoldingsToWatch() {
    var hs = state.holdings || [];
    if (!hs.length) { toast("暂无可同步的持仓"); return; }
    if (!state.watchlist) state.watchlist = [];
    var exist = {};
    state.watchlist.forEach(function (w) { if (w.code) exist[w.code] = true; });
    var added = 0;
    hs.forEach(function (h) {
      if (!h.code || exist[h.code]) return;
      var market = h.code.indexOf(".SH") >= 0 ? "A" : h.code.indexOf(".SZ") >= 0 ? "A"
        : h.code.indexOf(".HK") >= 0 ? "HK" : h.code.indexOf(".BJ") >= 0 ? "B" : "A";
      state.watchlist.push({ code: h.code, name: h.name || h.code, market: market });
      exist[h.code] = true; added++;
    });
    if (added > 0) { saveState(); renderWatch(); toast("已同步 " + added + " 只到心选"); }
    else toast("持仓已全在心选，无需同步");
  }

  /* ---------- 弹窗表单 ---------- */
  var modal = document.getElementById("modal");
  var form = document.getElementById("modalForm");
  var FORM_DEFS = {
    holding: {
      title: "新增持仓（买入）",
      fields: [
        { k: "name", label: "名称", ph: "云南白药 / 输入可模糊搜索", req: true },
        { k: "code", label: "代码", ph: "000538.SZ / 00700.HK", req: true },
        { k: "market", label: "市场", type: "select", opts: ["A", "HK", "B"], def: "A" },
        { k: "date", label: "买入日期", ph: "2024-03-01", req: true },
        { k: "shares", label: "股数", ph: "1000", def: "100", req: true, num: true },
        { k: "price", label: "买入价", ph: "52.30", req: true, num: true },
        { k: "fee", label: "手续费", ph: "5", num: true, def: "0" }
      ]
    },
    event: {
      title: "登记派息",
      fields: [
        { k: "code", label: "代码", ph: "000538.SZ", req: true },
        { k: "name", label: "名称", ph: "云南白药", req: true },
        { k: "exDate", label: "除权除息日", ph: "2026-04-30", req: true },
        { k: "perShare", label: "每股分红", ph: "1.583", req: true, num: true },
        { k: "shares", label: "股数", ph: "1000", req: true, num: true },
        { k: "note", label: "备注", ph: "2025年度10派15.83" }
      ]
    },
    watch: {
      title: "新增心选",
      fields: [
        { k: "name", label: "名称", ph: "中国平安 / 输入可模糊搜索", req: true },
        { k: "code", label: "代码", ph: "601318.SH", req: true },
        { k: "market", label: "市场", type: "select", opts: ["A", "HK", "B"], def: "A" },
        { k: "group", label: "分组（可选）", ph: "保险" },
        { k: "targetPrice1", label: "目标价①", num: true, ph: "55" },
        { k: "targetYield1", label: "目标股息率①(%)", num: true, ph: "5.5" },
        { k: "targetPrice2", label: "目标价②", num: true, ph: "50" },
        { k: "targetYield2", label: "目标股息率②(%)", num: true, ph: "6.0" },
        { k: "targetPrice3", label: "目标价③", num: true, ph: "45" },
        { k: "targetYield3", label: "目标股息率③(%)", num: true, ph: "6.5" }
      ]
    }
  };
  var curType = null;
  var curEdit = null; /* 编辑模式：保存时按此对象引用更新已有记录；为 null 表示新增 */

  /* 用户缓存股票库（仅本机持久，不污染 STOCK_DB 源文件）：选中实时项时写入 localStorage。
     换设备/换浏览器不会同步——仅本人本机下次打开也能本地搜到。 */
  var LS_STOCKDB_KEY = "jar_stockdb_user_v1";
  function loadUserStockDB() {
    try { return JSON.parse(localStorage.getItem(LS_STOCKDB_KEY) || "[]") || []; } catch (e) { return []; }
  }
  function saveUserStock(code, name) {
    if (!code || !name) return;
    var arr = loadUserStockDB();
    if (arr.some(function (x) { return x.code === code; })) return; /* 已存在则跳过 */
    arr.push({ code: code, name: name });
    try { localStorage.setItem(LS_STOCKDB_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  /* 启动时把用户缓存库并入运行时 STOCK_DB 内存（刷新后从源文件重新加载，再合并） */
  function mergeUserStockDB() {
    if (!window.STOCK_DB) return;
    loadUserStockDB().forEach(function (s) {
      if (!window.STOCK_DB.some(function (x) { return x.code === s.code; })) {
        window.STOCK_DB.push({ code: s.code, name: s.name });
      }
    });
  }

  /* 在股票代码库 STOCK_DB 中按名称/代码模糊搜索（最多 12 条） */
  function searchStockDB(q) {
    q = (q || "").trim().toLowerCase();
    if (!q || !window.STOCK_DB) return [];
    var res = [];
    for (var i = 0; i < window.STOCK_DB.length; i++) {
      var s = window.STOCK_DB[i];
      if (s.name.toLowerCase().indexOf(q) >= 0 || s.code.toLowerCase().indexOf(q) >= 0) {
        res.push(s);
        if (res.length >= 12) break;
      }
    }
    return res;
  }

  /* 腾讯 smartbox 实时股票搜索（JSONP，零代理，浏览器直连）：用于「本地 STOCK_DB 没有」时的模糊补全。
     返回标准格式 [{code:"600519.SH"|"00700.HK", name, live:true}]，仅含股票(GP)，最多 12 条。 */
  function toStdCode(market, code) {
    if (market === "sh") return code + ".SH";
    if (market === "sz") return code + ".SZ";
    if (market === "hk") return code + ".HK";
    return null; /* 美股/指数/权证等暂不纳入 */
  }
  function parseSmartbox(txt) {
    var m = (txt || "").match(/v_hint="?([^"\n]*)"?/);
    var body = m ? m[1] : (txt || "");
    var segs = body.split("^");
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i].split("~");
      if (seg.length < 5) continue;
      if ((seg[4] || "").indexOf("GP") !== 0) continue; /* 只要股票类(GP/GP-A/GP-H…)，过滤指数/权证/基金 */
      var full = toStdCode(seg[0], seg[1]);
      if (!full) continue;
      out.push({ code: full, name: seg[2], live: true });
      if (out.length >= 12) break;
    }
    return out;
  }
  var _liveLock = false;
  function searchStockLive(q) {
    if (_liveLock) return Promise.resolve([]); /* 单飞，避免并发覆盖 window.v_hint */
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "https://smartbox.gtimg.cn/s3/?v=2&t=all&q=" + encodeURIComponent(q);
      var done = false;
      _liveLock = true;
      function finish() {
        if (done) return; done = true; _liveLock = false;
        try { document.body.removeChild(s); } catch (e) {}
        var txt = window.v_hint || "";
        try { window.v_hint = ""; } catch (e) {}
        resolve(parseSmartbox(txt));
      }
      s.onload = finish;
      s.onerror = function () { if (done) return; done = true; _liveLock = false;
        try { document.body.removeChild(s); } catch (e) {} resolve([]); };
      document.body.appendChild(s);
      setTimeout(finish, 6000); /* 超时兜底 */
    });
  }
  /* 渲染名称搜索下拉（本地或实时结果共用） */
  function renderSuggest(box, list, isLive) {
    if (!list || !list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = list.map(function (m) {
      return '<div class="ss-item" data-code="' + m.code + '" data-name="' + m.name + '">' +
        '<span class="ss-name">' + m.name + '</span>' +
        '<span class="ss-code">' + m.code + (m.live ? ' <em class="ss-live">实时</em>' : '') + '</span></div>';
    }).join("");
    box.hidden = false;
  }

  /* 填代码后自动带出名称 + 当前股价（行情缺失则实时拉一次） */
  function autoFillByCode(code) {
    code = (code || "").trim().toUpperCase();
    if (!code) return;
    var nameEl = form.elements["name"], priceEl = form.elements["price"];
    var it = MARKET.items && MARKET.items[code];
    if (it && it.name && nameEl && !nameEl.value) nameEl.value = it.name;
    if (it && it.price && priceEl && !priceEl.value) priceEl.value = it.price;
    if ((!it || !it.name || !it.price)) {
      fetchSingleQuote(code).then(function (q) {
        if (!q) return;
        if (q.name && nameEl && !nameEl.value) nameEl.value = q.name;
        if (q.price && priceEl && !priceEl.value) priceEl.value = q.price;
      });
    }
  }

  /* 取某代码的「每股年分红」：对齐腾讯自选股「股息率」口径 = 滚动12个月实际派息合计
     （按 exDate 在 [今天-365天, 今天] 内筛选事件并合计，与腾讯一致；华泰实测 0.55/18.6=2.96% 完全对齐）。
     用于：股息率显示 + 预计年股息 + 收息日历预测 + 心选目标股息率反推目标价。
     无事件（含港股，不建事件）则回退 dividendBasis.perShare。无则 null。
     注意：若东财接口漏返回某笔派息（如云南白药中期分红），则此处按东财实有数据计算，
     与腾讯存在差异属数据源差异，非口径错误。 */
  function annualPerShareOf(code) {
    if (!code) return null;
    var cut = new Date();
    cut.setFullYear(cut.getFullYear() - 1);
    var cutoff = localDateStr(cut); /* 最近12个月（ISO 字符串可字典序比较） */
    var sum = 0, has = false;
    (state.dividendEvents || []).forEach(function (e) {
      if (e.code !== code) return;
      if (e.exDate && e.exDate >= cutoff) { sum += parseFloat(e.perShare || 0); has = true; }
    });
    if (has) return sum; /* 滚动12个月实际派息合计，对齐腾讯 */
    var b = basis(code);
    if (b && b.perShare != null) return b.perShare;
    return null;
  }

  /* 心选：填了目标股息率后，用分红数据反推目标价 = 年每股分红 / (目标股息率/100)。
     仅本地无分红数据时，按本工程抓取方式（东财 A 股 / 新浪港股）抓取一次，抓到再反推。
     仅在目标价尚为空时自动填入（不覆盖用户手动填写），作为参考值。 */
  var _divFetching = {}; /* 按 code 去重，避免 oninput 高频重复抓取 */
  function ensureDividendBasis(code, name, isHK) {
    if (annualPerShareOf(code) != null) return Promise.resolve(false); /* 已有数据，无需抓 */
    if (_divFetching[code]) return _divFetching[code]; /* 进行中，复用同一结果 */
    var p = (isHK ? fetchHKDividendBasis(code) : fetchDividendBasis(code))
      .then(function (infos) {
        delete _divFetching[code];
        if (!infos || !infos.length) return false;
        var annualPerShare = infos.reduce(function (s, info) {
          return s + (parseFloat(info.perShare) || 0);
        }, 0);
        if (!(annualPerShare > 0)) return false;
        /* 与打开页面自动抓取同一口径回填 dividendBasis（心选不建收息日历事件） */
        if (!state.dividendBasis) state.dividendBasis = {};
        var cur = state.dividendBasis[code] || {};
        if (!(cur.label && /手动/.test(cur.label))) {
          state.dividendBasis[code] = {
            perShare: cur.perShare != null ? Math.max(cur.perShare, annualPerShare) : annualPerShare,
            currency: isHK ? "HKD" : (cur.currency || "CNY"),
            label: cur.label || (name + (isHK ? " 港股分红(新浪)" : " 自动抓取分红兜底"))
          };
        }
        saveState();
        return true;
      })
      .catch(function () { delete _divFetching[code]; return false; });
    _divFetching[code] = p;
    return p;
  }

  /* 反推目标价：填某档目标股息率 N（targetYieldN）→ 用分红数据反推该档目标价（targetPriceN）。
     三档都支持（N=1/2/3）。本地无数据时按本工程方式抓取一次再反推。
     目标价始终跟随目标股息率重算（手填的目标价也会被新的目标股息率覆盖）。 */
  function autoFillTargetPrice(n) {
    n = n || 1;
    var codeEl = form.elements["code"];
    var yEl = form.elements["targetYield" + n];
    var pEl = form.elements["targetPrice" + n];
    if (!codeEl || !yEl || !pEl) return;
    var code = codeEl.value.trim();
    var y = parseFloat(yEl.value);
    if (!code || !y) return;
    var ps = annualPerShareOf(code);
    if (ps != null) { pEl.value = (ps / (y / 100)).toFixed(2); return; }
    /* 本地无分红数据：按本工程方式抓取一次，成功后再重算目标价 */
    var isHK = code.indexOf(".HK") >= 0;
    var nm = (form.elements["name"] || {}).value || code;
    ensureDividendBasis(code, nm, isHK).then(function (ok) {
      if (!ok) return;
      /* 表单已被用户改动则放弃回填 */
      if (form.elements["code"].value.trim() !== code) return;
      if (form.elements["targetYield" + n].value.trim() !== String(y)) return;
      var ps2 = annualPerShareOf(code);
      if (ps2 != null) {
        form.elements["targetPrice" + n].value = (ps2 / (y / 100)).toFixed(2);
        toast("已抓取 " + nm + " 分红数据并反推第" + n + "档目标价");
      }
    });
  }

  function openModal(type, editObj) {
    curType = type;
    curEdit = editObj || null;
    var def = FORM_DEFS[type];
    document.getElementById("modalTitle").textContent = curEdit ? ("编辑" + def.title.replace(/^新增/, "")) : def.title;
    form.innerHTML = "";
    def.fields.forEach(function (f) {
      var div = document.createElement("div");
      div.className = "field";
      var lab = '<label>' + f.label + (f.req ? " *" : "") + '</label>';
      var ctrl;
      /* 编辑模式：用已有记录的值作为默认值（新增时用 f.def） */
      var preset = curEdit && curEdit[f.k] != null ? curEdit[f.k] : (f.def != null ? f.def : "");
      if (f.type === "select") {
        ctrl = '<select name="' + f.k + '">' + f.opts.map(function (o) {
          return '<option' + (String(o) === String(preset) ? " selected" : "") + '>' + o + '</option>';
        }).join("") + '</select>';
      } else {
        var dv = preset;
        /* 持仓表单：买入日期默认填今天（仅新增且无值时） */
        if (type === "holding" && f.k === "date" && !curEdit) dv = localDateStr(new Date());
        ctrl = '<input name="' + f.k + '" placeholder="' + (f.ph || "") + '"' +
          (f.num ? ' inputmode="decimal"' : '') + ' value="' + dv + '" />';
        /* 持仓/心选表单：名称输入框下方挂模糊搜索下拉 */
        if ((type === "holding" || type === "watch") && f.k === "name") {
          ctrl += '<div class="stock-suggest" data-suggest hidden></div>';
        }
      }
      div.innerHTML = lab + ctrl;
      form.appendChild(div);
    });
    /* 持仓/心选表单：名称模糊搜索 + 代码自动带出名称/股价；心选额外支持目标股息率反推目标价 */
    if (type === "holding" || type === "watch") {
      form.oninput = function (e) {
        var el = e.target;
        if (!el) return;
        if (el.name === "code") {
          autoFillByCode(el.value);
          /* 反推目标价改在 onchange（失焦/回车）时执行，避免输入中途跳动 */
        } else if (el.name === "name") {
          var q = el.value.trim();
          var box = form.querySelector("[data-suggest]");
          if (!box) return;
          if (!q) { box.hidden = true; box.innerHTML = ""; return; }
          var local = searchStockDB(q);
          if (local.length >= 3) {
            /* 本地命中足够，直接用本地清单，不发实时请求 */
            renderSuggest(box, local, false);
          } else {
            /* 本地不足：先展示本地（若有），再发起腾讯实时搜索兜底/补全 */
            if (local.length) renderSuggest(box, local, false);
            else { box.innerHTML = '<div class="ss-loading">实时搜索中…</div>'; box.hidden = false; }
            searchStockLive(q).then(function (live) {
              if (form.elements["name"].value.trim() !== q) return; /* 输入已变，丢弃旧结果 */
              var merged = local.concat(live.filter(function (l) {
                return !local.some(function (x) { return x.code === l.code; });
              }));
              renderSuggest(box, merged, live.length > 0);
            });
          }
        }
        /* targetYield 的实时反推已移除，改由 onchange 触发，不再于输入中途改变目标价 */
      };
      /* 反推目标价：失焦/回车（change）时才执行，输入过程中不跳动 */
      form.onchange = function (e) {
        if (type !== "watch") return;
        var el = e.target;
        if (!el) return;
        if (el.name === "code") {
          [1, 2, 3].forEach(autoFillTargetPrice);
        } else if (/^targetYield[123]$/.test(el.name)) {
          autoFillTargetPrice(+el.name.slice(-1));
        }
      };
      /* 选中下拉项：填名称 + 代码，触发股价自动填充；心选额外反推目标价 */
      form.onclick = function (e) {
        var it = e.target.closest ? e.target.closest(".ss-item") : null;
        if (!it) return;
        var code = it.dataset.code, name = it.dataset.name;
        var nameEl = form.elements["name"], codeEl = form.elements["code"];
        if (nameEl) nameEl.value = name;
        if (codeEl) codeEl.value = code;
        var box = form.querySelector("[data-suggest]");
        if (box) box.hidden = true;
        saveUserStock(code, name); /* 选中即写入本机用户缓存库，下次本地可搜 */
        autoFillByCode(code);
        if (type === "watch") [1, 2, 3].forEach(autoFillTargetPrice); /* 选中后三档都尝试反推 */
      };
      /* 失焦时延迟关闭下拉（避免点选项前先消失） */
      var nameInput = form.elements["name"];
      if (nameInput) {
        nameInput.addEventListener("blur", function () {
          setTimeout(function () {
            var box = form.querySelector("[data-suggest]");
            if (box) box.hidden = true;
          }, 150);
        });
      }
    } else {
      form.oninput = null;
      form.onclick = null;
      form.onchange = null;
    }
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }

  function saveModal() {
    var def = FORM_DEFS[curType];
    var obj = {};
    var ok = true;
    def.fields.forEach(function (f) {
      var el = form.elements[f.k];
      var v = el ? el.value.trim() : "";
      if (f.req && !v) ok = false;
      if (f.num && v) v = parseFloat(v);
      obj[f.k] = v;
    });
    if (!ok) { toast("请填写必填项"); return; }
    if (curType === "holding") {
      var lot = { type: "buy", date: obj.date, shares: obj.shares, price: obj.price, fee: obj.fee || 0 };
      delete obj.date; delete obj.shares; delete obj.price; delete obj.fee;
      /* 同代码持仓：合并新买入到原记录的 lots（多仓累计），避免重复记录导致的覆盖/重复计算 */
      var existH = null;
      for (var i = 0; i < state.holdings.length; i++) {
        if (state.holdings[i].code === obj.code) { existH = state.holdings[i]; break; }
      }
      if (existH) {
        if (!existH.lots) existH.lots = [];
        existH.lots.push(lot);
        if (obj.name && !existH.name) existH.name = obj.name; /* 名称缺失时补全 */
      } else {
        obj.lots = [lot];
        state.holdings.push(obj);
      }
    } else if (curType === "event") {
      obj.manual = true; /* 标记为手动录入，clearAutoDividendData 不会清除 */
      state.dividendEvents.push(obj);
      /* 登记派息时，自动把当次每股分红回填到 dividendBasis，
         使持仓页「预计年息/回本进度」自动有数（可被手动覆盖） */
      if (obj.code && obj.perShare != null) {
        if (!state.dividendBasis) state.dividendBasis = {};
        var cur = state.dividendBasis[obj.code] || {};
        state.dividendBasis[obj.code] = {
          perShare: obj.perShare,
          currency: cur.currency || (obj.code.indexOf(".HK") >= 0 ? "HKD" : "CNY"),
          label: obj.note || cur.label || obj.name + " 派息回填"
        };
      }
    } else if (curType === "watch") {
      /* 重复校验：新增时若代码已在心选列表，则禁止重复添加 */
      if (!curEdit) {
        var dup = (state.watchlist || []).some(function (x) { return x.code === obj.code; });
        if (dup) {
          toast("「" + (obj.name || obj.code) + " (" + obj.code + ")」已在心选列表，不可重复添加");
          return;
        }
      }
      /* 编辑模式：按原对象引用更新该条（含 3 档目标）；新增则 push */
      var tgt = null;
      if (curEdit) {
        (state.watchlist || []).forEach(function (x) { if (x === curEdit) tgt = x; });
      }
      if (tgt) {
        tgt.name = obj.name; tgt.code = obj.code; tgt.market = obj.market; tgt.group = obj.group;
        tgt.targetPrice1 = obj.targetPrice1; tgt.targetYield1 = obj.targetYield1;
        tgt.targetPrice2 = obj.targetPrice2; tgt.targetYield2 = obj.targetYield2;
        tgt.targetPrice3 = obj.targetPrice3; tgt.targetYield3 = obj.targetYield3;
      } else {
        state.watchlist.push(obj);
      }
      curEdit = null;
    }
    saveState();
    closeModal();
    renderAll();
    toast("已保存");
  }

  /* ---------- 导出 ---------- */
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "攒息账本-备份-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    toast("已导出备份");
  }

  /* ---------- 导入（覆盖本地账本） ---------- */
  function importData(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var obj = JSON.parse(rd.result);
        if (!obj || typeof obj !== "object" || !Array.isArray(obj.holdings)) throw new Error("不是有效的账本备份");
        if (!confirm("导入将覆盖当前账本（持仓 / 心选 / 派息）。\n确定导入「" + file.name + "」？")) return;
        state.holdings = obj.holdings || [];
        state.watchlist = obj.watchlist || [];
        state.dividendEvents = obj.dividendEvents || [];
        state.dividendBasis = obj.dividendBasis || {};
        if (typeof obj.hideSensitive === "boolean") state.hideSensitive = obj.hideSensitive;
        saveState();
        updateEye();
        renderAll();
        toast("已导入 " + file.name);
      } catch (e) {
        toast("导入失败：" + e.message);
      }
    };
    rd.readAsText(file);
  }

  /* ---------- 行情刷新（端内拉取，跨设备自动更新） ---------- */
  /* 说明：GitHub Pages 为 HTTPS 环境，直连 qt.gtimg.cn 的 JSONP 可能因
     混合内容(CSS)拦截或接口不稳定而失败。这里采用「fetch 优先 + JSONP 回退」
     的双通道策略，并增加超时兜底与更明确的错误提示，保证刷新可见可诊断。 */
  var QUOTE_TIMEOUT_MS = 8000; /* 单次行情请求超时（毫秒） */

  function toTencentCode(code) {
    if (code.indexOf(".SZ") >= 0) return "sz" + code.slice(0, 6);
    if (code.indexOf(".SH") >= 0) return "sh" + code.slice(0, 6);
    if (code.indexOf(".HK") >= 0) return "hk" + code.replace(".HK", "");
    return code;
  }

  /* 解析腾讯接口返回的一行文本：v_sz000538="1~名称~...~价格~..." */
  function parseQuoteLine(line) {
    if (!line || line.indexOf("v_") !== 0) return null;
    try {
      var eq = line.indexOf("=");
      var code = line.slice(2, eq);                 /* v_ 之后、= 之前 */
      var s = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'));
      var p = s.split("~");
      if (p.length < 5) return null;
      var price = parseFloat(p[3]);
      if (isNaN(price) || price <= 0) return null;
      return { code: code, name: p[1], price: price };
    } catch (e) { return null; }
  }

  /* 将腾讯返回的文本写入 MARKET。
     codes 为原始股票代码（与 tcodes 按下标一一对应），返回成功条数 */
  function applyQuotes(rawText, tcodes, codes) {
    var ok = 0;
    var lines = (rawText || "").split(";");
    lines.forEach(function (line) {
      var r = parseQuoteLine(line.trim());
      if (!r) return;
      /* 按下标反查原始代码（大小写不敏感） */
      for (var i = 0; i < tcodes.length; i++) {
        if (tcodes[i].toUpperCase() === r.code.toUpperCase()) {
          var orig = codes[i];
          if (!orig) return;
          if (!MARKET.items[orig]) MARKET.items[orig] = {};
          MARKET.items[orig].price = r.price;
          if (r.name && !MARKET.items[orig].name) MARKET.items[orig].name = r.name;
          ok++;
          return;
        }
      }
    });
    return ok;
  }

  /* 通道1：fetch（需代理或接口支持 CORS）。返回 Promise<ok条数> */
  function fetchQuotesByFetch(tcodes, codes) {
    return new Promise(function (resolve, reject) {
      var base = PROXY_URL ? PROXY_URL : "https://qt.gtimg.cn/q";
      var url = base + "?q=" + tcodes.join(",");
      var ctrl = ("AbortController" in window) ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, QUOTE_TIMEOUT_MS);
      fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (res) {
          if (!res.ok) throw new Error("http " + res.status);
          return res.arrayBuffer(); /* qt.gtimg.cn 返回 GBK 字节，浏览器端解码 */
        })
        .then(function (buf) { return new TextDecoder("gbk").decode(buf); })
        .then(function (txt) {
          clearTimeout(timer);
          resolve(applyQuotes(txt, tcodes, codes));
        })
        .catch(function () { clearTimeout(timer); reject(); });
    });
  }

  /* 通道2：JSONP 回退（腾讯接口原生支持 script 注入）。返回 Promise<ok条数> */
  function fetchQuotesByJsonp(tcodes, codes) {
    return new Promise(function (resolve, reject) {
      var base = "https://qt.gtimg.cn/q"; /* JSONP 直连，留空 PROXY_URL 时可用 */
      var s = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        try { document.body.removeChild(s); } catch (e) {}
        reject();
      }, QUOTE_TIMEOUT_MS);
      s.src = base + "?q=" + tcodes.join(",");
      s.onload = function () {
        if (done) return; done = true; clearTimeout(timer);
        try { document.body.removeChild(s); } catch (e) {}
        var ok = 0;
        tcodes.forEach(function (tc, i) {
          var raw = window["v_" + tc];
          if (!raw) return;
          var p = parseFloat(raw.split("~")[3]);
          if (!isNaN(p) && p > 0) {
            var orig = codes[i];
            if (!MARKET.items[orig]) MARKET.items[orig] = {};
            MARKET.items[orig].price = p;
            ok++;
          }
        });
        resolve(ok);
      };
      s.onerror = function () {
        if (done) return; done = true; clearTimeout(timer);
        try { document.body.removeChild(s); } catch (e) {}
        reject();
      };
      document.body.appendChild(s);
    });
  }

  /* 单代码实时拉行情（用于新增持仓时自动带出名称+股价）。优先用已刷新的 MARKET，
     缺失则临时拉一次。返回 Promise，resolve 后回填表单。 */
  function fetchSingleQuote(code) {
    return new Promise(function (resolve) {
      var it = MARKET.items && MARKET.items[code];
      if (it && it.name && it.price) { resolve(it); return; }
      var tcs = [toTencentCode(code)];
      var attempt;
      if (PROXY_URL) {
        attempt = fetchQuotesByFetch(tcs, [code])
          .then(function () { resolve(MARKET.items[code] || null); })
          .catch(function () { return null; });
      } else {
        attempt = fetchQuotesByJsonp(tcs, [code])
          .then(function () { resolve(MARKET.items[code] || null); })
          .catch(function () { return null; });
      }
      /* JSONP 路径 resolve 时机不同，上面 then 已处理；fetch 失败也 resolve(null) */
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(function () { resolve(MARKET.items[code] || null); });
      }
    });
  }

  function refreshPrices() {
    var codes = (state.holdings || []).map(function (h) { return h.code; })
      .concat((state.watchlist || []).map(function (w) { return w.code; }))
      .filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    if (!codes.length) { toast("暂无可刷新的标的"); return; }
    var tcodes = codes.map(toTencentCode);

    /* 默认走 JSONP（零部署最稳）；若已配置代理则 fetch 优先，两者互为回退 */
    var attempt;
    if (PROXY_URL) {
      attempt = fetchQuotesByFetch(tcodes, codes)
        .catch(function () { return fetchQuotesByJsonp(tcodes, codes).catch(function () { return -1; }); });
    } else {
      attempt = fetchQuotesByJsonp(tcodes, codes)
        .catch(function () { return fetchQuotesByFetch(tcodes, codes).catch(function () { return -1; }); });
    }

    attempt.then(function (ok) {
      if (ok === -1) {
        toast("刷新失败：请检查网络或配置行情代理");
        return;
      }
      if (ok > 0) {
        MARKET.updatedAt = new Date().toISOString();
        try { localStorage.setItem(LS_MARKET_KEY, JSON.stringify({ items: MARKET.items, updatedAt: MARKET.updatedAt })); } catch (e) {}
      }
      renderAll();
      toast(ok > 0 ? ("已刷新 " + ok + " 只行情") : "未获取到行情，请稍后重试");
    });
  }

  /* ---------- 分红公告自动抓取 ---------- */
  /* A股（东方财富 RPT_SHAREBONUS_DET，JSONP 零部署）：含「税前每股分红(PRETAX_BONUS_RMB，每10股)」与「除权除息日」。
     抓到后回填 dividendBasis 并自动建收息日历事件。
     港股(.HK)：纯前端直连腾讯港股K线接口（web.ifzq.gtimg.cn 自带 CORS，零部署），
     解析 FHcontent 派息记录按年度归并返回，仅回填 dividendBasis（金额港元、currency="HKD"），
     不建收息日历事件（除净日口径不同）；渲染时按 FX 折算人民币显示。 */
  var DIVIDEND_TIMEOUT_MS = 8000; /* 单只分红请求超时（毫秒） */

  /* A股分红抓取：默认东财 JSONP 直连（零部署、绕过 CORS）。
     注意：东财 RPT_SHAREBONUS_DET 只含年报方案，漏中期分红（如云南白药一年派两次会偏低）。
     若配置了可用的 PROXY_URL（Worker 代理），则优先走新浪（含中期+年报全量、对齐腾讯股息率）。
     返回 [{perShare, exDate, fy, note}]（每股、含年内多次）。 */
  function fetchDividendBasis(code) {
    var emCode = code.replace(/\.(SZ|SH|HK)$/i, "");
    if (PROXY_URL) return fetchSinaDividend(emCode);
    return fetchEmDividend(emCode);
  }

  /* JSONP 通用工具：script 注入绕过 CORS。东财 datacenter 支持 &callback= 参数。
     resolve(JSON对象)；超时/脚本错误 → reject。 */
  var _jsonpSeq = 0;
  function jsonpGet(url, cbName, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var name = cbName || ("_divCb" + (++_jsonpSeq));
      var s = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        cleanup(); reject(new Error("jsonp timeout"));
      }, timeoutMs || DIVIDEND_TIMEOUT_MS);
      window[name] = function (data) {
        if (done) return; done = true;
        clearTimeout(timer); cleanup(); resolve(data);
      };
      function cleanup() {
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
      }
      s.onerror = function () {
        if (done) return; done = true;
        clearTimeout(timer); cleanup(); reject(new Error("jsonp error"));
      };
      s.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "callback=" + name;
      document.body.appendChild(s);
    });
  }

  /* 东财 JSONP 直连（零部署）。仅年报方案（RPT_SHAREBONUS_DET 无中期）。 */
  function fetchEmDividend(emCode) {
    var url = "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter="
      + encodeURIComponent('(SECURITY_CODE="' + emCode + '")')
      + "&pageSize=8&sortColumns=PLAN_NOTICE_DATE&sortTypes=-1&source=WEB&client=WEB";
    return jsonpGet(url)
      .then(function (j) {
        var rows = (j && j.result && j.result.data) || [];
        var byYear = {};
        for (var i = 0; i < rows.length; i++) {
          var d = rows[i];
          var ex = (d.EX_DIVIDEND_DATE || "").slice(0, 10);
          var rep = (d.REPORT_DATE || "").slice(0, 10);
          if (!(d.PRETAX_BONUS_RMB != null && parseFloat(d.PRETAX_BONUS_RMB) > 0
            && /实施|派发|除权/.test(d.ASSIGN_PROGRESS || ""))) continue;
          var y = /^\d{4}/.test(rep) ? rep.slice(0, 4)
            : (/^\d{4}/.test(d.PLAN_NOTICE_DATE || "") ? (d.PLAN_NOTICE_DATE + "").slice(0, 4)
              : (ex.slice(0, 4) || ""));
          if (!/^\d{4}$/.test(y)) continue;
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push({
            perShare: parseFloat(d.PRETAX_BONUS_RMB) / 10,
            exDate: ex, fy: y,
            note: (d.IMPL_PLAN_PROFILE || "").replace(/\s*\(.*\)/, "") || "分红"
          });
        }
        var yrs = Object.keys(byYear);
        if (!yrs.length) return null;
        var maxYr = yrs.reduce(function (a, c) { return c > a ? c : a; });
        return byYear[maxYr];
      })
      .catch(function () { return null; });
  }

  /* 新浪分红（经 PROXY_URL 代理转发 money.finance.sina.com.cn，含中期+年报，与腾讯同源）。
     新浪接口无 CORS 头，浏览器端必须经代理；仅返回 HTML，需 DOMParser 解析。 */
  function fetchSinaDividend(emCode) {
    var url = PROXY_URL + "/sina-dividend?code=" + emCode; /* 经 Worker 代理转发新浪（GBK 字节） */
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DIVIDEND_TIMEOUT_MS);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.arrayBuffer(); /* Worker 原样转发 GBK 字节，浏览器端用 GBK 解码（浏览器支持） */
      })
      .then(function (buf) { return new TextDecoder("gbk").decode(buf); })
      .then(function (html) { return parseSinaDividendHtml(html); })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* 解析新浪分红 HTML 表格：列 = [公告日, 送股, 转增, 每10股派息(现金), 进度, 除权日, 股权登记日, ...]
     仅取「已实施」且含现金派息的记录；perShare = 每10股派息 ÷ 10（送股/转增不计入股息率）。 */
  function parseSinaDividendHtml(html) {
    if (!html) return null;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var rows = doc.querySelectorAll("table tr");
    var out = [];
    rows.forEach(function (tr) {
      var tds = tr.querySelectorAll("td");
      if (tds.length < 6) return;
      var ann = (tds[0].textContent || "").trim();
      var per10 = parseFloat((tds[3].textContent || "").trim());
      var prog = (tds[4].textContent || "").trim();
      var ex = (tds[5].textContent || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ex) || isNaN(per10) || per10 <= 0 || !/实施/.test(prog)) return;
      var fy = ex.slice(0, 4);
      out.push({ perShare: per10 / 10, exDate: ex, fy: fy, note: "分红(新浪)" });
    });
    return out.length ? out : null;
  }

  /* 港股分红：纯前端直连腾讯港股K线接口（web.ifzq.gtimg.cn 自带 CORS，ACAO=*），无需代理。
     腾讯K线第7字段(索引6)带除权除息对象 FHcontent(派息内容)+cqr(除净日)。
     按除净日年份归并港元值，返回最近年度 [{ fy, perShare(每股合计港元), exDate, note }]。
     金额已是「每股」，无需 ÷10。无现金派息返回 null。 */
  function fetchHKDividendBasis(code) {
    var hk = code.replace(/\.HK$/i, "");
    var hkCode = "hk" + hk;
    var url = "https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get?param="
      + hkCode + ",day,2019-01-01,2026-08-25,1000,qfq";
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DIVIDEND_TIMEOUT_MS);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (j) {
        clearTimeout(timer);
        var node = j && j.data && j.data[hkCode];
        var arr = (node && (node.qfqday || node.day)) || [];
        var byYear = {};
        for (var i = 0; i < arr.length; i++) {
          var row = arr[i];
          if (!row || row.length < 7) continue;
          var fx = row[6];
          if (!fx || typeof fx !== "object" || !fx.FHcontent) continue;
          var cqr = fx.cqr || row[0] || "";
          var fy = cqr.slice(0, 4);
          if (!/^\d{4}$/.test(fy)) continue;
          var ms = fx.FHcontent.match(/[\d.]+港元/g) || [];
          var hkd = 0;
          for (var k = 0; k < ms.length; k++) hkd += parseFloat(ms[k].replace(/[^\d.]/g, "")) || 0;
          if (!(hkd > 0)) continue;
          if (!byYear[fy]) byYear[fy] = { sum: 0, exDate: "" };
          byYear[fy].sum += hkd;
          if (cqr > byYear[fy].exDate) byYear[fy].exDate = cqr;
        }
        var yrs = Object.keys(byYear);
        if (!yrs.length) return null;
        var maxYr = yrs.reduce(function (a, c) { return c > a ? c : a; });
        return [{
          fy: maxYr,
          perShare: Math.round(byYear[maxYr].sum * 10000) / 10000,
          exDate: byYear[maxYr].exDate,
          note: "港股分红(腾讯)"
        }];
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* 打开页面自动合并「同代码重复持仓」：旧版本 bug 可能已把同代码存成多条记录，
     合并为单条（lots 多仓累加、名称/市场取首个非空），避免重复计算与误删。 */
  function mergeDuplicateHoldings() {
    var hs = state.holdings || [];
    if (!hs.length) return;
    var byCode = {};
    var order = [];
    hs.forEach(function (h) {
      if (!h || !h.code) return;
      if (byCode[h.code]) {
        var dst = byCode[h.code];
        if (!dst.lots) dst.lots = [];
        if (h.lots && h.lots.length) dst.lots = dst.lots.concat(h.lots);
        if (!dst.name && h.name) dst.name = h.name;
        if (!dst.market && h.market) dst.market = h.market;
      } else {
        if (!h.lots) h.lots = [];
        byCode[h.code] = h;
        order.push(h.code);
      }
    });
    if (order.length === hs.length) return; /* 无重复，无需改动 */
    state.holdings = order.map(function (c) { return byCode[c]; });
    saveState();
  }

  /* 清空旧的自动抓取分红数据：删掉所有「非手动录入」的事件（含旧版本无标记残留 + 自动抓取事件），
     只保留用户手动登记的派息事件（manual=true）。每次打开调用，彻底重建，避免旧数据残留/叠加导致股息率虚高。 */
  function clearAutoDividendData() {
    if (state.dividendEvents) {
      state.dividendEvents = state.dividendEvents.filter(function (e) {
        return e.manual === true; /* 仅保留手动录入的事件 */
      });
    }
    if (state.dividendBasis) {
      var keep = {};
      Object.keys(state.dividendBasis).forEach(function (code) {
        var b = state.dividendBasis[code];
        if (b && b.label && /手动/.test(b.label)) keep[code] = b; /* 仅保留手动补的分红 */
      });
      state.dividendBasis = keep;
    }
    saveState();
  }

  /* 自动抓取分红：持仓 + 心选（去重，含港股）。
     A 股：东财接口（建收息事件 + 回填 dividendBasis）；
     港股：新浪接口（仅回填 dividendBasis，金额港元，按汇率折算显示；不建收息日历事件，因港股除净日口径不同）。
     心选：两类都仅回填 dividendBasis，使「当前股息率」自动有数，不建事件。 */
  function autoFetchDividends() {
    /* 合并持仓 + 心选，按 code 去重（含港股） */
    var seen = {};
    var targets = [];
    (state.holdings || []).concat(state.watchlist || []).forEach(function (it) {
      if (!it || !it.code) return;
      if (seen[it.code]) return;
      seen[it.code] = true;
      var isHolding = (state.holdings || []).some(function (h) { return h.code === it.code; });
      targets.push({ code: it.code, name: it.name || it.code, isHolding: isHolding,
        lots: it.lots });
    });
    if (!targets.length) return;
    var pending = targets.map(function (t) {
      var isHK = /HK$/i.test(t.code);
      var fetcher = isHK ? fetchHKDividendBasis : fetchDividendBasis;
      return fetcher(t.code).then(function (infos) {
        if (!infos || !infos.length) return null;
        /* 取最近财年每股合计（A股已单财年合并；港股单行已合计） */
        var annualPerShare = infos.reduce(function (s, info) {
          return s + (parseFloat(info.perShare) || 0);
        }, 0);
        if (!(annualPerShare > 0)) return null;
        /* 兜底回填 dividendBasis：心选用它算「当前股息率」；持仓也受益（无事件时有数） */
        if (!state.dividendBasis) state.dividendBasis = {};
        var cur = state.dividendBasis[t.code] || {};
        /* 不覆盖手动补的分红（label 含「手动」） */
        if (!(cur.label && /手动/.test(cur.label))) {
          state.dividendBasis[t.code] = {
            perShare: cur.perShare != null ? Math.max(cur.perShare, annualPerShare) : annualPerShare,
            currency: isHK ? "HKD" : (cur.currency || "CNY"),
            label: cur.label || (t.name + (isHK ? " 港股分红(新浪)" : " 自动抓取分红兜底"))
          };
        }
        /* 仅持仓的 A 股才建收息事件（带股数，用于年股息/回本进度）；
           港股不建事件（除净日口径不同，且已有 dividendBasis 算年股息/股息率）。 */
        if (t.isHolding && !isHK) {
          if (!state.dividendEvents) state.dividendEvents = [];
          /* 净持股数（buy - sell），与 calcHolding 口径一致；减仓后事件股数应同步减少 */
          var shares = t.lots ? t.lots.reduce(function (s, l) {
            var sh = parseFloat(l.shares) || 0;
            return s + (l.type === "sell" ? -sh : sh);
          }, 0) : 0;
          if (shares < 0) shares = 0;
          /* 先清掉该代码所有「非手动录入」的旧事件（含旧版无标记残留/自动抓取），避免叠加 */
          state.dividendEvents = state.dividendEvents.filter(function (e) {
            return !(e.code === t.code && e.manual !== true);
          });
          /* 逐条建事件（同一除权日+代码不重复建），一年多次分红会建多条 */
          infos.forEach(function (info) {
            if (!info.exDate || !(parseFloat(info.perShare) > 0)) return;
            state.dividendEvents.push({
              code: t.code, name: t.name, exDate: info.exDate, fy: info.fy,
              perShare: info.perShare, shares: shares, note: info.note,
              auto: true /* 标记为自动抓取来源，供 clearAutoDividendData 识别清除 */
            });
          });
        }
        return t.code;
      });
    });
    Promise.all(pending).then(function (done) {
      var ok = done.filter(Boolean).length;
      if (ok > 0) { saveState(); renderAll(); toast("已自动抓分红 " + ok + " 只"); }
    });
  }

  /* ---------- 渲染全部 ---------- */
  function renderAll() {
    renderHoldings(); renderCalendar(); renderWatch();
    var u = MARKET.updatedAt || "";
    document.getElementById("updatedAt").textContent = u ? ("行情更新于 " + u.replace("T", " ").slice(0, 16)) : "行情：本地";
  }

  /* ---------- 事件 ---------- */
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      document.getElementById(t.dataset.tab).classList.add("active");
    });
  });
  document.querySelectorAll(".add-btn").forEach(function (b) {
    b.addEventListener("click", function () { openModal(b.dataset.add); });
  });
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("saveBtn").addEventListener("click", saveModal);
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", function () { document.getElementById("importFile").click(); });
  document.getElementById("syncHoldingsBtn").addEventListener("click", syncHoldingsToWatch);
  document.getElementById("importFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = "";
  });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  /* 小眼睛：屏蔽敏感数据 */
  function eyeSvg(closed) {
    var open = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>';
    var slash = closed ? '<line x1="3" y1="21" x2="21" y2="3"/>' : '';
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + open + slash + '</svg>';
  }
  function updateEye() {
    var btn = document.getElementById("eyeBtn");
    if (!btn) return;
    btn.classList.toggle("off", !!state.hideSensitive);
    btn.innerHTML = eyeSvg(state.hideSensitive);
    btn.title = state.hideSensitive ? "已屏蔽市值/成本/盈亏/回本（点击显示）" : "点击屏蔽市值/成本/盈亏/回本";
  }
  document.getElementById("eyeBtn").addEventListener("click", function () {
    state.hideSensitive = !state.hideSensitive;
    saveState(); updateEye(); renderAll();
  });

  /* 持仓列表点击（事件委托：删除 / 补分红） */
  document.getElementById("holdList").addEventListener("click", function (e) {
    /* 补分红：直接填每股分红，便于无派息记录的老持仓补全预计年息 */
    var bb = e.target.closest ? e.target.closest(".link-btn[data-basis]") : null;
    if (bb) {
      var code = bb.dataset.basis;
      var h = null;
      (state.holdings || []).forEach(function (x) { if (x.code === code) h = x; });
      var nm = h ? h.name : code;
      var cur = state.dividendBasis && state.dividendBasis[code];
      var isEdit = cur && cur.perShare != null;
      var prefill = cur && cur.perShare != null ? String(cur.perShare) : "";
      var input = prompt((isEdit ? "修改「" : "为「") + nm + "」(" + code + ") 每股年分红（元）：\n用于计算预计年股息 / 回本进度",
        prefill);
      if (input == null) return;
      var ps = parseFloat(input);
      if (isNaN(ps) || ps <= 0) { toast("输入无效，已取消"); return; }
      if (!state.dividendBasis) state.dividendBasis = {};
      cur = cur || {};
      state.dividendBasis[code] = {
        perShare: ps,
        currency: cur.currency || (code.indexOf(".HK") >= 0 ? "HKD" : "CNY"),
        label: cur.label || (nm + " 手动填分红")
      };
      saveState(); renderAll(); toast("已更新 " + nm + " 的每股分红");
      return;
    }
    /* 快速增减持股数：每点一次 ±100 股（直接调整该持仓最近一笔买入的股数） */
    var stepBtn = e.target.closest ? e.target.closest(".step-btn") : null;
    if (stepBtn) {
      var sc = stepBtn.dataset.inc || stepBtn.dataset.dec;
      var isInc = !!stepBtn.dataset.inc;
      var hh = null;
      (state.holdings || []).forEach(function (x) { if (x.code === sc) hh = x; });
      if (!hh) return;
      if (!hh.lots) hh.lots = [];
      var px = price(sc);
      if (px == null) { toast("暂无「" + (hh.name || sc) + "」的当前股价，无法按市价加减"); return; }
      /* 持股总数（用于减仓时防止变负） */
      var total = hh.lots.reduce(function (s, l) {
        var sh = parseFloat(l.shares) || 0;
        return s + (l.type === "sell" ? -sh : sh);
      }, 0);
      if (!isInc && total - 100 < 0) { toast("持股数不能为负（当前 " + total + " 股）"); return; }
      /* 新增一笔独立记录：价格=当前股价、日期=今天；买入加仓 / 卖出减仓 */
      hh.lots.push({
        type: isInc ? "buy" : "sell",
        date: localDateStr(new Date()),
        shares: 100,
        price: px,
        fee: 0
      });
      /* 同步收息日历：该代码所有「非手动录入」事件的股数改为当前净持股，
         使减仓后「今年已收」能即时减少（与 autoFetchDividends 口径一致） */
      var netShares = calcHolding(hh).shares;
      if (state.dividendEvents && netShares >= 0) {
        state.dividendEvents.forEach(function (e) {
          if (e.code === sc && e.manual !== true) e.shares = netShares;
        });
      }
      saveState(); renderAll();
      toast((isInc ? "加仓 ＋100" : "减仓 －100") + " 股（市价 " + px + "）：" + (hh.name || sc));
      return;
    }
    var b = e.target.closest ? e.target.closest(".del-btn") : null;
    if (!b) return;
    var code2 = b.dataset.del;
    var h2 = null;
    (state.holdings || []).forEach(function (x) { if (x.code === code2) h2 = x; });
    var nm2 = h2 ? h2.name : code2;
    if (confirm("确认删除持仓「" + nm2 + "」？\n（仅删除持仓，派息日历不受影响，操作不可撤销）")) {
      state.holdings = (state.holdings || []).filter(function (x) { return x.code !== code2; });
      saveState(); renderAll(); toast("已删除 " + nm2);
    }
  });

  /* 心选列表点击（事件委托：删除） */
  document.getElementById("watchList").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".del-btn") : null;
    if (!b) return;
    var code2 = b.dataset.del;
    var w2 = null;
    (state.watchlist || []).forEach(function (x) { if (x.code === code2) w2 = x; });
    var nm2 = w2 ? w2.name : code2;
    if (confirm("确认删除心选「" + nm2 + "」？\n（仅删除心选，操作不可撤销）")) {
      state.watchlist = (state.watchlist || []).filter(function (x) { return x.code !== code2; });
      saveState(); renderAll(); toast("已删除 " + nm2);
    }
  });

  /* 心选列表点击（事件委托：编辑） */
  document.getElementById("watchList").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".edit-btn") : null;
    if (!b) return;
    var code2 = b.dataset.edit;
    var w2 = null;
    (state.watchlist || []).forEach(function (x) { if (x.code === code2) w2 = x; });
    if (w2) openModal("watch", w2); /* 编辑模式：按原有信息预填 */
  });

  updateEye();
  var verTag = document.getElementById("verTag");
  if (verTag) verTag.textContent = "v" + APP_VERSION;
  mergeUserStockDB(); /* 把本机用户缓存的股票并入运行时 STOCK_DB，本地搜索可命中 */
  renderAll();
  /* 每次打开自动拉取最新行情：GitHub Pages / 手机端也能自动更新 */
  refreshPrices();
  /* 每次打开先合并同代码重复持仓（旧 bug 可能已存多条），避免重复计算/误删 */
  mergeDuplicateHoldings();
  /* 每次打开先清空旧的自动抓取分红数据（避免 localStorage 残留旧口径/旧倍率），再重新抓取 */
  clearAutoDividendData();
  /* 每次打开自动抓取分红公告，回填预计年息并建收息日历 */
  autoFetchDividends();
})();
