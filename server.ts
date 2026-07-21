import express from "express";
import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  pool,
  initDb,
  rowToConfig,
  rowToTransaction,
  rowToUser,
  rowToItinerary,
  rowToStop,
  rowToScam,
  rowToCustomItinerary,
  upsertScam,
} from "./db";

// Safety layer (added in 2026-07).
import { guardInput } from "./src/safety/inputGuard";
import { guardOutput } from "./src/safety/outputGuard";
import { SAFETY_GUARDRAILS } from "./src/safety/safetyPrompt";
import { refusal, pickLocale } from "./src/safety/refusalResponses";
import { deriveScenes } from "./src/safety/sceneDerivation";

dotenv.config();

const app = express();
// Security headers (Helmet). Default CSP is fine for an API server; we
// also lower the default cross-origin policy for /api/* responses.
app.use(
  helmet({
    contentSecurityPolicy: false, // SPA static assets vary per route
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
// Body parser — bounded JSON to avoid memory-DoS via giant payloads.
app.use(express.json({ limit: "1mb" }));

const PORT = 3000;

// ---------------------------------------------------------------------------
// Rate limiters (added 2026-07)
//   - chatRateLimiter: applied to /api/chat, keyed by user id then IP.
//     Default: 20 requests / minute / user. Easy to tune via env.
//   - customizeRateLimiter: tighter because the response is JSON-shaped and
//     each call is more expensive (call 1 every 12 seconds on average).
// ---------------------------------------------------------------------------
const chatRateLimiter = rateLimit({
  windowMs: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS || "60000", 10),
  limit: parseInt(process.env.CHAT_RATE_LIMIT_MAX || "20", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // req.user is populated by requireAuth middleware. If for some reason
    // a non-auth route ends up here, fall back to IP.
    return String(req?.user?.id ?? req?.ip ?? "anon");
  },
  handler: (req: any, res: any) => {
    const locale = pickLocale(req?.body?.sourceMode);
    res.status(429).json({ reply: refusal("rateLimited", locale), _guard: "rate-limited" });
  },
});

const customizeRateLimiter = rateLimit({
  windowMs: parseInt(process.env.CUSTOMIZE_RATE_LIMIT_WINDOW_MS || "60000", 10),
  limit: parseInt(process.env.CUSTOMIZE_RATE_LIMIT_MAX || "5", 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: any) => String(req?.user?.id ?? req?.ip ?? "anon"),
  handler: (req: any, res: any) => {
    const locale = pickLocale(req?.body?.sourceMode);
    res.status(429).json({ reply: refusal("rateLimited", locale), _guard: "rate-limited" });
  },
});

// MiniMax exposes an OpenAI-compatible Chat Completions endpoint
const apiKey = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-Text-01";
let ai: OpenAI | null = null;

if (apiKey) {
  ai = new OpenAI({
    apiKey,
    baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1",
  });
} else {
  console.warn("WARNING: MINIMAX_API_KEY is not defined. AI Chat features will be disabled.");
}

// System instruction for the Hangzhou Local Guide AI
const SYSTEM_INSTRUCTION = `你叫“汉斯”（Hanz），是一个热情、客观、知识丰富的本地AI旅游专家，专门为来中国杭州独立旅行的外宾（自由行旅客）提供帮助。

请务必用中文回答，并遵循以下核心信息，确保外宾在杭州能拥有顺畅且安全的无障碍体验：
1. 144小时过境免签：杭州萧山国际机场（HGH）支持针对54个国家（包括美、英、加、澳、新、欧盟等）公民的144小时过境免签政策（必须持有前往第三国或地区的联程机票）。
2. 移动支付：中国几乎已经完全实现无现金化。小商店极少直接接受外卡刷卡。外宾必须在抵达前下载支付宝（Alipay）或微信（WeChat）并绑定其境外的Visa/Mastercard信用卡。这对抗风险和生存至关重要。虽然现金是法定货币，但商家经常由于没有零钱而无法找零。
3. 网络与VPN：Google、Google Maps、Gmail、YouTube、Instagram、WhatsApp、Facebook等海外软件均被防火墙拦截。建议旅行者提前购买漫游eSIM卡（如Airalo、Nomad等），漫游网络不经过防火墙，无需VPN即可直接使用海外应用。如果是用本地SIM卡，则必须在入境中国前下载并配置好VPN（如乐网LetsVPN、Astrill等）。
4. 地图导航：Google Maps在中国有严重的定位偏移，且更新滞后。建议苹果用户直接使用自带的苹果地图（Apple Maps），其在华调用高德数据，定位100%准确，且支持全英文。或者下载高德地图（Amap）、百度地图。
5. 出行指南：
   - 杭州地铁：共14条线路，极其干净、快速、对外国人友好，可直接在支付宝中搜索“出行”开通乘车码扫码过闸。
   - 拒乘黑车：千万不要搭乘火车站或机场出口拉客人员的非法私家车（黑车）。请务必排队乘坐正规出租车，或使用支付宝内的“滴滴出行（Didi）”（滴滴有全英文界面，支持外卡，且聊天支持实时翻译）。
   - 共享单车：使用支付宝/微信扫码路边的哈罗单车（蓝色）或红单车即可骑行，收费合理（约1.5元/30分钟），需停在指定白线框内。
6. 西湖茶馆与丝绸陷阱（最核心防坑）：
   - 茶托骗局：在西湖或河坊街附近，会有热情的男女或自称“想练英语的艺术生”主动搭讪，随后邀请你去参加“本地茶艺节”或去“小茶馆喝龙井”。随后会扔给你天价账单（数千元）。告知外籍游客绝对不要跟随陌生人去喝茶、就餐！
   - 景区茶叶：千万不要在西湖景区的路边摊或司机引路的“私人茶农院”买茶叶。大都是外地低端茶以10倍溢价售卖。买茶应去龙井村老字号（如狮牌、西湖牌）品牌门店。
   - 劣质真丝：河坊街等景区的超低价真丝大都是100%化纤/涤纶做的，质量极差。如买高品质真丝请认准“万事利（Wensli）”等名牌。
   - 野手划船：西湖游船请只在官方指定的国营码头购票乘船，拒绝路边招揽的私人野手划船。
7. 图片展示：当用户询问某个景点、地标长什么样（如西湖、兵马俑、东方明珠塔）时，请在回答中使用 Markdown 图片语法 \`![描述](/api/wiki-image?title=词条名&lang=zh)\` 附图，其中"词条名"填写该地标对应的中文维基百科条目名（拿不准中文条目名时可以用 \`lang=en\` 换成英文条目名，如 West Lake、Terracotta Army）。这个地址由服务器自动去维基百科抓取真实存在的条目配图；后端会按 zh→en→中文移动版的顺序尝试多个镜像，并对 upload.wikimedia.org 的图片做反代，即使外网维基不稳定也能拿到图。若所有镜像都失败，服务器会返回 404+fallbackSearchUrl，前端会自动展示"百度/必应/搜狗"国内搜图链接作为兜底。禁止直接编造或拼接 upload.wikimedia.org 等图床的具体文件路径，因为这类文件名几乎必然是编造的、打不开。如果是地铁标志、支付宝乘车码图标这类维基百科上没有的内容，直接用文字描述即可，不要配图。

说话风格与语气：表达清晰、客观、关注安全、结构严谨。多使用分条列点和加粗，让正在旅行中的人能一目了然、快速阅读。请务必用中文回答。`;

// API routes first
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", aiConfigured: !!ai });
});

// Public checkout config — only the fields the checkout UI needs. Merchant
// internals (alipayAccount, wechatMerchantId) and the VIP code are NEVER
// returned here; the VIP code is validated server-side in /api/verify-payment.
function toPublicConfig(full: ReturnType<typeof rowToConfig>) {
  return {
    alipayQrUrl: full.alipayQrUrl,
    wechatQrUrl: full.wechatQrUrl,
    paypalClientId: full.paypalClientId,
    priceCny: full.priceCny,
    priceUsd: full.priceUsd,
  };
}

// Get current payment configuration (public, secrets stripped)
app.get("/api/payment-config", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payment_config WHERE id = 1");
    res.json(toPublicConfig(rowToConfig((rows as any[])[0])));
  } catch (error: any) {
    console.error("Failed to load payment config:", error);
    res.status(500).json({ error: "Failed to load payment configuration." });
  }
});

// Full payment configuration incl. VIP code + merchant accounts — admin only.
app.get("/api/admin/payment-config", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payment_config WHERE id = 1");
    res.json(rowToConfig((rows as any[])[0]));
  } catch (error: any) {
    console.error("Failed to load payment config (admin):", error);
    res.status(500).json({ error: "Failed to load payment configuration." });
  }
});

// Update payment configuration — admin only.
app.post("/api/payment-config", requireAdmin, async (req, res) => {
  const { alipayAccount, alipayQrUrl, wechatMerchantId, wechatQrUrl, paypalClientId, priceCny, priceUsd, vipCode } = req.body;

  const columnMap: Record<string, any> = {
    alipay_account: alipayAccount,
    alipay_qr_url: alipayQrUrl,
    wechat_merchant_id: wechatMerchantId,
    wechat_qr_url: wechatQrUrl,
    paypal_client_id: paypalClientId,
    price_cny: priceCny,
    price_usd: priceUsd,
    vip_code: vipCode,
  };
  const updates = Object.entries(columnMap).filter(([, value]) => value !== undefined);

  try {
    if (updates.length > 0) {
      const setClause = updates.map(([column]) => `${column} = ?`).join(", ");
      await pool.query(`UPDATE payment_config SET ${setClause} WHERE id = 1`, updates.map(([, value]) => value));
    }

    const [rows] = await pool.query("SELECT * FROM payment_config WHERE id = 1");
    const config = rowToConfig((rows as any[])[0]);
    res.json({ success: true, message: "Payment configuration updated successfully.", config });
  } catch (error: any) {
    console.error("Failed to update payment config:", error);
    res.status(500).json({ error: "Failed to update payment configuration." });
  }
});

// Verify and record a payment transaction.
// NOTE: this is a SIMULATED checkout — there is no real payment gateway. It
// records a transaction row and (for VIP) checks the code. Unlock is still a
// client-side comparison for demo purposes; do not treat as real settlement.
// Requires auth so only a logged-in user can create transactions, and the
// payer is bound to the authenticated account rather than trusting the body.
app.post("/api/verify-payment", requireAuth, async (req: AuthedRequest, res) => {
  const { itineraryId, itineraryTitle, paymentMethod, paymentDetails, amount } = req.body;
  // Payer defaults to the authenticated account; a submitted payer account
  // (alipay/wechat/paypal address) is allowed for the demo unlock matching.
  const payerAccount = String(req.body?.payerAccount || req.user!.email);

  if (!itineraryId || !paymentMethod) {
    return res.status(400).json({ error: "itineraryId and paymentMethod are required." });
  }

  try {
    const [configRows] = await pool.query(
      "SELECT vip_code, price_cny, price_usd FROM payment_config WHERE id = 1"
    );
    const { vip_code, price_cny, price_usd } = (configRows as any[])[0];

    // Validate VIP code
    if (paymentMethod === "VIP" && paymentDetails !== vip_code) {
      return res.status(400).json({ error: "无效的 VIP 专属免费码，请在配置中检查或重新输入！" });
    }

    const newTx = {
      id: "tx_" + Date.now(),
      itineraryId,
      itineraryTitle: itineraryTitle || "专属定制路线",
      payerAccount,
      paymentMethod,
      amount: amount || (paymentMethod === "PayPal" ? `$${price_usd}` : `¥${price_cny}`),
      timestamp: new Date().toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })
    };

    await pool.query(
      `INSERT INTO payment_transactions
        (id, itinerary_id, itinerary_title, payer_account, payment_method, amount, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newTx.id, newTx.itineraryId, newTx.itineraryTitle, newTx.payerAccount, newTx.paymentMethod, newTx.amount, newTx.timestamp]
    );

    res.json({ success: true, message: "支付验证成功！", transaction: newTx });
  } catch (error: any) {
    console.error("Failed to verify payment:", error);
    res.status(500).json({ error: "Failed to verify payment." });
  }
});

// Resolves a Wikipedia article title to its real lead image, so the AI guide never has to
// guess/hallucinate a raw upload.wikimedia.org file path (which is almost always wrong).
//
// Mainland China users frequently hit timeouts / DNS errors against *.wikipedia.org and
// upload.wikimedia.org, so we walk through several mirrors in order before giving up.
// If everything still fails, we hand back a JSON payload with `fallbackSearchUrl` so the
// frontend can offer a click-through to a domestic image-search engine instead of a broken
// image.

// ---------------------------------------------------------------------------
// Domestic image fallback (内站模式)。当所有维基镜像都拿不到图时，按
//   百度图片 → 必应中国 → 搜狗图片
// 顺序解析搜索结果 HTML，从首条结果里抽出真实的图片 URL，再以服务端反代的方式
// 把图片字节流回浏览器（image.baidu.com / pic.sogou.com 的图片源对 Referer 很敏感，
// 浏览器直连经常会被 403，所以必须服务端代为抓取）。
// ---------------------------------------------------------------------------
type FetchDomesticResult =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false };

async function fetchDomesticImage(query: string): Promise<FetchDomesticResult> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

  // 每个 source 自带：抓哪个 URL、怎么把响应文本拆成"单图 URL 候选列表"、
  // 抓单图时打哪个 Referer 绕过 CDN 防盗链。
  // 注意：必须拿"单图直链"（jpg/webp/png/gif），不能拿图集/相册入口页 URL。
  const sources: Array<{
    name: string;
    /** 抓搜索结果（HTML / JSON）的入口地址 */
    searchUrl: (q: string) => string;
    /** 把搜索结果文本拆成"单图 URL 候选"数组 */
    parse: (text: string) => string[];
    /** 抓单图字节时打的 Referer（用于过目标 CDN 的防盗链） */
    imageReferer: (imgUrl: string) => string;
  }> = [
    {
      name: "baidu-acjson",
      // 百度图片开放的 JSON 端点：返回结构化结果，middleURL/thumbURL 都是真实 CDN 单图
      searchUrl: (q) =>
        `https://image.baidu.com/search/acjson?tn=resultjson_com&logid=1&ipn=rj&ct=201326592&is=&fp=result&queryWord=${encodeURIComponent(q)}&cl=2&lm=-1&ie=utf-8&oe=utf-8&adpicid=&st=-1&z=&ic=0&hd=&latest=&copyright=&word=${encodeURIComponent(q)}&s=&se=&tab=&width=&height=&face=0&istype=2&qc=&nc=1&fr=&expermode=&force=&pn=0&rn=12&gsm=1e&${Date.now()}=`,
      parse: (text) => {
        // 响应是干净 JSON：{ data: [ { thumbURL, middleURL, hoverURL, replaceUrl: [{ObjURL}], ... } ] }
        // 直接读字段，不再用脆弱的正则。
        let obj: any;
        try {
          obj = JSON.parse(text);
        } catch {
          return [];
        }
        const data: any[] = Array.isArray(obj?.data) ? obj.data : [];
        const urls: string[] = [];
        for (const item of data) {
          if (!item || typeof item !== "object") continue;
          // 优先级：middleURL（中等尺寸）> thumbURL > hoverURL；replaceUrl 里有更干净的源图
          if (typeof item.middleURL === "string" && item.middleURL) urls.push(item.middleURL);
          if (typeof item.thumbURL === "string" && item.thumbURL) urls.push(item.thumbURL);
          if (typeof item.hoverURL === "string" && item.hoverURL) urls.push(item.hoverURL);
          // replaceUrl 是数组 [{ ObjURL, ObjUrl, FromURL }]
          const replaceList: any[] = Array.isArray(item.replaceUrl) ? item.replaceUrl : [];
          for (const r of replaceList) {
            if (r && typeof r === "object") {
              const u = r.ObjURL || r.ObjUrl;
              if (typeof u === "string" && u) urls.push(u);
            }
          }
        }
        return urls;
      },
      imageReferer: (u) => {
        // 百度 CDN 通常要求 Referer 来自 image.baidu.com；少数第三方图床不打也能加载
        try {
          const host = new URL(u).hostname;
          if (/baidu\.com|bdimg\.com|hiphotos\.baidu\.com/.test(host)) {
            return "https://image.baidu.com/";
          }
          return u;
        } catch {
          return "https://image.baidu.com/";
        }
      },
    },
    {
      name: "bing-async",
      // Bing 图片搜索的国际 async 端点，返回 HTML 片段，data-src 是单图直链
      searchUrl: (q) =>
        `https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=1&count=20&mmasync=1`,
      parse: (text) => {
        const urls: string[] = [];
        // Bing 把图片直链放在 a 标签的 m 属性 / img 的 data-src 属性里
        const re = /\b(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpe?g|png|webp|gif|bmp)(?:\?[^"]*)?)"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          if (m[1]) urls.push(m[1]);
        }
        // 兜底：抓 a.iusc 里嵌入的 JSON
        const re2 = /"murl"\s*:\s*"(https?:\/\/[^"\\]+\.(?:jpe?g|png|webp|gif|bmp)[^"\\]*)"/gi;
        while ((m = re2.exec(text))) {
          if (m[1]) urls.push(m[1].replace(/\\/g, ""));
        }
        return urls;
      },
      imageReferer: (u) => {
        // Bing 图床对 Referer 没那么严格，给个 bing 域名即可
        return "https://www.bing.com/";
      },
    },
    {
      name: "sogou-html",
      searchUrl: (q) => `https://pic.sogou.com/pics?query=${encodeURIComponent(q)}&mode=1`,
      parse: (text) => {
        const urls: string[] = [];
        // 搜狗图片的真实单图 URL 在 thumbUrl / picUrl / originUrl / b_url 字段里
        const re = /"(?:thumbUrl|picUrl|originUrl|b_url|imgUrl|smallPicUrl)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+\.(?:jpe?g|png|webp|gif|bmp)[^"\\]*)"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          if (m[1]) urls.push(m[1].replace(/\\/g, ""));
        }
        // 也兼容 data-pic 属性
        const re2 = /data-(?:pic|src)="(https?:\/\/[^"]+\.(?:jpe?g|png|webp|gif|bmp)[^"]*)"/gi;
        while ((m = re2.exec(text))) {
          if (m[1]) urls.push(m[1]);
        }
        return urls;
      },
      imageReferer: (u) => {
        try {
          const host = new URL(u).hostname;
          if (/sogou\.com|imgstore\.cdn\.sogou\.com/.test(host)) {
            return "https://pic.sogou.com/";
          }
          return u;
        } catch {
          return "https://pic.sogou.com/";
        }
      },
    },
  ];

  for (const src of sources) {
    try {
      // 1) 抓搜索结果（HTML 或 JSON）
      const searchRes = await fetch(src.searchUrl(query), {
        headers: {
          "User-Agent": userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!searchRes.ok) continue;
      const text = await searchRes.text();
      if (!text) continue;

      // 2) 拆出"单图直链"候选
      const candidates = src.parse(text).filter(looksLikeImageUrl);
      if (candidates.length === 0) continue;

      // 3) 对每条候选做"HEAD 嗅探"——确认是真实图片字节，不是图集/合集 HTML 页
      for (const imgUrl of candidates.slice(0, 6)) {
        try {
          const head = await fetch(imgUrl, {
            method: "HEAD",
            headers: {
              "User-Agent": userAgent,
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              Referer: src.imageReferer(imgUrl),
            },
            signal: AbortSignal.timeout(5000),
            redirect: "follow",
          });
          if (!head.ok) continue;
          const ct = head.headers.get("content-type") || "";
          if (!/^image\//i.test(ct)) continue;
          const cl = Number(head.headers.get("content-length") || "0");
          if (cl > 0 && cl < 1024) continue; // 太小的 1x1 占位图

          // 4) HEAD 通过 → 真去抓图片字节
          const get = await fetch(imgUrl, {
            headers: {
              "User-Agent": userAgent,
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              Referer: src.imageReferer(imgUrl),
            },
            signal: AbortSignal.timeout(12000),
            redirect: "follow",
          });
          if (!get.ok) continue;
          const finalCt = get.headers.get("content-type") || ct;
          if (!/^image\//i.test(finalCt)) continue;
          const buf = Buffer.from(await get.arrayBuffer());
          if (buf.length < 2048) continue;
          return { ok: true, bytes: buf, contentType: finalCt };
        } catch {
          // 单个候选失败就试下一个
          continue;
        }
      }
    } catch (err: any) {
      console.warn(`domestic image fallback (${src.name}) failed:`, err?.message || err);
      // try next source
    }
  }

  return { ok: false };
}

// 判断一个 URL "看起来像" 单图直链：扩展名是图片格式 / 域名是常见图床 CDN
// 主要用来过滤掉"图集/合集"的 HTML 入口页（如 image.baidu.com/album?…）。
function looksLikeImageUrl(u: string): boolean {
  if (!u || typeof u !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  // 显式排除图集 / 相册 / 详情页入口域名
  const host = parsed.hostname.toLowerCase();
  const excludedHosts = [
    "image.baidu.com", // 百度图片的"图集详情"页
    "www.baidu.com", // 百度搜索结果页
    "pic.sogou.com", // 搜狗"看图"页
  ];
  for (const h of excludedHosts) {
    if (host === h) return false;
  }

  // 路径里有"图集 / 相册 / album / gallery"等关键词
  const path = parsed.pathname.toLowerCase();
  if (/\/(album|gallery|collection|图集|相册)(\/|\.|$)/.test(path)) return false;

  // 必须是图片扩展名（包含 query string 也允许）
  const extMatch = path.match(/\.([a-z0-9]+)$/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "tiff", "heic", "heif", "svg"].includes(ext)) {
      return true;
    }
    // 有扩展名但不是图片格式（.html/.htm/.php） → 拒绝
    return false;
  }
  // 没扩展名时：常见图床 CDN 域名有就放过
  const cdnHosts = [
    // 百度图床
    "bdimg.com", "hiphotos.baidu.com", "himg.baidu.com",
    "img1.baidu.com", "img2.baidu.com", "img3.baidu.com",
    "img0.baidu.com", "img.baidu.com",
    // 搜狗图床
    "imgstore.cdn.sogou.com", "img01.sogoucdn.com", "img02.sogoucdn.com", "img03.sogoucdn.com",
    // Bing
    "bing.com", "bing.net", "msn.cn",
    // 微信 / 公众号
    "mmbiz.qpic.cn", "qpic.cn",
    // 阿里 / 淘宝
    "alicdn.com", "taobaocdn.com", "tbcdn.cn", "aliimg.com",
    // 网易
    "126.net", "netease.com", "nosdn.126.net",
    // 腾讯
    "gtimg.com", "qlogo.cn", "qq.com",
    // 抖音 / TikTok
    "douyinpic.com", "byteicdn.com", "bytedance.com",
    // 小红书
    "xhscdn.com", "xhs-img.com",
    // WordPress / 维基 / 通用
    "wp.com", "wixmp.com", "wikimedia.org", "wikimediafoundation.org",
    "upload.wikimedia.org",
    // 免费图库
    "unsplash.com", "images.unsplash.com",
    "pixabay.com", "cdn.pixabay.com",
    "pexels.com", "images.pexels.com",
    // 微博
    "sinaimg.cn", "weibo.com", "weibocdn.com",
    // 京东
    "360buyimg.com", "jd.com",
    // Reddit
    "reddit.com", "redd.it", "redditmedia.com",
  ];
  if (cdnHosts.some((h) => host === h || host.endsWith("." + h))) return true;

  // 兜底：URL 路径或 query 里包含图片格式关键字（百度图床常用 ?f=JPEG&...）
  const allText = (parsed.pathname + parsed.search).toLowerCase();
  if (/[?&]f=(jpe?g|png|webp|gif|bmp|avif|heic|heif)/.test(allText)) return true;
  // query 里带 .jpg / .webp 等
  if (/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)([?&]|$)/.test(parsed.search)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Overseas image fallback (外站模式)。优先打 Wikimedia Commons 的 MediaSearch API
// （返回结构化 JSON，免去 HTML 解析），拿到首个文件后用 thumbnail URL 直接 302
// 给浏览器（外网模式不再做反代，节省带宽与延迟）。
// ---------------------------------------------------------------------------
async function fetchCommonsImage(
  query: string,
  userAgent: string,
): Promise<{ ok: true; url: string } | { ok: false }> {
  try {
    // srnamespace=6 = File: namespace；srlimit=1 拿首条结果
    const apiUrl =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search` +
      `&srnamespace=6&srlimit=1&srsearch=${encodeURIComponent(query)}`;
    const r = await fetch(apiUrl, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { ok: false };
    const data: any = await r.json();
    const title = data?.query?.search?.[0]?.title as string | undefined;
    if (!title) return { ok: false };
    // 由文件标题拿到缩略图 URL（iiurlwidth 控制宽度，控制在 800px 以内）
    const fileTitle = title.replace(/^File:/, "File:");
    const infoUrl =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo` +
      `&iiprop=url&iiurlwidth=800&titles=${encodeURIComponent(fileTitle)}`;
    const ir = await fetch(infoUrl, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(6000),
    });
    if (!ir.ok) return { ok: false };
    const info: any = await ir.json();
    const pages = info?.query?.pages || {};
    const first = Object.values(pages)[0] as any;
    const imageUrl: string | undefined =
      first?.imageinfo?.[0]?.thumburl || first?.imageinfo?.[0]?.url;
    if (!imageUrl) return { ok: false };
    return { ok: true, url: imageUrl };
  } catch (err: any) {
    console.warn("commons image fallback failed:", err?.message || err);
    return { ok: false };
  }
}

app.get("/api/wiki-image", async (req, res) => {
  const title = String(req.query.title || "").trim();
  const lang = /^[a-z]{2,3}$/i.test(String(req.query.lang || "")) ? String(req.query.lang) : "zh";
  const mode = req.query.mode === "overseas" ? "overseas" : "domestic";

  if (!title) {
    return res.status(400).json({ error: "title query parameter is required." });
  }

  const userAgent = "hangzhou-travel-guide/1.0 (contact: shufan2025@gmail.com)";

  // Wikipedia hosts whose upload.wikimedia.org image is reachable from China. Order matters.
  // 内站模式：中文维基优先，并对 upload.wikimedia.org 的图片做反代（避免浏览器直连被墙）。
  // 外站模式：英文维基优先（国际化、英文条目更全），且不反代 upload.wikimedia.org，
  //         直接 302 到原 URL，让浏览器走用户本地的外网通道加载。
  const candidates: string[] = (() => {
    if (mode === "overseas") {
      // 外站：英文维基最优先，其次用户指定 lang，最后中文维基作最末兜底
      const list = ["en", lang, "zh"];
      return Array.from(new Set(list.filter((l) => /^[a-z]{2,3}$/i.test(l))));
    }
    // 内站：保留旧行为 —— 用户指定 lang → 中文 → 英文
    const list = [lang, "zh", "en"];
    return Array.from(new Set(list.filter((l) => /^[a-z]{2,3}$/i.test(l))));
  })();

  for (const candidateLang of candidates) {
    const hosts = [
      `https://${candidateLang}.wikipedia.org`,
    ];

    for (const host of hosts) {
      try {
        const summaryUrl = `${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const wikiRes = await fetch(summaryUrl, {
          headers: { "User-Agent": userAgent },
          signal: AbortSignal.timeout(4000),
        });

        if (!wikiRes.ok) continue;

        const summary: any = await wikiRes.json();
        const imageUrl = summary?.originalimage?.source || summary?.thumbnail?.source;
        if (!imageUrl) continue;

        // Wikipedia images sometimes live on upload.wikimedia.org, which is firewalled in
        // China. 内站模式下我们走服务端反代；外站模式下浏览器可以直连 upload.wikimedia.org，
        // 因此直接 302 到原图，省一次代理带宽与延迟。
        const needsProxy = /upload\.wikimedia\.org/i.test(imageUrl);
        if (needsProxy && mode === "domestic") {
          try {
            const upstream = await fetch(imageUrl, {
              headers: { "User-Agent": userAgent },
              signal: AbortSignal.timeout(15000),
            });
            if (upstream.ok) {
              const contentType = upstream.headers.get("content-type") || "image/jpeg";
              res.setHeader("Content-Type", contentType);
              res.setHeader("Cache-Control", "public, max-age=86400");
              const buf = Buffer.from(await upstream.arrayBuffer());
              return res.status(200).send(buf);
            }
            console.warn(`wiki-image proxy non-OK (${host}): ${upstream.status}`);
          } catch (proxyErr: any) {
            console.warn(`wiki-image proxy failed (${host}):`, proxyErr?.message || proxyErr);
            // fall through to the direct redirect below
          }
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.redirect(302, imageUrl);
      } catch (err: any) {
        console.warn(`wiki-image fetch failed (${host}):`, err?.message || err);
        // try next host
      }
    }
  }

  // All mirrors failed — return a JSON payload so the frontend can offer
  // 内站：百度/必应CN/搜狗；外站：Google Images / Bing Images / Wikimedia Commons。
  const q = encodeURIComponent(title);

  // ---------------------------------------------------------------------------
  // 第二层兜底：直接到对应的搜索引擎抓"首张真实图片"，把图片字节流回浏览器，
  // 这样前端不用再展示"国内搜图"链接，而是直接看到一张实拍图。
  //
  //   - 内站 (domestic) ：按 百度图片 → 必应CN → 搜狗 顺序尝试，每一步都会解析 HTML
  //     拿到第一条 objURL/hoverURL 之类字段，fetch 该图片字节再 stream 给客户端。
  //     因为浏览器直连 image.baidu.com / pic.sogou.com 也经常被 referer 校验挡住，
  //     所以这里走服务端反代最稳。
  //
  //   - 外站 (overseas) ：先打 Wikimedia Commons 的 MediaSearch API（结构化、稳定、不用
  //     解析 HTML），拿 thumbnail URL 后直接 302 给浏览器（外网模式不再反代，省带宽）。
  //     若 Commons 也无果，再尝试 Google Images。
  // ---------------------------------------------------------------------------
  if (mode === "overseas") {
    const commonsResult = await fetchCommonsImage(title, userAgent);
    if (commonsResult.ok) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.redirect(302, commonsResult.url);
    }
  } else {
    const domesticResult = await fetchDomesticImage(title);
    if (domesticResult.ok && domesticResult.bytes && domesticResult.contentType) {
      res.setHeader("Content-Type", domesticResult.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).send(domesticResult.bytes);
    }
  }
  if (mode === "overseas") {
    return res.status(404).json({
      error: "All Wikipedia mirrors failed or returned no image.",
      title,
      sourceMode: "overseas",
      fallbackSearchUrl: `https://www.google.com/search?q=${q}&tbm=isch`,
      fallbackSearchUrls: [
        { engine: "google", label: "Google 图片", url: `https://www.google.com/search?q=${q}&tbm=isch` },
        { engine: "bing", label: "Bing Images", url: `https://www.bing.com/images/search?q=${q}` },
        { engine: "commons", label: "Wikimedia Commons", url: `https://commons.wikimedia.org/w/index.php?search=${q}&title=Special:MediaSearch&go=Go&type=image` },
      ],
    });
  }
  return res.status(404).json({
    error: "All Wikipedia mirrors failed or returned no image.",
    title,
    sourceMode: "domestic",
    fallbackSearchUrl: `https://image.baidu.com/search/index?tn=baiduimage&word=${q}`,
    fallbackSearchUrls: [
      { engine: "baidu", label: "百度图片", url: `https://image.baidu.com/search/index?tn=baiduimage&word=${q}` },
      { engine: "bing", label: "必应图片", url: `https://cn.bing.com/images/search?q=${q}` },
      { engine: "sogou", label: "搜狗图片", url: `https://pic.sogou.com/pics?query=${q}` },
    ],
  });
});

// ---------------------------------------------------------------------------
// /api/note-image — server-side thumbnail proxy for hot-notes media.
//   query: noteId (required), seq (default 0), kind ('image' | 'video')
//   Only proxies URLs already stored in note_images / note_videos (no open
//   proxy / SSRF). XHS/Douyin/etc CDNs enforce hotlink protection, so we fetch
//   with a platform-appropriate Referer that the browser can't send itself,
//   then stream the bytes back. On any failure we 404 and the client falls
//   back to its placeholder.
// ---------------------------------------------------------------------------
const PLATFORM_REFERER: Record<string, string> = {
  xhs: "https://www.xiaohongshu.com/",
  dy: "https://www.douyin.com/",
  bili: "https://www.bilibili.com/",
  wb: "https://weibo.com/",
};

app.get("/api/note-image", async (req, res) => {
  const noteId = String(req.query.noteId || "").trim();
  const seq = Math.max(Number.parseInt(String(req.query.seq || "0"), 10) || 0, 0);
  const kind = req.query.kind === "video" ? "video" : "image";
  if (!noteId) {
    return res.status(400).json({ error: "noteId is required." });
  }

  try {
    const table = kind === "video" ? "note_videos" : "note_images";
    const [rows]: any = await pool.query(
      `SELECT m.url, hn.platform
         FROM ${table} m
         JOIN hot_notes hn ON hn.id = m.note_id
        WHERE m.note_id = ? AND m.seq = ?
        LIMIT 1`,
      [noteId, seq],
    );
    if (rows.length === 0 || !rows[0].url) {
      return res.status(404).json({ error: "No media for this note/seq." });
    }
    const url: string = rows[0].url;
    const platform: string = rows[0].platform || "";
    const referer = PLATFORM_REFERER[platform] || "";

    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!upstream.ok) {
      return res.status(404).json({ error: `Upstream ${upstream.status}.` });
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!/^image\//i.test(contentType)) {
      return res.status(404).json({ error: "Upstream is not an image." });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(buf);
  } catch (err: any) {
    console.warn(`[note-image] proxy failed (note=${noteId} seq=${seq}):`, err?.message || err);
    return res.status(404).json({ error: "Failed to load note media." });
  }
});

// Get payment transactions list (for Admin interface)
app.get("/api/payment-transactions", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payment_transactions ORDER BY seq DESC");
    res.json((rows as any[]).map(rowToTransaction));
  } catch (error: any) {
    console.error("Failed to load payment transactions:", error);
    res.status(500).json({ error: "Failed to load payment transactions." });
  }
});

// MiniMax reasoning models (e.g. MiniMax-M3) prepend a <think>...</think> block
// to the content string instead of returning it as a separate field.
function stripThinkTags(text: string | null | undefined): string {
  return (text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// Chatbot Endpoint — wrapped by auth + rate-limit + input/output guards
// (added 2026-07). The system prompt is also extended with the safety
// appendix in src/safety/safetyPrompt.ts so the model is told to stay in
// role even if a request slips past the regex filters.
app.post("/api/chat", requireAuth, chatRateLimiter, async (req: AuthedRequest, res) => {
  if (!ai) {
    return res.status(500).json({
      error: "AI Assistant is currently offline. Please configure MINIMAX_API_KEY in Settings.",
    });
  }

  try {
    const { message, history, sourceMode } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    // ----- 1. Input guard -----
    const inputMaxLen = parseInt(process.env.CHAT_INPUT_MAX_LEN || "1000", 10);
    const verdict = guardInput({
      message: String(message),
      history: Array.isArray(history) ? history : [],
      maxLen: inputMaxLen,
      sourceMode,
      historyItemMaxLen: 500,
    });
    if (verdict.action === "block") {
      console.warn(
        `[safety] /api/chat blocked: user=${req.user!.id} rule=${verdict.ruleId} reason=${verdict.reason}`,
      );
      return res.json({ reply: verdict.userMessage, _guard: verdict.reason });
    }

    // ----- 2. Build the system prompt (tour guide content + safety appendix) -----
    const mode = sourceMode === "overseas" ? "overseas" : "domestic";
    const baseSystem =
      mode === "overseas"
        ? `${SYSTEM_INSTRUCTION}\n\n[当前用户已切换为"外站"模式] 用户的浏览器可以直接访问外网。请在需要配图时优先使用英文维基百科条目名（lang=en）调用 /api/wiki-image，例如 \`![West Lake](/api/wiki-image?title=West%20Lake&lang=en&mode=overseas)\`；不要使用中文维基词条名，也不要引用国内（百度/必应CN/搜狗）图源。若外网维基不可用，后端会自动走 Google Images / Bing Images / Wikimedia Commons 作为兜底。`
        : SYSTEM_INSTRUCTION;
    const systemContent = `${baseSystem}\n\n${SAFETY_GUARDRAILS}`;

    // ----- 3. Build message list (already-cleaned by guardInput) -----
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...verdict.cleanedHistory, // already normalized + length-capped
      { role: "user", content: verdict.cleanedMessage },
    ];

    const response = await ai.chat.completions.create({
      model: MINIMAX_MODEL,
      messages,
      temperature: 0.7,
    });

    // ----- 4. Output guard -----
    const rawReply = stripThinkTags(response.choices[0]?.message?.content);
    const outputMaxLen = parseInt(process.env.CHAT_OUTPUT_MAX_LEN || "4000", 10);
    const outVerdict = guardOutput(rawReply, { sourceMode, maxLen: outputMaxLen });

    if (outVerdict.redactedUrls > 0 || outVerdict.maskedPii > 0 || outVerdict.reason) {
      console.warn(
        `[safety] /api/chat output sanitized: user=${req.user!.id} action=${outVerdict.action} reason=${outVerdict.reason ?? ""} urlRedacted=${outVerdict.redactedUrls} piiMasked=${outVerdict.maskedPii} truncated=${outVerdict.truncated}`,
      );
    }

    res.json({ reply: outVerdict.reply, _guard: outVerdict.action });
  } catch (error: any) {
    console.error("MiniMax API Error:", error);
    res.status(500).json({ error: error?.message || "Failed to communicate with AI Guide." });
  }
});

// ---------------------------------------------------------------------------
// Auth: JWT access (15min) + rotating refresh token (30 days, stored in DB)
// ---------------------------------------------------------------------------
const JWT_SECRET: string = process.env.JWT_SECRET || "travel-guide-dev-secret-change-me";
const JWT_ACCESS_TTL = "15m";
const REFRESH_TTL_DAYS = 30;

function signAccessToken(user: { id: number; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_TTL,
  });
}

function generateRefreshTokenString(): string {
  return crypto.randomBytes(48).toString("base64url");
}

// We persist only sha256(secret), never the raw secret, so a DB read can't
// mint refresh tokens. Compared with timingSafeEqual on rotate.
function hashRefreshSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

interface AuthedRequest extends express.Request {
  user?: { id: number; email: string };
}

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Missing Authorization Bearer token." });
  try {
    const payload: any = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
}

// Admin gate: there is no per-user role column, so admin identity is an env
// allowlist (ADMIN_EMAILS, comma-separated). requireAdmin runs requireAuth
// first, then checks membership. In production a missing allowlist means no
// one is admin (fail closed); in dev we warn and allow so local setup works.
function isAdminEmail(email: string | undefined): boolean {
  const raw = process.env.ADMIN_EMAILS || "";
  const allow = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) {
    if (process.env.NODE_ENV === "production") return false;
    console.warn(
      "[admin] ADMIN_EMAILS is not set; allowing admin access in non-production. Set ADMIN_EMAILS to lock this down.",
    );
    return true;
  }
  return !!email && allow.includes(email.toLowerCase());
}

function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  requireAuth(req, res, () => {
    if (!isAdminEmail(req.user?.email)) {
      return res.status(403).json({ error: "Admin privileges required." });
    }
    next();
  });
}

async function issueTokenPair(user: { id: number; email: string }) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshTokenString();
  const jti = crypto.randomUUID();
  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, expires_at, token_secret) VALUES (?, ?, ?, ?)`,
    [jti, user.id, refreshExpiry(), hashRefreshSecret(refreshToken)]
  );
  return {
    accessToken,
    refreshToken: `${jti}.${refreshToken}`,
    refreshExpiresAt: refreshExpiry().toISOString(),
  };
}

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  try {
    const [existing]: any = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [result]: any = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [email, passwordHash]
    );
    const userId = result.insertId;
    const [userRows]: any = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const user = rowToUser(userRows[0]);
    const tokens = await issueTokenPair({ id: user.id, email: user.email });
    res.status(201).json({ user, ...tokens });
  } catch (err: any) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Failed to register." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  try {
    const [rows]: any = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const user = rowToUser(rows[0]);
    const tokens = await issueTokenPair({ id: user.id, email: user.email });
    res.json({ user, ...tokens });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login." });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  const parts = refreshToken.split(".");
  if (parts.length !== 2) return res.status(400).json({ error: "Malformed refresh token." });
  const [jti, secret] = parts;
  try {
    const [rows]: any = await pool.query(
      "SELECT rt.*, u.email FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.jti = ?",
      [jti]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Refresh token not recognized." });
    }
    const row = rows[0];
    if (row.revoked_at) {
      return res.status(401).json({ error: "Refresh token has been revoked." });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: "Refresh token has expired." });
    }
    // Verify the secret half against the stored sha256. Rows created before the
    // token_secret column existed have NULL here and can never be verified, so
    // they're rejected (the user simply logs in again).
    const providedHash = hashRefreshSecret(secret);
    const storedHash = typeof row.token_secret === "string" ? row.token_secret : "";
    const hashesMatch =
      storedHash.length === providedHash.length &&
      crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(providedHash));
    if (!hashesMatch) {
      return res.status(401).json({ error: "Refresh token mismatch." });
    }
    // Rotate: revoke the old refresh token, issue a new pair
    await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = ?", [jti]);
    const user = { id: row.user_id, email: row.email };
    const tokens = await issueTokenPair(user);
    res.json({ user, ...tokens });
  } catch (err: any) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Failed to refresh." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  const jti = refreshToken.split(".")[0];
  if (!jti) return res.status(400).json({ error: "Malformed refresh token." });
  await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = ?", [jti]);
  res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res) => {
  const [rows]: any = await pool.query("SELECT * FROM users WHERE id = ?", [req.user!.id]);
  if (rows.length === 0) return res.status(404).json({ error: "User not found." });
  res.json({ user: rowToUser(rows[0]) });
});

// ---------------------------------------------------------------------------
// Scene taxonomy (added 2026-07)
//   GET /api/scenes
//     Returns a tally + a flat list of all scams grouped by scene tag. The
//     front-end uses it to render the sub-tab badges on the 防坑指南 page
//     without having to re-fetch /api/scams and aggregate client-side.
//     Query param `?city=hangzhou` filters by city.
// ---------------------------------------------------------------------------
app.get("/api/scenes", async (req, res) => {
  try {
    const city = typeof req.query.city === "string" ? req.query.city : "";
    const where = city ? "WHERE city = ?" : "";
    const params = city ? [city] : [];
    const [rows]: any = await pool.query(
      `SELECT id, city, slug, title, scenes FROM scams ${
        where ? `${where} AND` : "WHERE"
      } scenes IS NOT NULL AND scenes <> ''`,
      params
    );
    const tallies: Record<string, number> = {};
    const list: Record<string, Array<{ id: string; city: string; slug: string; title: string }>> = {};
    for (const r of rows as any[]) {
      const tags = String(r.scenes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of tags) {
        tallies[t] = (tallies[t] || 0) + 1;
        (list[t] ||= []).push({ id: r.id, city: r.city, slug: r.slug, title: r.title });
      }
    }
    res.json({ scenes: tallies, list, city: city || null });
  } catch (err: any) {
    console.error("GET /api/scenes failed:", err);
    res.status(500).json({ error: err?.message || "Failed to load scenes." });
  }
});

// ---------------------------------------------------------------------------
// Curated content: itineraries + scams (DB-backed, in-memory cache 5 min)
// ---------------------------------------------------------------------------
const curatedCache: { itineraries?: { ts: number; data: any[] }; scams?: { ts: number; data: any[] } } = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAllItineraries(): Promise<any[]> {
  const [itinRows]: any = await pool.query(
    "SELECT * FROM itineraries ORDER BY sort_order ASC, id ASC"
  );
  if (itinRows.length === 0) return [];
  const ids = itinRows.map((r: any) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const [stopRows]: any = await pool.query(
    `SELECT * FROM itinerary_stops WHERE itinerary_id IN (${placeholders}) ORDER BY sort_order ASC`,
    ids
  );
  const stopsById: Record<string, any[]> = {};
  for (const s of stopRows) {
    if (!stopsById[s.itinerary_id]) stopsById[s.itinerary_id] = [];
    stopsById[s.itinerary_id].push(rowToStop(s));
  }
  return itinRows.map((r: any) => rowToItinerary(r, stopsById[r.id] || []));
}

async function loadAllScams(): Promise<any[]> {
  const [rows]: any = await pool.query(
    "SELECT * FROM scams ORDER BY sort_order ASC, id ASC"
  );
  return rows.map((r: any) => rowToScam(r));
}

app.get("/api/itineraries", async (req, res) => {
  const city = String(req.query.city || "").trim();
  const now = Date.now();
  if (!curatedCache.itineraries || now - curatedCache.itineraries.ts > CACHE_TTL_MS) {
    curatedCache.itineraries = { ts: now, data: await loadAllItineraries() };
  }
  const data = city
    ? curatedCache.itineraries.data.filter((it: any) => it.city === city)
    : curatedCache.itineraries.data;
  res.json({ itineraries: data });
});

app.get("/api/scams", async (req, res) => {
  const city = String(req.query.city || "").trim();
  const now = Date.now();
  if (!curatedCache.scams || now - curatedCache.scams.ts > CACHE_TTL_MS) {
    curatedCache.scams = { ts: now, data: await loadAllScams() };
  }
  const data = city
    ? curatedCache.scams.data.filter((s: any) => s.city === city)
    : curatedCache.scams.data;
  res.json({ scams: data });
});

// ---------------------------------------------------------------------------
// /api/hot-notes — 入库的小红书等平台「话题攻略/购物」笔记
//   query:
//     category    '衣' | '食' | '住' | '行' | '其他' (optional, default '' = all)
//     sub         '购物' / ... (optional)
//     mediaOnly   'reachable' | 'all' (default 'reachable')
//     limit       int (default 30, max 100)
//     offset      int (default 0)
//   返回 notes + 每条关联 media (image/video 拆分列出)
// ---------------------------------------------------------------------------

interface HotNoteMediaRow {
  kind: "image" | "video";
  seq: number;
  url: string;
  media_status: string;
  http_status: number | null;
}

// ---------------------------------------------------------------------------
// /api/hot-notes 的地点分组辅助函数
// ---------------------------------------------------------------------------
//
// 杭州细分地域关键词表。机检每条 hot_notes 的 title + content + tags + source_keyword，
// 命中顺序按本数组顺序（即数组靠前的优先）。一个 note 只落入第一个匹配的地点。
// 这样避免同一条入"西湖"+"千岛湖"两个组里被重复计数。
const LOCATION_KEYWORDS: Array<{ slug: string; name: string; aliases: string[] }> = [
  { slug: "xihu",       name: "西湖 · 湖滨",  aliases: ["西湖", "断桥", "白堤", "苏堤", "湖滨", "龙翔桥", "南宋御街", "河坊街"] },
  { slug: "lingyin",    name: "灵隐 · 飞来峰", aliases: ["灵隐", "飞来峰", "法喜寺", "上天竺", "法净寺"] },
  { slug: "songcheng",  name: "宋城 · 周边",  aliases: ["宋城"] },
  { slug: "longjing",   name: "龙井 · 茶园",  aliases: ["龙井", "梅家坞", "茶园", "茶山", "龙井村"] },
  { slug: "qiandao",    name: "千岛湖",        aliases: ["千岛湖"] },
  { slug: "wuzhen",     name: "乌镇 / 西塘",  aliases: ["乌镇", "西塘"] },
  { slug: "hefang",     name: "河坊街 / 南宋御街", aliases: ["河坊街", "南宋御街"] },
  { slug: "dadian",     name: "市中心 · 武林", aliases: ["武林", "湖滨", "in77", "湖滨银泰"] },
  { slug: "xiaoshan",   name: "萧山机场",      aliases: ["萧山", "萧山机场"] },
  { slug: "shanghai-hangzhou", name: "沪杭线", aliases: ["沪杭", "虹桥"] },
  { slug: "suhang",     name: "苏杭线",        aliases: ["苏杭", "苏州"] },
  { slug: "taizi",      name: "太子尖/小众",    aliases: ["太子尖", "太子尖的", "小众"] },
  { slug: "shanghai",   name: "上海",          aliases: ["上海", "上海虹桥", "上海浦东", "迪士尼"] },
  { slug: "xian",       name: "西安",          aliases: ["西安", "兵马俑"] },
];
// 兜底：未命中任何一处 -> "杭州全境"
const FALLBACK_LOCATION = { slug: "other-hz", name: "杭州全境" };

interface LocationGroup {
  slug: string;
  name: string;
  count: number;
  /** 该地点下评论数最高（按 comment_count desc）的 hot_note 行已被收在 notes[topNoteId] */
  topNoteId: string;
  topCommentCount: number;
}

function classifyLocation(note: {
  title: string;
  content: string | null;
  tags: string[] | string | null;
  source_keyword: string | null;
}): string {
  const text =
    `${note.title} ${note.content || ""} ${note.tags || ""} ${note.source_keyword || ""}`.toLowerCase();
  for (const loc of LOCATION_KEYWORDS) {
    for (const alias of loc.aliases) {
      if (text.includes(alias.toLowerCase())) {
        return loc.slug;
      }
    }
  }
  return FALLBACK_LOCATION.slug;
}

function buildLocationGroups(notes: Array<{
  id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  source_keyword: string | null;
  comment_count: number;
}>): LocationGroup[] {
  // 第一遍：每条 notes 找 slug + 按 slug 累计 + 记录 top1（评论数最高的 note id）
  const bySlug = new Map<
    string,
    { name: string; count: number; topNoteId: string | null; topCommentCount: number }
  >();
  for (const n of notes) {
    const slug = classifyLocation({
      title: n.title,
      content: n.content ?? null,
      tags: (n.tags as any) ?? null,
      source_keyword: n.source_keyword ?? null,
    });
    const name = (() => {
      for (const l of LOCATION_KEYWORDS) {
        if (l.slug === slug) return l.name;
      }
      return FALLBACK_LOCATION.name;
    })();
    const cur = bySlug.get(slug) || { name, count: 0, topNoteId: null, topCommentCount: -1 };
    cur.count += 1;
    if ((n.comment_count || 0) > cur.topCommentCount) {
      cur.topNoteId = n.id;
      cur.topCommentCount = n.comment_count || 0;
    }
    bySlug.set(slug, cur);
  }
  return Array.from(bySlug.entries())
    .map(([slug, v]) => ({
      slug,
      name: v.name,
      count: v.count,
      topNoteId: v.topNoteId || "",
      topCommentCount: v.topCommentCount,
    }))
    .sort((a, b) => b.count - a.count);
}

app.get("/api/hot-notes", async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    const sub = String(req.query.sub || "").trim();
    const mediaOnly = String(req.query.mediaOnly || "reachable").trim();
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit || "30"), 10) || 30, 1),
      100,
    );
    const offset = Math.max(Number.parseInt(String(req.query.offset || "0"), 10) || 0, 0);

    // 仅返回 note_relevant=1 的；联表查封面图（seq=0）状态
    const params: any[] = [];
    const where: string[] = ["hn.note_relevant = 1"];
    if (category) {
      where.push("hn.category = ?");
      params.push(category);
    }
    if (sub) {
      where.push("hn.sub_category = ?");
      params.push(sub);
    }
    const coverReachableClause =
      "(cov.media_status = 'reachable' OR (cov.id IS NULL AND hn.cover_url IS NULL))";
    // Whether the WHERE clause references the cover join (cov.*), which decides
    // if the count query below needs the LEFT JOIN note_images cov.
    const needsCoverJoin = mediaOnly === "reachable";
    if (needsCoverJoin) {
      where.push(coverReachableClause);
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    // 主体 SQL：HOT_notes LEFT JOIN 一条封面（seq=0）的 cover 状态
    const [notes]: any = await pool.query(
      `SELECT hn.id, hn.platform, hn.category, hn.sub_category,
              hn.title, hn.content, hn.author, hn.publish_time,
              hn.source_url, hn.source_keyword, hn.media_type,
              hn.cover_url, hn.liked_count, hn.collected_count,
              hn.comment_count, hn.share_count, hn.tags,
              hn.relevance, hn.scraped_at,
              cov.url_hash AS cover_hash, cov.media_status AS cover_status,
              cov.http_status AS cover_http
         FROM hot_notes hn
         LEFT JOIN note_images cov
           ON cov.note_id = hn.id AND cov.seq = 0
         ${whereSql}
         ORDER BY hn.category, hn.comment_count DESC, hn.id
         LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    if (notes.length === 0) {
      return res.json({ notes: [], media: {}, total: 0, reachableTotal: 0 });
    }

    // 全量统计（当前 mediaOnly 下）+ 所有相关总数（用于前端 toggle）
    const allWhere = where.slice();
    const allParams = params.slice();
    // 计算 reachable total 与 all total
    const [allCountRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
         FROM hot_notes hn
         ${needsCoverJoin ? "LEFT JOIN note_images cov ON cov.note_id = hn.id AND cov.seq = 0" : ""}
         ${whereSql}`,
      params,
    );
    const total = Number(allCountRows[0].total) || 0;

    // reachable 总数：先用所有 notes 计数（移除 reachability 限定），再加 reachability 限定
    const reachableWhere = where.filter((w) => w !== coverReachableClause);
    const reachableWhereSql =
      reachableWhere.length ? "WHERE " + reachableWhere.join(" AND ") : "";
    const [reachRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
         FROM hot_notes hn
         LEFT JOIN note_images cov
           ON cov.note_id = hn.id AND cov.seq = 0
         ${reachableWhereSql}
           ${reachableWhereSql ? "AND" : "WHERE"} ${coverReachableClause}`,
      params,
    );
    const reachableTotal = Number(reachRows[0].total) || 0;

    // 关联该批 note_id 的全部图片 / 视频
    const ids = notes.map((r: any) => r.id);
    const placeholders = ids.map(() => "?").join(",");

    const [imgs]: any = await pool.query(
      `SELECT note_id, seq, url, media_status, http_status, bytes, content_type
         FROM note_images
         WHERE note_id IN (${placeholders})
         ORDER BY note_id, seq`,
      ids,
    );
    const [vids]: any = await pool.query(
      `SELECT note_id, seq, url, media_status, http_status, bytes, content_type
         FROM note_videos
         WHERE note_id IN (${placeholders})
         ORDER BY note_id, seq`,
      ids,
    );

    const media: Record<string, HotNoteMediaRow[]> = {};
    for (const r of imgs) {
      const arr = media[r.note_id] || (media[r.note_id] = []);
      arr.push({
        kind: "image",
        seq: r.seq,
        url: r.url,
        media_status: r.media_status,
        http_status: r.http_status,
      });
    }
    for (const r of vids) {
      const arr = media[r.note_id] || (media[r.note_id] = []);
      arr.push({
        kind: "video",
        seq: r.seq,
        url: r.url,
        media_status: r.media_status,
        http_status: r.http_status,
      });
    }

    // 地点分组：基于 title/tags/content + source_keyword 机检杭州细分地域，
    // 命中多条只记第一处（顺序按 LOCATIONS_KEYWORDS 数组顺序）。未命中归"杭州全境"。
    // groups: [{ slug, name, count, topNoteId, topCommentCount }]
    const locations = buildLocationGroups(notes);

    // Attach the same server-computed slug to every note so the client filters
    // by note.location_slug instead of maintaining its own duplicate keyword
    // table (which had drifted out of sync).
    const notesWithLocation = notes.map((n: any) => ({
      ...n,
      location_slug: classifyLocation({
        title: n.title,
        content: n.content ?? null,
        tags: n.tags ?? null,
        source_keyword: n.source_keyword ?? null,
      }),
    }));

    res.json({ notes: notesWithLocation, media, total, reachableTotal, locations, limit, offset });
  } catch (e: any) {
    console.error("[hot-notes] failed:", e?.message || e);
    res.status(500).json({ error: "internal error" });
  }
});

// ---------------------------------------------------------------------------
// Custom itineraries (per-user history)
// ---------------------------------------------------------------------------
function newCustomId(): string {
  return "cu_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

app.post("/api/customize", requireAuth, customizeRateLimiter, async (req: AuthedRequest, res) => {
  if (!ai) {
    return res.status(500).json({
      error: "AI customizer is currently offline. Please configure MINIMAX_API_KEY in Settings.",
    });
  }

  try {
    const { city, cities, duration, budget, interests, source } = req.body || {};

    const selectedCities =
      cities && Array.isArray(cities) && cities.length > 0 ? cities : city ? [city] : [];
    if (selectedCities.length === 0 || !duration || !budget || !interests) {
      return res.status(400).json({ error: "Cities, duration, budget, and interests are required." });
    }

    const citiesZh = selectedCities
      .map((c: string) => (c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安"))
      .join("、");
    const budgetZh =
      budget === "budget" ? "背包客/高性价比" : budget === "moderate" ? "中等舒适" : "奢华体验";

    const prompt = `你是一个专业的中国外宾独立行（自由行）规划专家。
根据以下参数生成一份高度定制、重点突出"跨城中转、防坑避雷与数字化生存"的多城市联玩行程攻略。

游玩城市: ${citiesZh}
总时长: ${duration}
预算等级: ${budgetZh}
主要兴趣: ${interests.join(", ")}

规划细节要求：
1. 必须根据总时长，合理分配每一天在各城市的游玩顺序（如先去哪个城市，再去哪个城市）。
2. 在跨城中转的日子，请在时间段活动中明确加入"跨城交通/高铁出行"和特定的火车站/机场防坑指南（例如：杭州东站、上海虹桥站、西安北站的高铁乘车、刷护照/闸机指南，防范出站口拉客的黑车司机和假志愿者，如何使用支付宝12306小程序买票等）。
3. 必须包含各城市的特色景点与避坑，并根据用户的偏好"${interests.join(", ")}"定制。

请必须严格以 JSON 格式输出，内容使用中文，结构如下：
{
  "summary": "针对用户特性的总体多城联玩行程评估和必备整备建议（特别说明高铁票预订、跨城网络和支付提醒，50-150字）",
  "checklist": ["必做准备1 (例如: 提前15天在12306绑定护照买高铁票)", "必做准备2", "必做准备3"],
  "customItinerary": [
    {
      "day": "Day 1",
      "city": "此天游玩的具体城市（比如：杭州）",
      "activities": [
        {
          "time": "时间段（例如 09:00 - 11:30）",
          "title": "活动、景点或跨城中转路线（如：杭州东站乘坐高铁前往上海）",
          "description": "活动详情描述或中转换乘指南（说明如何搭乘地铁/高铁出行，避免哪些私人黑车拉客）",
          "cost": "开销估算 (元人民币/人)",
          "scamWarning": "此活动的特定避坑与安全指南（如果没有则写'建议使用正规官方服务，拒绝任何拉客搭讪'）"
        }
      ]
    }
  ]
}

确保输出是合法的、可以直接被 JSON.parse 解析的字符串。不要包含任何 Markdown \`\`\`json 标记，只需输出 JSON 本身。`;

    const response = await ai.chat.completions.create({
      model: MINIMAX_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    let jsonText = stripThinkTags(response.choices[0]?.message?.content) || "{}";
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const data = JSON.parse(jsonText);

    const id = newCustomId();
    await pool.query(
      `INSERT INTO custom_itineraries
        (id, user_id, cities, duration, budget, interests, summary, checklist, custom_itinerary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user!.id,
        JSON.stringify(selectedCities),
        String(duration),
        String(budget),
        JSON.stringify(interests),
        data.summary || "",
        JSON.stringify(data.checklist || []),
        JSON.stringify(data.customItinerary || []),
      ]
    );

    const [rows]: any = await pool.query(
      "SELECT * FROM custom_itineraries WHERE id = ?",
      [id]
    );
    const item = rowToCustomItinerary(rows[0]);
    res.json({ id: item.id, ...data, _meta: { id: item.id, createdAt: item.createdAt, source: source || "ai" } });
  } catch (error: any) {
    console.error("MiniMax Customize Error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate customized recommendation." });
  }
});

app.get("/api/custom-itineraries", requireAuth, async (req: AuthedRequest, res) => {
  const [rows]: any = await pool.query(
    "SELECT * FROM custom_itineraries WHERE user_id = ? ORDER BY created_at DESC",
    [req.user!.id]
  );
  res.json({
    items: rows.map((r: any) => ({
      id: r.id,
      timestamp: r.created_at,
      cities: typeof r.cities === "string" ? JSON.parse(r.cities) : r.cities,
      duration: r.duration,
      budget: r.budget,
      interests: typeof r.interests === "string" ? JSON.parse(r.interests) : r.interests,
      result: {
        summary: r.summary,
        checklist: typeof r.checklist === "string" ? JSON.parse(r.checklist) : r.checklist,
        customItinerary:
          typeof r.custom_itinerary === "string" ? JSON.parse(r.custom_itinerary) : r.custom_itinerary,
      },
    })),
  });
});

app.get("/api/custom-itineraries/:id", requireAuth, async (req: AuthedRequest, res) => {
  const [rows]: any = await pool.query(
    "SELECT * FROM custom_itineraries WHERE id = ? AND user_id = ?",
    [req.params.id, req.user!.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Not found." });
  const r = rows[0];
  res.json({
    item: {
      id: r.id,
      timestamp: r.created_at,
      cities: typeof r.cities === "string" ? JSON.parse(r.cities) : r.cities,
      duration: r.duration,
      budget: r.budget,
      interests: typeof r.interests === "string" ? JSON.parse(r.interests) : r.interests,
      result: {
        summary: r.summary,
        checklist: typeof r.checklist === "string" ? JSON.parse(r.checklist) : r.checklist,
        customItinerary:
          typeof r.custom_itinerary === "string" ? JSON.parse(r.custom_itinerary) : r.custom_itinerary,
      },
    },
  });
});

app.delete("/api/custom-itineraries/:id", requireAuth, async (req: AuthedRequest, res) => {
  const [result]: any = await pool.query(
    "DELETE FROM custom_itineraries WHERE id = ? AND user_id = ?",
    [req.params.id, req.user!.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "Not found." });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Admin: import curated content + run seed
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function categoryToScamType(category: string): string {
  const c = category || "";
  if (/茶托|酒托|咖啡/.test(c)) return "Tea House";
  if (/假货|山寨|丝绸|龙井|假|玉器|购物/.test(c)) return "Fake Goods";
  if (/黑车|公交|导游|黑导游|交通|地铁|机场|车站|出租/.test(c)) return "Transport";
  if (/拍照|合影|收费|宰客|预制|排队|餐厅|餐饮|住宿|民宿|跟团|一日游|酒吧|夜/.test(c))
    return "Overcharging";
  return "Crowd Warning";
}

function riskToDangerLevel(risk: string): string {
  const r = (risk || "").toLowerCase();
  if (r === "high") return "High";
  if (r === "low") return "Low";
  return "Medium";
}

function parseScenariosMd(content: string, defaultCity = "hangzhou"): Array<{
  id: string;
  city: string;
  slug: string;
  title: string;
  scamType: string;
  dangerLevel: string;
  risk: string;
  category: string;
  scenario: string;
  mechanism: string;
  defense: string;
  tip: string;
  evidenceScore: number;
  noteCount: number;
  commentCount: number;
  topNotes: any[];
  topComments: string[];
  source: string;
}> {
  const out: any[] = [];
  const blocks = content.split(/\n##\s+/g).slice(1);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const firstLineEnd = block.indexOf("\n");
    const titleLine = (firstLineEnd >= 0 ? block.slice(0, firstLineEnd) : block).trim();
    const body = firstLineEnd >= 0 ? block.slice(firstLineEnd + 1) : "";
    const title = titleLine.replace(/^[🟥🟨🟦]\s*/, "").trim();
    if (!title) continue;
    // Skip non-scam sections like "套路速览", "法律声明", "数据来源" etc.
    if (/^(套路速览|法律声明|数据来源|前言|简介|背景|写在最后)\b/.test(title)) continue;
    // Require at least one of the well-known sub-sections, otherwise this block is metadata.
    if (!/(情境重现|套路是如何生效的|如何识破与反制)/.test(body)) continue;

    // risk + category
    const meta = body.match(/\*\*风险等级\*\*[：:]\s*([🟥🟨🟦]?)\s*(high|medium|low|高|中|低)?[\s\S]*?\*\*类别\*\*[：:]\s*([^\n]+)/i);
    let risk = "medium";
    let category = "";
    if (meta) {
      const raw = (meta[2] || "").toLowerCase();
      if (meta[1] === "🟥" || raw === "high" || raw === "高") risk = "high";
      else if (meta[1] === "🟦" || raw === "low" || raw === "低") risk = "low";
      else risk = "medium";
      category = meta[3].trim();
    }

    function extractSection(label: string): string {
      const re = new RegExp(
        `###\\s+${label}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n###\\s|\\n---|\\n##\\s|$)`,
        "i"
      );
      const m = body.match(re);
      if (!m) return "";
      let text = m[1].trim();
      // Strip leading `> ` blockquotes from scenario-style sections.
      text = text
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      return text;
    }

    const scenario = extractSection("情境重现");
    const mechanism = extractSection("套路是如何生效的");
    const defense = extractSection("如何识破与反制");
    const tip = extractSection("本地专家向导贴士");

    // 📚 数据证据（X 篇笔记 / Y 条评论，强度 N）
    let evidenceScore = 0;
    let noteCount = 0;
    let commentCount = 0;
    const evMatch = body.match(
      /数据证据[（(](\d+)\s*篇笔记\s*\/\s*(\d+)\s*条评论[，,]\s*强度\s*(\d+)[）)]/
    );
    if (evMatch) {
      noteCount = parseInt(evMatch[1], 10);
      commentCount = parseInt(evMatch[2], 10);
      evidenceScore = parseInt(evMatch[3], 10);
    }

    // Top notes: lines starting with `- [📍` etc.
    const topNotes: any[] = [];
    const noteRegex = /^\s*-\s+\[[^\]]+\]\(([^)]+)\)\s*(?:\(👍\s*([\d,]+)[^)]*\))?/gm;
    let nm: RegExpExecArray | null;
    while ((nm = noteRegex.exec(body))) {
      topNotes.push({ url: nm[1], likes: nm[2] ? parseInt(nm[2].replace(/,/g, ""), 10) : 0 });
    }

    // Real comment quotes: from `**真实评论摘录**：` until `---`
    const topComments: string[] = [];
    const qIdx = body.indexOf("**真实评论摘录**");
    if (qIdx >= 0) {
      const tail = body.slice(qIdx);
      const stop = tail.indexOf("\n---");
      const seg = stop >= 0 ? tail.slice(0, stop) : tail;
      const quoteRe = /^>\s?(.*)$/gm;
      let qm: RegExpExecArray | null;
      while ((qm = quoteRe.exec(seg))) {
        const t = qm[1].trim();
        if (t) topComments.push(t);
      }
    }

    out.push({
      id: `${defaultCity}-${slugify(title) || Math.random().toString(36).slice(2, 8)}`,
      city: defaultCity,
      slug: slugify(title),
      title,
      scamType: categoryToScamType(category),
      dangerLevel: riskToDangerLevel(risk),
      risk,
      category,
      scenario,
      mechanism,
      defense,
      tip,
      evidenceScore,
      noteCount,
      commentCount,
      topNotes,
      topComments,
      source: "md",
    });
  }
  return out;
}

app.post("/api/admin/import-scenarios", requireAdmin, async (req, res) => {
  try {
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const defaultCity = String(req.body?.defaultCity || "hangzhou");
    if (items.length === 0) {
      return res.status(400).json({ error: "items array is required." });
    }
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      const slug = it.slug || slugify(it.name || it.title || "");
      const title = it.name || it.title || slug;
      if (!title) continue;
      const status = await upsertScam({
        id: `${(it.city || defaultCity)}-${slug}`,
        city: it.city || defaultCity,
        slug,
        title,
        scamType: it.scamType || categoryToScamType(it.category || ""),
        dangerLevel: it.dangerLevel || riskToDangerLevel(it.risk || "medium"),
        risk: it.risk || "medium",
        category: it.category || "",
        scenes: deriveScenes({
          scamType: it.scamType || categoryToScamType(it.category || ""),
          category: it.category || "",
          explicitScenes: it.scenes,
        }),
        scenario: it.scenario || "",
        mechanism: it.mechanism || it.howItWorks || "",
        defense: it.defense || it.prevention || "",
        tip: it.tip || it.localProTip || "",
        evidenceScore: it.evidence_score ?? it.evidenceScore ?? 0,
        noteCount: it.note_count ?? it.noteCount ?? 0,
        commentCount: it.comment_count ?? it.commentCount ?? 0,
        keywords: Array.isArray(it.keywords) ? it.keywords : [],
        topNotes: Array.isArray(it.top_note_titles)
          ? it.top_note_titles.map((t: string, i: number) => ({ title: t, idx: i }))
          : Array.isArray(it.topNotes)
            ? it.topNotes
            : [],
        topComments: Array.isArray(it.top_comment_samples)
          ? it.top_comment_samples
          : Array.isArray(it.topComments)
            ? it.topComments
            : [],
        source: it.source || "scenarios.json",
        sortOrder: typeof it.sortOrder === "number" ? it.sortOrder : 0,
      });
      if (status === "inserted") inserted++;
      else updated++;
    }
    // invalidate scam cache so next fetch sees fresh data
    curatedCache.scams = undefined;
    res.json({ inserted, updated, total: items.length });
  } catch (err: any) {
    console.error("import-scenarios error:", err);
    res.status(500).json({ error: err?.message || "Import failed." });
  }
});

// Convenience endpoint for the in-app Admin button: reads the preset scenarios.json
// from D:/AI_project/旅游专题/data/final/scenarios.json and runs the same upsert logic.
app.post("/api/admin/import-scenarios-preset", requireAdmin, async (_req, res) => {
  const candidates = [
    path.resolve(process.cwd(), "..", "data", "final", "scenarios.json"),
    path.resolve(process.cwd(), "data", "final", "scenarios.json"),
  ];
  let resolved: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      resolved = c;
      break;
    }
  }
  if (!resolved) {
    return res.status(404).json({
      error:
        "scenarios.json not found. Expected at D:/AI_project/旅游专题/data/final/scenarios.json or relative data/final/scenarios.json.",
    });
  }
  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    const items: any[] = JSON.parse(raw);
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      const slug = it.slug || slugify(it.name || it.title || "");
      const title = it.name || it.title || slug;
      if (!title) continue;
      const status = await upsertScam({
        id: `${(it.city || "hangzhou")}-${slug}`,
        city: it.city || "hangzhou",
        slug,
        title,
        scamType: it.scamType || categoryToScamType(it.category || ""),
        dangerLevel: it.dangerLevel || riskToDangerLevel(it.risk || "medium"),
        risk: it.risk || "medium",
        category: it.category || "",
        scenario: it.scenario || "",
        mechanism: it.mechanism || it.howItWorks || "",
        defense: it.defense || it.prevention || "",
        tip: it.tip || it.localProTip || "",
        evidenceScore: it.evidence_score ?? it.evidenceScore ?? 0,
        noteCount: it.note_count ?? it.noteCount ?? 0,
        commentCount: it.comment_count ?? it.commentCount ?? 0,
        keywords: Array.isArray(it.keywords) ? it.keywords : [],
        topNotes: Array.isArray(it.top_note_titles)
          ? it.top_note_titles.map((t: string, i: number) => ({ title: t, idx: i }))
          : Array.isArray(it.topNotes)
            ? it.topNotes
            : [],
        topComments: Array.isArray(it.top_comment_samples)
          ? it.top_comment_samples
          : Array.isArray(it.topComments)
            ? it.topComments
            : [],
        source: "scenarios.json",
        sortOrder: 0,
      });
      if (status === "inserted") inserted++;
      else updated++;
    }
    curatedCache.scams = undefined;
    res.json({ inserted, updated, total: items.length, source: resolved });
  } catch (err: any) {
    console.error("import-scenarios-preset error:", err);
    res.status(500).json({ error: err?.message || "Preset import failed." });
  }
});

app.post("/api/admin/import-scenarios-md", requireAdmin, async (req, res) => {
  try {
    let content = String(req.body?.content || "");
    let defaultCity = String(req.body?.defaultCity || "hangzhou");

    // Content comes from an inline body or the fixed preset paths only.
    // Reading an arbitrary req.body.filePath was a path-traversal / arbitrary
    // file read and has been removed.
    if (!content && req.body?.presetPath) {
      // Default preset points to the cleaned dataset under the parent project.
      const candidates = [
        path.resolve(process.cwd(), "..", "data", "final", "杭州套路避坑指南.md"),
        path.resolve(process.cwd(), "data", "final", "杭州套路避坑指南.md"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          content = fs.readFileSync(c, "utf-8");
          if (!defaultCity || defaultCity === "hangzhou") {
            const m = c.match(/[\/\\]([^\/\\]+)套路避坑指南\.md$/);
            if (m && m[1]) defaultCity = m[1] === "杭州" ? "hangzhou" : m[1] === "上海" ? "shanghai" : "xian";
          }
          break;
        }
      }
    }

    if (!content) {
      return res.status(400).json({
        error:
          "No content provided. Pass either { content: '...' } or { presetPath: true }.",
      });
    }

    const items = parseScenariosMd(content, defaultCity);
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      const status = await upsertScam(it);
      if (status === "inserted") inserted++;
      else updated++;
    }
    curatedCache.scams = undefined;
    res.json({ inserted, updated, total: items.length, city: defaultCity });
  } catch (err: any) {
    console.error("import-scenarios-md error:", err);
    res.status(500).json({ error: err?.message || "MD import failed." });
  }
});

app.post("/api/admin/seed-from-code", requireAdmin, async (_req, res) => {
  // Re-run initDb() — it re-creates tables (IF NOT EXISTS) and seeds curated content only
  // when the tables are empty. After this call we clear the in-memory caches.
  await initDb();
  curatedCache.itineraries = undefined;
  curatedCache.scams = undefined;
  const [itinRows]: any = await pool.query("SELECT COUNT(*) as cnt FROM itineraries");
  const [scamRows]: any = await pool.query("SELECT COUNT(*) as cnt FROM scams");
  res.json({ itineraries: itinRows[0].cnt, scams: scamRows[0].cnt });
});

// Setup Vite development middleware or serve static files in production
async function setupServer() {
  // Production-only safety gates (added 2026-07).
  // In dev the dev fallback JWT_SECRET works; in prod we refuse to start
  // unless a real secret is configured so an attacker can't forge tokens.
  if (process.env.NODE_ENV === "production") {
    const fallback = "travel-guide-dev-secret-change-me";
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === fallback) {
      throw new Error(
        "JWT_SECRET must be set to a non-default value in production. Refusing to start.",
      );
    }
    if (!process.env.MINIMAX_API_KEY) {
      throw new Error("MINIMAX_API_KEY is required in production. Refusing to start.");
    }
  }

  try {
    await initDb();
  } catch (error: any) {
    console.error("Failed to connect to MySQL database:", error?.message || error);
    console.error("Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in your .env file.");
    process.exit(1);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
  });
}

setupServer();
