/**
 * 攒息账本 · 轻量代理（Cloudflare Worker）
 * ------------------------------------------------------------------
 * 用途：给 PWA 的数据接口加 CORS 头，支持浏览器 fetch() 跨域调用。
 *   - /sina-dividend?code=  转发新浪 A 股分红页（含中期+年报，与腾讯自选股同源）
 *   - /sina-hk?code=        腾讯港股K线接口，解析派息记录返回 JSON（新浪港股分红页已失效 404）
 *   - /em-dividend?code=    转发东方财富 RPT_SHAREBONUS_DET 分红明细
 *   - /?q=...               转发腾讯 qt.gtimg.cn 行情（默认 JSONP 直连，无需此代理）
 *
 * ⚠️ 编码说明：
 *   Cloudflare Workers 的 TextDecoder 只支持 UTF-8，不支持 GBK/gb2312。
 *   因此 /sina-dividend 原样转发新浪返回的 GBK 字节（content-type 标 charset=gbk），
 *   由【浏览器端】用 new TextDecoder("gbk") 解码（浏览器支持 GBK）。
 *   不要试图在 Worker 里 new TextDecoder("gbk")，那会抛异常导致 502。
 *
 * 部署（免费）：
 *   1. 登录 https://dash.cloudflare.com → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘贴进编辑器，保存并部署，得到 https://xxx.workers.dev
 *   3. 在 app.js 顶部把 PROXY_URL 改成你的地址，例如：
 *        var PROXY_URL = "https://my-proxy.workers.dev";
 *   4. 前端调用：GET https://xxx.workers.dev/sina-dividend?code=000538
 *                GET https://xxx.workers.dev/sina-hk?code=00700
 *
 * 注意：workers.dev 在部分国内网络可能被墙/抖动；若打不开，需绑自有域名。
 */

const CACHE_TTL = 60 * 60 * 24; // 1 天

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }

    try {
      /* A 股分红：新浪分红页（含中期+年报，与腾讯同源）。
         注意：Workers 的 TextDecoder 不支持 GBK，故此处【原样转发 GBK 字节】，
         浏览器端 fetch 后自行 new TextDecoder("gbk").decode(arrayBuffer)。 */
      if (url.pathname === "/sina-dividend") {
        const code = url.searchParams.get("code");
        if (!code || !/^\d{4,6}$/.test(code)) {
          return new Response("missing/bad ?code=", { status: 400 });
        }
        return await proxyBytes(
          "https://money.finance.sina.com.cn/corp/go.php/vISSUE_ShareBonus/stockid/" +
            code + ".phtml",
          { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn/" },
          "text/html; charset=gbk"
        );
      }

      /* 港股分红：腾讯港股K线接口（自带除权除息/派息记录 FHcontent+cqr，JSON 格式，UTF-8）
         解析出全部派息记录，按财年(除净日年份)归并港元值，返回最近一个年度：
         [{ fy, perShare(每股合计港元), exDate(最新除净日), note }] */
      if (url.pathname === "/sina-hk") {
        const code = url.searchParams.get("code");
        if (!code || !/^\d{4,6}$/.test(code)) {
          return new Response("missing/bad ?code=", { status: 400 });
        }
        const hkCode = "hk" + code;
        const upstream =
          "https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get?param=" +
          hkCode + ",day,2019-01-01,2026-08-25,1000,qfq";
        const res = await fetch(upstream, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
        if (!res.ok) return new Response("upstream " + res.status, { status: 502 });
        const j = await res.json();
        const node = j && j.data && j.data[hkCode];
        const arr = (node && (node.qfqday || node.day)) || [];
        /* 遍历K线，提取除权对象(索引6)中 FHcontent 非空的派息记录 */
        const byYear = {};
        for (const row of arr) {
          if (!row || row.length < 7) continue;
          const fx = row[6];
          if (!fx || typeof fx !== "object" || !fx.FHcontent) continue;
          const cqr = fx.cqr || row[0] || "";
          const fy = cqr.slice(0, 4);
          if (!/^\d{4}$/.test(fy)) continue;
          /* 提取全部「X.XX港元」值累加（同记录可能含中期+末期多笔） */
          const ms = fx.FHcontent.match(/[\d.]+港元/g) || [];
          let hkd = 0;
          for (const s of ms) hkd += parseFloat(s.replace(/[^\d.]/g, "")) || 0;
          if (!(hkd > 0)) continue;
          if (!byYear[fy]) byYear[fy] = { sum: 0, exDate: "" };
          byYear[fy].sum += hkd;
          if (cqr > byYear[fy].exDate) byYear[fy].exDate = cqr;
        }
        const yrs = Object.keys(byYear);
        if (!yrs.length) {
          return new Response("[]", {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*",
              "cache-control": "max-age=86400",
            },
          });
        }
        const maxYr = yrs.reduce((a, c) => (c > a ? c : a));
        const out = [{
          fy: maxYr,
          perShare: Math.round(byYear[maxYr].sum * 10000) / 10000,
          exDate: byYear[maxYr].exDate,
          note: "港股分红(腾讯)",
        }];
        return new Response(JSON.stringify(out), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "max-age=86400",
          },
        });
      }

      /* 东方财富分红明细（可选，UTF-8 JSON） */
      if (url.pathname === "/em-dividend") {
        const code = url.searchParams.get("code");
        if (!code || !/^\d{4,6}$/.test(code)) {
          return new Response("missing/bad ?code=", { status: 400 });
        }
        const filter = encodeURIComponent('(SECURITY_CODE="' + code + '")');
        const upstream =
          "https://datacenter-web.eastmoney.com/api/data/v1/get" +
          "?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=" + filter +
          "&pageSize=5&sortColumns=PLAN_NOTICE_DATE&sortTypes=-1&source=WEB&client=WEB";
        return await proxyBytes(
          upstream,
          { "User-Agent": "Mozilla/5.0" },
          "application/json; charset=utf-8",
          "no-store"
        );
      }

      /* 腾讯行情（默认 JSONP 直连即可，此处供 fetch 通道）。
         注意：qt.gtimg.cn 返回 GBK，但 Workers 不能转码，故原样返回 GBK 字节，
         浏览器端用 new TextDecoder("gbk") 解码。 */
      const q = url.searchParams.get("q");
      if (!q) {
        return new Response(
          "usage: /sina-dividend?code=000538 | /sina-hk?code=00700 | /em-dividend?code=000538 | /?q=sz000538",
          { status: 400 }
        );
      }
      return await proxyBytes(
        "https://qt.gtimg.cn/q=" + encodeURIComponent(q),
        { "User-Agent": "Mozilla/5.0" },
        "application/javascript; charset=gbk"
      );
    } catch (e) {
      return new Response("proxy error: " + e.message, { status: 502 });
    }
  },
};

/* 原样转发字节（不做字符集转换）。Workers 的 TextDecoder 不支持 GBK，
   所以 GBK 内容由浏览器端解码；UTF-8 内容浏览器端 res.text() 直接可用。 */
async function proxyBytes(targetUrl, headers, contentType, cacheControl) {
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: "GET" });

  if (!cacheControl) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set("access-control-allow-origin", "*");
      h.set("x-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  }

  const upstream = await fetch(targetUrl, { headers, redirect: "follow" });
  if (!upstream.ok) {
    return new Response("upstream " + upstream.status, { status: 502 });
  }

  const body = await upstream.arrayBuffer(); /* 原样保留字节 */
  const h = new Headers();
  h.set("content-type", contentType);
  h.set("access-control-allow-origin", "*");
  h.set("x-cache", "MISS");
  h.set("cache-control", cacheControl || "max-age=" + CACHE_TTL);

  const resp = new Response(body, { status: 200, headers: h });
  if (!cacheControl) await cache.put(cacheKey, resp.clone());
  return resp;
}
