/* 攒息账本 · 示例种子数据（仅用于演示 / 首次打开，无真实持仓）
   你的真实账本：通过页面「导入」功能恢复备份 JSON，或编辑本地 seed.js
   （seed.js 已被 .gitignore，不会上传到仓库）。 */
window.SEED_EXAMPLE = {
  meta: { fx: { HKD_CNY: 0.92 } },
  holdings: [
    {
      code: "000538.SZ", name: "云南白药", market: "A",
      lots: [{ type: "buy", date: "2024-01-01", shares: 1000, price: 52.30, fee: 0 }]
    }
  ],
  watchlist: [
    { code: "601318.SH", name: "中国平安", market: "A", targetPrice: 55, targetYield: 5.5 }
  ],
  dividendEvents: [],
  dividendBasis: {
    "000538.SZ": { perShare: 2.602, currency: "CNY", label: "示例：2025年度10派15.83 + 特别10派10.19" }
  }
};
