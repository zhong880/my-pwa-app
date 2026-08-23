/**
 * 攒息账本 · 轻量代理（Cloudflare Worker）
 * ------------------------------------------------------------------
 * 用途：给 PWA 的两个数据接口加 CORS 头，支持 fetch() 跨域调用。
 *   - /?q=...           转发腾讯 qt.gtimg.cn 行情（默认 app.js 用 JSONP 直连，无需此代理）
 *   - /em-dividend?code= 转发东方财富分红明细 RPT_SHAREBONUS_DET（自动抓取分红公告用）
 *
 * 部署（免费）：
 *   1. 登录 https://dash.cloudflare.com → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘贴进编辑器，保存并部署，得到 https://xxx.workers.dev
 *   3. 在 app.js 顶部把 PROXY_URL 改成你的地址，例如：
 *        var PROXY_URL = "https://my-proxy.workers.dev";
 *   4. 行情调用：GET https://xxx.workers.dev/?q=sz000538,sh601318
 *      分红调用：GET https://xxx.workers.dev/em-dividend?code=000538
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    /* 路径一：东方财富分红明细（RPT_SHAREBONUS_DET） */
    if (url.pathname === "/em-dividend") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("missing ?code=", { status: 400 });
      const filter = encodeURIComponent('(SECURITY_CODE="' + code + '")');
      const upstream = "https://datacenter-web.eastmoney.com/api/data/v1/get"
        + "?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=" + filter
        + "&pageSize=5&sortColumns=PLAN_NOTICE_DATE&sortTypes=-1&source=WEB&client=WEB";
      const resp = await fetch(upstream, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await resp.text();
      return new Response(text, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
      });
    }

    /* 路径二：腾讯行情（默认 JSONP 直连即可，此处供 fetch 通道） */
    const q = url.searchParams.get("q");
    if (!q) return new Response("missing ?q= or /em-dividend?code=", { status: 400 });
    const upstream = "https://qt.gtimg.cn/q=" + encodeURIComponent(q);
    const resp = await fetch(upstream, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await resp.text();
    return new Response(text, {
      headers: {
        "content-type": "application/javascript; charset=gbk",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  },
};
