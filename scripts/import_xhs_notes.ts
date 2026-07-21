/**
 * CLI: import `衣_购物` 类小红书笔记 + 媒体明细到 MySQL。
 *
 *   npm run import:xhs-notes                        # 跑默认 csv (衣_购物)
 *   npm run import:xhs-notes -- <path/to.csv>       # 自定义 csv 路径
 *   npm run import:xhs-notes -- --dry-run [path]    # 仅打印统计，不入库
 *
 * 行为：
 *  1. 用 utf-8-sig 读 csv（兼容 BOM）；复用现有 csv 模块（Node 22+ 自带）。
 *  2. 对每条记录用关键词筛选"衣/购物"主题（标题/正文/tags）—— 与筛选无关的标记
 *     note_relevant=0 仍入库，便于审计；显式 --strict 时直接跳过。
 *  3. upsertHotNote 写入 hot_notes；image_list 用 | 拆分；video_url 用主 URL；每条
 *     media 用 sha256(url) 去重。
 *  4. 失败的行（缺 id/url/必填列）打到 stderr，整批不中断。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool, upsertHotNote, insertNoteMedia, clearNoteMedia } from "../db";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Config: csv path / category 推断 / 关键词表
// ---------------------------------------------------------------------------

const DEFAULT_CSVS: Record<string, string> = {
  衣: "xhs_notes_衣_购物.csv",
  食: "xhs_notes_食_餐饮.csv",
  住: "xhs_notes_住_住宿.csv",
  行: "xhs_notes_行_交通.csv",
  其他: "xhs_notes_其他_攻略.csv",
};

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const strict = argv.includes("--strict");
const categoryArgIdx = argv.findIndex((a) => a === "--category");
const explicitCategory =
  categoryArgIdx >= 0 && argv[categoryArgIdx + 1]
    ? argv[categoryArgIdx + 1]
    : undefined;
const positional = argv.filter(
  (a, i) => !a.startsWith("--") && i !== categoryArgIdx + 1,
);
const csvPathArg = positional[0];

let csvPath: string;
let categoryHint: string | undefined;
if (csvPathArg) {
  csvPath = path.resolve(csvPathArg);
  const baseName = path.basename(csvPath);
  for (const [cat, file] of Object.entries(DEFAULT_CSVS)) {
    if (file === baseName) {
      categoryHint = cat;
      break;
    }
  }
} else {
  const defaultCat = explicitCategory ?? "衣";
  categoryHint = defaultCat;
  csvPath = path.resolve(
    __dirname,
    `../../data/cleaned/${DEFAULT_CSVS[defaultCat]}`,
  );
}
if (!csvPath.endsWith(".csv")) {
  console.error(`[import_xhs_notes] csv path must end with .csv: ${csvPath}`);
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`[import_xhs_notes] csv not found: ${csvPath}`);
  process.exit(1);
}

// 各 category 的关键词字典 —— 命中越多越相关，0 命中则标记 note_relevant=0。
// 注意：本表与 scam/scenes 都无关；专用于 xhs 各品类 csv 的内容筛选。
const TOPIC_KEYWORDS_BY_CATEGORY: Record<string, string[]> = {
  衣: [
    "购", "买", "购物", "剁手", "种草", "安利",
    "丝", "丝绸", "真丝", "丝巾",
    "礼", "伴手", "伴手礼", "特产", "手信",
    "龙井", "茶叶", "茶", "春茶", "明前",
    "老字号", "国货", "文创",
    "玉", "玉器", "手镯", "吊坠", "项链", "首饰", "银饰",
    "伞", "丝绸伞", "檀木扇", "扇子",
    "皮", "皮包", "箱包",
    "中药", "药妆", "老中医", "化妆品",
    "零食", "辣条", "果脯", "糕点", "酥",
    "souvenir", "shop", "shopping", "silk", "tea", "longjing",
  ],
  食: [
    "餐厅", "饭店", "菜", "菜品", "口味", "招牌",
    "吃", "美食", "馋", "味", "舌尖", "味道",
    "火锅", "烧烤", "烤肉", "面", "面馆", "拉面",
    "饺子", "馄饨", "汤", "汤包", "小笼", "包子",
    "奶茶", "咖啡", "茶饮", "甜品", "蛋糕", "糕",
    "西餐", "日料", "韩餐", "泰餐", "川菜", "粤菜",
    "杭帮菜", "西湖醋鱼", "东坡肉", "龙井虾仁", "宋嫂鱼羹",
    "排队", "等位", "网红", "踩雷", "避雷", "翻车",
    "自助", "火锅自助", "甜品自助",
    "饭店", "餐馆", "小馆", "食堂", "餐厅",
    "食物", "饮食", "点菜", "菜单",
    "food", "restaurant", "eat", "drink", "cafe",
  ],
  住: [
    "酒店", "宾馆", "民宿", "客栈", "招待所", "青旅", "旅馆", "公寓",
    "入住", "退房", "房费", "押金", "房型", "预订", "预定", "订房",
    "民宿照骗", "照骗", "实景", "避雷", "踩雷",
    "位置", "地铁", "步行", "周边",
    "床单", "卫生", "隔音", "空调", "热水",
    "前台", "服务", "态度",
    "hotel", "inn", "hostel", "room", "book", "reservation",
  ],
  行: [
    "打车", "出租", "网约车", "滴滴", "高德", "地图",
    "公交", "大巴", "巴士", "地铁", "高铁", "火车", "动车",
    "机场", "车站", "浦东", "萧山", "虹桥", "上海虹桥",
    "黑车", "拉客", "拒载", "绕路", "不打表", "议价",
    "司机", "拼车", "专车", "顺风车",
    "骑行", "共享单车", "哈罗", "美团单车", "青桔",
    "动车", "高铁票", "12306", "抢票", "实名",
    "机场大巴", "摆渡", "接送", "包车",
    "taxi", "bus", "subway", "metro", "airport", "train",
    "station", "driver", "ride", "bike",
  ],
  其他: [
    // 「其他」csv 含各种杭州 citywalk、热门景点、地标摄影、避雷综合话题。
    // 关键词表放宽覆盖典型「攻略/推荐/避雷/值得去」等共通词；note_relevant 仍按命中计数。
    "攻略", "推荐", "种草", "安利", "避雷", "踩雷", "防坑", "套路",
    "杭州", "citywalk", "周末", "小众", "必去", "必打卡", "打卡",
    "西湖", "灵隐", "宋城", "千岛湖", "乌镇", "西塘",
    "拍照", "机位", "夜景", "日出", "日落", "云海", "太子尖",
    "citywalk", "tour", "guide", "hangzhou", "trip",
  ],
};

function normalizeText(s: string | null | undefined): string {
  return (s || "").toString();
}

function calcRelevance(
  title: string,
  content: string,
  tags: string,
  category: string,
  subTag: string,
): { relevance: number; hits: string[]; relevant: boolean } {
  const keywords = TOPIC_KEYWORDS_BY_CATEGORY[category] || [];
  const haystack =
    `${normalizeText(title)} ${normalizeText(content)} ${normalizeText(tags)}`.toLowerCase();
  const hits: string[] = [];
  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) hits.push(kw);
  }
  if (hits.length === 0) {
    // 兜底：category 直接命中（如 subTag 非空且与 category 一致）也算 related
    if (subTag && subTag === category) hits.push("(cat_self)");
  }
  const relevance = Math.min(1, 0.1 * hits.length + 0.1);
  return {
    relevance: Math.round(relevance * 100) / 100,
    hits: Array.from(new Set(hits)),
    relevant: hits.length >= 1,
  };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

interface RawRow {
  platform: string;
  platform_name: string;
  id: string;
  category: string;
  category_all: string;
  category_scores: string;
  title: string;
  content: string;
  content_length: string;
  tags: string;
  author: string;
  type: string;
  media_type: string;
  liked_count: string;
  collected_count: string;
  comment_count: string;
  share_count: string;
  publish_time: string;
  url: string;
  source_keyword: string;
  video_url: string;
  cover: string;
  image_list: string;
}

/**
 * 简易 CSV 解析器：能处理引号包裹的字段（含逗号 / 换行 / 中文标点）。
 * 不依赖第三方 csv 库，便于阅读。Buffer 模式读 + 字符级 state machine。
 */
function parseCsv(text: string): RawRow[] {
  // 去 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // skip
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = (cols[i] ?? "").trim();
    }
    return obj as unknown as RawRow;
  });
}

// image_list 用 | 分隔单图 URL（实测确认）。空字符串视为空列表。
function splitImageList(s: string): string[] {
  if (!s) return [];
  const parts = s.split("|").map((x) => x.trim()).filter(Boolean);
  // 兜底：如果整段不含 | 但是 http，逗号分隔也支持
  if (parts.length === 1 && parts[0].includes(",")) {
    return parts[0]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return parts;
}

function normalizeMediaType(raw: string): "image" | "video" | "mixed" {
  const r = raw.toLowerCase();
  if (r === "video") return "video";
  if (r === "image") return "image";
  return "mixed";
}

function parseIntOrZero(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // 常见格式 'YYYY-MM-DD HH:mm:ss' / 'YYYY-MM-DD' / ISO 标准格式
  // 不能加 "Z"（UTC），否则数据库按本机时区解析会偏移。MySQL 期望本地时区 Date 对象。
  const isoLike = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() < 1990) return null;
  return d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  console.log(
    `[import_xhs_notes] csv=${csvPath} rows=${rows.length} dryRun=${dryRun} strict=${strict}`,
  );

  let kept = 0;
  let skippedNoMedia = 0;
  let skippedStrict = 0;
  let dbInserted = 0;
  let dbUpdated = 0;
  let imgInserted = 0;
  let vidInserted = 0;
  const failures: string[] = [];

  for (const r of rows) {
    if (!r.id || !r.url) {
      failures.push(`row missing id/url: ${r.title?.slice(0, 40)}`);
      continue;
    }
    const images = splitImageList(r.image_list);
    const hasVideo = (r.video_url || "").startsWith("http");
    const subTag = r.category_all.includes("|") ? r.category_all.split("|")[0] : r.category_all;
    const rel = calcRelevance(r.title, r.content, r.tags, r.category, subTag);

    if (images.length === 0 && !hasVideo && !r.cover) {
      skippedNoMedia++;
      continue;
    }

    if (strict && !rel.relevant) {
      skippedStrict++;
      continue;
    }

    kept++;
    if (dryRun) continue;

    try {
      const res = await upsertHotNote({
        id: r.id,
        platform: r.platform || "xhs",
        category: r.category || "衣",
        subCategory: subTag || null,
        title: r.title || "(无标题)",
        content: r.content || null,
        author: r.author || null,
        publishTime: parseDate(r.publish_time),
        sourceUrl: r.url,
        sourceKeyword: r.source_keyword || null,
        mediaType: normalizeMediaType(r.media_type),
        coverUrl: r.cover || null,
        likedCount: parseIntOrZero(r.liked_count),
        collectedCount: parseIntOrZero(r.collected_count),
        commentCount: parseIntOrZero(r.comment_count),
        shareCount: parseIntOrZero(r.share_count),
        tags: r.tags ? r.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        relevance: rel.relevance,
        noteRelevant: rel.relevant,
      });
      if (res === "inserted") dbInserted++;
      else dbUpdated++;

      // 媒体明细：先清再插（幂等），统一按 seq 排序
      await clearNoteMedia(r.id, "image");
      await clearNoteMedia(r.id, "video");
      let seq = 0;
      for (const u of images) {
        await insertNoteMedia("image", { noteId: r.id, seq: seq++, url: u });
        imgInserted++;
      }
      if (hasVideo) {
        await insertNoteMedia("video", {
          noteId: r.id,
          seq: 0,
          url: r.video_url,
        });
        vidInserted++;
      }
    } catch (e: any) {
      failures.push(`id=${r.id} ${e?.message || e}`);
    }
  }

  console.log(`[import_xhs_notes] kept=${kept} dbInserted=${dbInserted} dbUpdated=${dbUpdated} imgInserted=${imgInserted} vidInserted=${vidInserted}`);
  if (skippedNoMedia) console.log(`[import_xhs_notes] skippedNoMedia=${skippedNoMedia}`);
  if (skippedStrict) console.log(`[import_xhs_notes] skippedStrict=${skippedStrict}`);
  if (failures.length) {
    console.error(`[import_xhs_notes] failures=${failures.length}`);
    failures.slice(0, 10).forEach((f) => console.error("  - " + f));
  }

  await pool.end();
}

main().catch((e) => {
  console.error("[import_xhs_notes] fatal:", e);
  process.exit(2);
});
