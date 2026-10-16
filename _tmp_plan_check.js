/* 临时校验：确认「预分红公告」事件不会污染股息率口径计算（latestFyPerShare / ttmPerShareOf） */
function latestFyPerShare(evs, today) {
  var latestFy = null;
  (evs || []).forEach(function (e) {
    if (!e.isAnnual || !e.fy || !e.exDate || e.exDate > today) return;
    if (latestFy == null || String(e.fy) > String(latestFy)) latestFy = String(e.fy);
  });
  if (latestFy == null) return null;
  var sum = 0, has = false;
  (evs || []).forEach(function (e) {
    if (String(e.fy) !== latestFy || !e.exDate || e.exDate > today) return;
    sum += parseFloat(e.perShare) || 0; has = true;
  });
  return has ? sum : null;
}
function ttmPerShareOf(evs, today) {
  var cut = new Date(today);
  cut.setFullYear(cut.getFullYear() - 1);
  var cutoff = cut.toISOString().slice(0, 10);
  var annualFys = [];
  (evs || []).forEach(function (e) {
    if (!e.isAnnual || !e.exDate || e.exDate < cutoff || e.exDate > today) return;
    if (e.fy && annualFys.indexOf(e.fy) < 0) annualFys.push(e.fy);
  });
  var dropFy = annualFys.length >= 2 ? annualFys.sort()[0] : null;
  var sum = 0, has = false;
  (evs || []).forEach(function (e) {
    if (!(e.exDate && e.exDate >= cutoff && e.exDate <= today)) return;
    if (dropFy && e.isAnnual && e.fy === dropFy) return;
    sum += parseFloat(e.perShare || 0); has = true;
  });
  return has ? sum : null;
}

var today = "2026-10-16";
/* 已实施 3 笔 + 2 个预分红公告（一个无除权日、一个除权日在未来） */
var evs = [
  { fy: "2025", exDate: "2025-10-24", perShare: 0.95 },
  { fy: "2025", exDate: "2026-06-10", perShare: 1.75, isAnnual: true },
  { fy: "2026", exDate: "2026-09-10", perShare: 0.98 },
  { fy: "2026", exDate: "", perShare: 1.20, plan: true, planDate: "2026-10-10" },
  { fy: "2026", exDate: "2026-11-20", perShare: 0.50, plan: true, planDate: "2026-10-12" }
];
var a = latestFyPerShare(evs, today);
var b = ttmPerShareOf(evs, today);

/* 期望：加预案前后完全一致（2.70 / 3.68），说明预分红公告不影响股息率 */
console.log("含预案 静态财年口径 = " + a.toFixed(2) + "（期望 2.70）");
console.log("含预案 TTM 口径     = " + b.toFixed(2) + "（期望 3.68）");

/* 同时模拟收息日历的三分类判定 */
var today2 = "2026-10-16";
evs.forEach(function (e) {
  var passed = e.exDate && e.exDate <= today2;
  var tag = passed ? "已收" : (e.plan ? "预案" : "预计");
  var dateTxt = e.exDate || (e.planDate ? ("公告 " + e.planDate) : "待定");
  console.log("  日历项 -> " + dateTxt + "  每股 " + e.perShare + "  标签=" + tag);
});
