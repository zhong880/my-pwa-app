/**
 * 攒息账本 · 轻量行情代理（Cloudflare Worker）
 * ------------------------------------------------------------------
 * 用途：把腾讯 qt.gtimg.cn 的行情接口加上 CORS 头，供 PWA 用 fetch() 调用。
 * 注意：默认 app.js 用 JSONP 直连 qt.gtimg.cn，零部署即可跨域，**无需此代理**。
 *       只有当你想把 PROXY_URL 指向一个干净 fetch 端点时才需要部署它。
 *
 * 部署（免费）：
 *   1. 登录 https://dash.cloudflare.com → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘贴进编辑器，保存并部署，得到 https://xxx.workers.dev
 *   3. 在 app.js 顶部把 PROXY_URL 改成你的地址，例如：
 *        var PROXY_URL = "https://my-quote-proxy.workers.dev";
 *   4. 调用方式：GET https://xxx.workers.dev/?q=sz000538,sh601318,hk00700
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (!q) return new Response("missing ?q=", { status: 400 });

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
