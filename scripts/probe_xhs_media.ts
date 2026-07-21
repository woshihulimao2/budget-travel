/**
 * CLI: 探测 note_images / note_videos 里的 URL 可达性，写回 media_status。
 *
 *   npm run probe:xhs-media
 *   npm run probe:xhs-media -- --limit 100          # 每次最多探 100 条
 *   npm run probe:xhs-media -- --concurrency 20    # 并发请求数
 *   npm run probe:xhs-media -- --force             # 重新探测所有（包括已 probe 的）
 *
 * 行为：
 *  - 仅探测 media_status='unknown' 的 URL（或 --force 全量）
 *  - 使用 Node 22+ 原生 fetch（HEAD 请求优先，必要时回退 GET + Range: bytes=0-0）
 *  - 并发上限避免瞬时 DDoS 风格
 *  - 每条结果立即入库；最终 report 失败/成功分布
 *
 * ⚠️ 注意：
 *  - 这是离线 curl 探测；不携带小红书登录 cookie。多数 snscdn URL 会回 403。
 *    这种 url 归为 auth_required —— 前端应当用占位图 + 跳转到原始小红书 explore 页。
 *  - 如果后续接入了图床代理或者从小红书 app 同步签名 token，可以再加一条分类。
 */
import dotenv from "dotenv";
import {
  pool,
  fetchUnprobedMedia,
  updateNoteMediaProbe,
  classifyHttpStatus,
} from "../db";

dotenv.config();

const argv = process.argv.slice(2);
const limitArg = argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 500;
const concArg = argv.find((a) => a.startsWith("--concurrency="));
const concurrency = concArg ? Number.parseInt(concArg.split("=")[1], 10) : 8;
const force = argv.includes("--force");

// 自定义 UA：模拟 Chrome macOS，能解开部分 sns CDN 鉴权（其实多数仍然 403）
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface ProbeResult {
  mediaStatus: "reachable" | "auth_required" | "gone" | "error";
  httpStatus: number | null;
  bytes: number | null;
  contentType: string | null;
}

/**
 * 探测单个 URL。
 *  - 先 HEAD（轻量）
 *  - 若 HEAD 返回 405 或 501 等不允许方法，回退 GET + Range: bytes=0-0
 *  - 一切异常归 error
 */
async function probeOnce(url: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  const headers = {
    "User-Agent": UA,
    "Referer": "https://www.xiaohongshu.com/",
    "Accept": "*/*",
  };

  const tryFetch = async (method: "HEAD" | "GET"): Promise<ProbeResult> => {
    try {
      const res = await fetch(url, {
        method,
        headers: { ...headers, ...(method === "GET" ? { Range: "bytes=0-0" } : {}) },
        redirect: "follow",
        signal: ctrl.signal,
      });
      const ct = res.headers.get("content-type") || null;
      const cl = Number.parseInt(res.headers.get("content-length") || "0", 10);
      const status = res.status;
      return {
        mediaStatus: classifyHttpStatus(status),
        httpStatus: status,
        bytes: Number.isFinite(cl) && cl > 0 ? cl : null,
        contentType: ct,
      };
    } finally {
      clearTimeout(t);
    }
  };

  try {
    let r = await tryFetch("HEAD");
    // 一些 CDN 不支持 HEAD，回退 GET
    if (r.httpStatus === 405 || r.httpStatus === 501) {
      r = await tryFetch("GET");
    }
    return r;
  } catch (e: any) {
    return {
      mediaStatus: "error",
      httpStatus: null,
      bytes: null,
      contentType: null,
    };
  }
}

/**
 * 简易并发限流：固定 worker 数跑任务队列
 */
async function runWithConcurrency<T, R>(
  items: T[],
  workerCount: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function loop() {
    while (true) {
      const my = idx++;
      if (my >= items.length) return;
      try {
        out[my] = await fn(items[my]);
      } catch (e: any) {
        out[my] = null as unknown as R;
      }
    }
  }
  const workers = Array.from({ length: Math.min(workerCount, items.length) }, loop);
  await Promise.all(workers);
  return out;
}

async function main() {
  console.log(
    `[probe_xhs_media] limit=${limit} concurrency=${concurrency} force=${force}`,
  );

  // 这里 fetchUnprobedMedia 默认只取 status='unknown'；--force 时我们扩展一句
  let pending = await fetchUnprobedMedia(limit);
  if (force) {
    // 全量重探
    const [imgRows]: any = await pool.query(
      `SELECT url, url_hash AS urlHash FROM note_images LIMIT ?`,
      [limit],
    );
    const [vidRows]: any = await pool.query(
      `SELECT url, url_hash AS urlHash FROM note_videos LIMIT ?`,
      [limit],
    );
    pending = [];
    for (const r of imgRows) pending.push({ kind: "image", url: r.url, urlHash: r.urlHash });
    for (const r of vidRows) pending.push({ kind: "video", url: r.url, urlHash: r.urlHash });
  }

  console.log(`[probe_xhs_media] pending=${pending.length}`);

  let counts = { reachable: 0, auth_required: 0, gone: 0, error: 0 };
  const errors: string[] = [];
  let processed = 0;

  await runWithConcurrency(pending, concurrency, async (p) => {
    const r = await probeOnce(p.url);
    try {
      await updateNoteMediaProbe(p.kind, p.urlHash, r);
      counts[r.mediaStatus]++;
    } catch (e: any) {
      errors.push(`update fail ${p.url.slice(0, 60)}: ${e?.message || e}`);
    }
    processed++;
    if (processed % 20 === 0) {
      console.log(`[probe_xhs_media] progress ${processed}/${pending.length}`);
    }
  });

  console.log(`[probe_xhs_media] done: ${JSON.stringify(counts)}`);
  if (errors.length) {
    console.error(`[probe_xhs_media] errors=${errors.length}`);
    errors.slice(0, 5).forEach((e) => console.error("  - " + e));
  }

  await pool.end();
}

main().catch((e) => {
  console.error("[probe_xhs_media] fatal:", e);
  process.exit(2);
});
