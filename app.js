/* 攒息账本 · 前端逻辑（原生 JS，无依赖） */
(function () {
  "use strict";

  var LS_KEY = "jar_v2";
  var SEED = window.SEED || window.SEED_EXAMPLE || {};
  var LS_MARKET_KEY = "jar_market_v1";
  var PROXY_URL = ""; /* 可选：填 Cloudflare Worker 代理地址则用 fetch；留空则用 JSONP 直连 qt.gtimg.cn（零部署即可跨域） */
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
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      holdings: deepCopy(SEED.holdings || []),
      watchlist: deepCopy(SEED.watchlist || []),
      dividendEvents: deepCopy(SEED.dividendEvents || []),
      hideSensitive: false
    };
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();

  /* ---------- 工具 ---------- */
  function sym(code) {
    if (!code) return "¥";
    if (code.indexOf(".HK") >= 0) return "HK$";
    var b = SEED.dividendBasis && SEED.dividendBasis[code];
    if (b && b.currency === "HKD") return "HK$";
    return "¥";
  }
  function price(code) {
    var it = MARKET.items && MARKET.items[code];
    return it ? it.price : null;
  }
  function basis(code) {
    return (SEED.dividendBasis && SEED.dividendBasis[code]) || null;
  }
  function money(n, code) {
    if (n == null || isNaN(n)) return "—";
    var s = sym(code);
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
    var yld = (b && p) ? b.perShare / p * 100 : null;
    var annualDiv = (b) ? b.perShare * shares : null;
    // 累计收息（来自已登记派息事件）
    var cum = 0;
    var todayStr = new Date().toISOString().slice(0, 10);
    (state.dividendEvents || []).forEach(function (e) {
      if (e.code === h.code && (!e.exDate || e.exDate <= todayStr)) cum += (e.perShare || 0) * (e.shares || 0);
    });
    var payback = (cost) ? cum / cost * 100 : null;
    return { shares: shares, cost: cost, mv: mv, profit: profit, profitPct: profitPct,
             yield: yld, annualDiv: annualDiv, cumDiv: cum, payback: payback };
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
        item("持股", c.shares + " 股") +
        item("现价", price(h.code) != null ? money(price(h.code), h.code) : "—") +
        item("成本", sen(money(c.cost, h.code))) +
        item("市值", c.mv != null ? sen(money(c.mv, h.code)) : "—") +
        item("盈亏", state.hideSensitive ? "••••" : profitTxt, state.hideSensitive ? "" : cls(c.profit)) +
        item("预计年股息", c.annualDiv != null ? money(c.annualDiv, h.code) : "—") +
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

  /* ---------- 渲染：收息日历 ---------- */
  function renderCalendar() {
    var evs = state.dividendEvents || [];
    var total = 0, thisYear = 0;
    var months = new Array(12).fill(0);
    var yr = new Date().getFullYear();
    evs.forEach(function (e) {
      var amt = (e.perShare || 0) * (e.shares || 0);
      total += amt;
      if (e.exDate && e.exDate.indexOf(yr) === 0) thisYear += amt;
      var m = e.exDate ? parseInt(e.exDate.slice(5, 7), 10) : 0;
      if (m >= 1 && m <= 12) months[m - 1] += amt;
    });
    var maxM = Math.max.apply(null, months.concat([1]));
    var sm = document.getElementById("calSummary");
    sm.innerHTML =
      cell("已登记派息", money(total)) +
      cell("今年派息", money(thisYear)) +
      cell("派息笔数", evs.length + " 笔") +
      cell("最近更新", (MARKET.updatedAt || "").slice(0, 10));

    var flow = document.getElementById("flowChart");
    flow.innerHTML = "";
    var names = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    months.forEach(function (v, i) {
      var col = document.createElement("div");
      col.className = "col";
      var h = Math.round(v / maxM * 90);
      col.innerHTML = '<div class="amt">' + (v ? Math.round(v) : "") + '</div>' +
        '<div class="bar" style="height:' + h + 'px"></div>' +
        '<div class="lab">' + names[i] + '</div>';
      flow.appendChild(col);
    });

    var list = document.getElementById("eventList");
    list.innerHTML = "";
    evs.slice().sort(function (a, b) { return (a.exDate < b.exDate ? 1 : -1); }).forEach(function (e) {
      var amt = (e.perShare || 0) * (e.shares || 0);
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<div class="line1"><span><span class="name">' + e.name + '</span>' +
        '<span class="code">' + e.exDate + '</span></span>' +
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
    ws.forEach(function (w) {
      var p = price(w.code);
      var b = basis(w.code);
      var yld = (b && p) ? b.perShare / p * 100 : null;
      var toPrice = (p != null && w.targetPrice) ? p <= w.targetPrice : false;
      var toYield = (yld != null && w.targetYield) ? yld >= w.targetYield : false;
      var tag = "";
      if (toPrice) tag += '<span class="tag buy">≤目标价 可关注</span>';
      if (toYield) tag += '<span class="tag high">高息区</span>';
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<div class="line1"><span><span class="name">' + w.name + '</span>' +
        '<span class="code">' + w.code + '</span>' + (w.group ? '<span class="tag">' + w.group + '</span>' : '') + '</span>' +
        (yld != null ? '<span class="yield-badge">' + yld.toFixed(2) + '%</span>' : '<span class="yield-badge">—</span>') +
        '</div>' +
        '<div class="grid2">' +
        item("现价", p != null ? money(p, w.code) : "—") +
        item("目标价", w.targetPrice ? money(w.targetPrice, w.code) : "—") +
        item("当前股息率", yld != null ? pct(yld) : "—") +
        item("目标股息率", w.targetYield ? w.targetYield + "%" : "—") +
        '</div>' + (tag ? '<div style="margin-top:8px">' + tag + '</div>' : '');
      list.appendChild(row);
    });
    if (!ws.length) list.innerHTML = '<div class="row code">暂无心选，点下方“新增心选”</div>';
  }

  /* ---------- 弹窗表单 ---------- */
  var modal = document.getElementById("modal");
  var form = document.getElementById("modalForm");
  var FORM_DEFS = {
    holding: {
      title: "新增持仓（买入）",
      fields: [
        { k: "code", label: "代码", ph: "000538.SZ / 00700.HK", req: true },
        { k: "name", label: "名称", ph: "云南白药", req: true },
        { k: "market", label: "市场", type: "select", opts: ["A", "HK", "B"], def: "A" },
        { k: "date", label: "买入日期", ph: "2024-03-01", req: true },
        { k: "shares", label: "股数", ph: "1000", req: true, num: true },
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
        { k: "code", label: "代码", ph: "601318.SH", req: true },
        { k: "name", label: "名称", ph: "中国平安", req: true },
        { k: "market", label: "市场", type: "select", opts: ["A", "HK", "B"], def: "A" },
        { k: "group", label: "分组", ph: "保险" },
        { k: "targetPrice", label: "目标价", ph: "55", num: true },
        { k: "targetYield", label: "目标股息率(%)", ph: "5.5", num: true }
      ]
    }
  };
  var curType = null;

  function openModal(type) {
    curType = type;
    var def = FORM_DEFS[type];
    document.getElementById("modalTitle").textContent = def.title;
    form.innerHTML = "";
    def.fields.forEach(function (f) {
      var div = document.createElement("div");
      div.className = "field";
      var lab = '<label>' + f.label + (f.req ? " *" : "") + '</label>';
      var ctrl;
      if (f.type === "select") {
        ctrl = '<select name="' + f.k + '">' + f.opts.map(function (o) {
          return '<option' + (o === f.def ? " selected" : "") + '>' + o + '</option>';
        }).join("") + '</select>';
      } else {
        ctrl = '<input name="' + f.k + '" placeholder="' + (f.ph || "") + '"' +
          (f.num ? ' inputmode="decimal"' : '') + ' value="' + (f.def || "") + '" />';
      }
      div.innerHTML = lab + ctrl;
      form.appendChild(div);
    });
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
      obj.lots = [{ type: "buy", date: obj.date, shares: obj.shares, price: obj.price, fee: obj.fee || 0 }];
      delete obj.date; delete obj.shares; delete obj.price; delete obj.fee;
      state.holdings.push(obj);
    } else if (curType === "event") {
      state.dividendEvents.push(obj);
    } else if (curType === "watch") {
      state.watchlist.push(obj);
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
  function toTencentCode(code) {
    if (code.indexOf(".SZ") >= 0) return "sz" + code.slice(0, 6);
    if (code.indexOf(".SH") >= 0) return "sh" + code.slice(0, 6);
    if (code.indexOf(".HK") >= 0) return "hk" + code.replace(".HK", "");
    return code;
  }
  function fetchQuotes(tcodes, onDone, onErr) {
    var base = PROXY_URL ? PROXY_URL : "https://qt.gtimg.cn/q";
    var s = document.createElement("script");
    s.src = base + "?q=" + tcodes.join(",");
    s.onload = function () { onDone(); try { document.body.removeChild(s); } catch (e) {} };
    s.onerror = function () { if (onErr) onErr(); try { document.body.removeChild(s); } catch (e) {} };
    document.body.appendChild(s);
  }
  function refreshPrices() {
    var codes = (state.holdings || []).map(function (h) { return h.code; })
      .concat((state.watchlist || []).map(function (w) { return w.code; }))
      .filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    if (!codes.length) { toast("暂无可刷新的标的"); return; }
    var btn = document.getElementById("refreshBtn");
    if (btn) btn.classList.add("loading");
    fetchQuotes(codes.map(toTencentCode), function () {
      var ok = 0;
      codes.forEach(function (code) {
        var raw = window["v_" + toTencentCode(code)];
        if (!raw) return;
        var p = parseFloat(raw.split("~")[3]);
        if (!isNaN(p) && p > 0) {
          if (!MARKET.items[code]) MARKET.items[code] = {};
          MARKET.items[code].price = p;
          ok++;
        }
      });
      MARKET.updatedAt = new Date().toISOString();
      try { localStorage.setItem(LS_MARKET_KEY, JSON.stringify(MARKET)); } catch (e) {}
      if (btn) btn.classList.remove("loading");
      renderAll();
      toast(ok ? ("已刷新 " + ok + " 只行情") : "未获取到行情");
    }, function () {
      if (btn) btn.classList.remove("loading");
      toast("刷新失败，请检查网络");
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

  /* 持仓删除（事件委托） */
  document.getElementById("holdList").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".del-btn") : null;
    if (!b) return;
    var code = b.dataset.del;
    var h = null;
    (state.holdings || []).forEach(function (x) { if (x.code === code) h = x; });
    var nm = h ? h.name : code;
    if (confirm("确认删除持仓「" + nm + "」？\n（仅删除持仓，派息日历不受影响，操作不可撤销）")) {
      state.holdings = (state.holdings || []).filter(function (x) { return x.code !== code; });
      saveState(); renderAll(); toast("已删除 " + nm);
    }
  });

  updateEye();
  renderAll();
  /* 每次打开自动拉取最新行情：GitHub Pages / 手机端也能自动更新 */
  refreshPrices();
  document.getElementById("refreshBtn").addEventListener("click", refreshPrices);
})();
