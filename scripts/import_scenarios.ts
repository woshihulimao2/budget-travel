/**
 * CLI: import curated content into MySQL.
 *
 *   npm run import:seed                        -> seed 7 itineraries + 9 scams from src/data.ts
 *   npm run import:scenarios <path>           -> upsert from a scenarios.json file
 *   npm run import:scenarios:md <path>        -> parse a 套路避坑指南.md file
 *
 * Defaults:
 *   scenarios.json path: ../../data/final/scenarios.json
 *   md path:              ../../data/final/杭州套路避坑指南.md
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { pool, upsertScam } from "../db";
import { deriveScenes, SCAM_TYPE_TO_SCENES } from "../src/safety/sceneDerivation";

dotenv.config();

type Mode = "json" | "md" | "seed";

// Re-export so consumers that `import { deriveScenes } from '../scripts/import_scenarios'`
// keep working.
export { deriveScenes };

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function parseScenariosMd(content: string, defaultCity = "hangzhou"): any[] {
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
    if (/^(套路速览|法律声明|数据来源|前言|简介|背景|写在最后)\b/.test(title)) continue;
    if (!/(情境重现|套路是如何生效的|如何识破与反制)/.test(body)) continue;

    const meta = body.match(
      /\*\*风险等级\*\*[：:]\s*([🟥🟨🟦]?)\s*(high|medium|low|高|中|低)?[\s\S]*?\*\*类别\*\*[：:]\s*([^\n]+)/i
    );
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

    const topNotes: any[] = [];
    const noteRegex = /^\s*-\s+\[[^\]]+\]\(([^)]+)\)\s*(?:\(👍\s*([\d,]+)[^)]*\))?/gm;
    let nm: RegExpExecArray | null;
    while ((nm = noteRegex.exec(body))) {
      topNotes.push({ url: nm[1], likes: nm[2] ? parseInt(nm[2].replace(/,/g, ""), 10) : 0 });
    }

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

    // Optional explicit scene block: **场景标签**：美食、住宿
    let explicitScenes: string[] = [];
    const sceneMatch = body.match(/\*\*场景标签\*\*[：:]\s*([^\n]+)/i);
    if (sceneMatch) {
      explicitScenes = sceneMatch[1]
        .split(/[、,，\/\|\s]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    const scamType = categoryToScamType(category);
    const scenes = deriveScenes({ scamType, category, explicitScenes });

    out.push({
      id: `${defaultCity}-${slugify(title) || Math.random().toString(36).slice(2, 8)}`,
      city: defaultCity,
      slug: slugify(title),
      title,
      scamType,
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
      scenes,
      source: "md",
    });
  }
  return out;
}

async function runJson(filePath: string) {
  const abs = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(abs, "utf-8");
  const items: any[] = JSON.parse(content);
  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    const slug = it.slug || slugify(it.name || it.title || "");
    const title = it.name || it.title || slug;
    if (!title) continue;
    const scamType = it.scamType || categoryToScamType(it.category || "");
    const scenes = deriveScenes({
      scamType,
      category: it.category || "",
      explicitScenes: it.scenes,
    });
    const status = await upsertScam({
      id: `${it.city || "hangzhou"}-${slug}`,
      city: it.city || "hangzhou",
      slug,
      title,
      scamType,
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
      scenes,
      source: "scenarios.json",
      sortOrder: 0,
    });
    if (status === "inserted") inserted++;
    else updated++;
  }
  console.log(`✅ scenarios.json imported: ${inserted} inserted, ${updated} updated (total ${items.length}).`);
}

async function runMd(filePath: string) {
  const abs = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(abs, "utf-8");

  // Try to infer defaultCity from the filename, e.g. 杭州套路避坑指南.md -> hangzhou
  let defaultCity = "hangzhou";
  const cityMatch = abs.match(/[\/\\]([^\/\\]+)套路避坑指南\.md$/);
  if (cityMatch) {
    const name = cityMatch[1];
    if (name === "杭州") defaultCity = "hangzhou";
    else if (name === "上海") defaultCity = "shanghai";
    else if (name === "西安" || name === "长安") defaultCity = "xian";
  }

  const items = parseScenariosMd(content, defaultCity);
  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    const status = await upsertScam(it);
    if (status === "inserted") inserted++;
    else updated++;
  }
  console.log(
    `✅ md imported (${defaultCity}): ${inserted} inserted, ${updated} updated (total ${items.length}).`
  );
}

async function runSeed() {
  // We rely on initDb() doing the seed when tables are empty. Truncate first, then call initDb.
  // Note: this script shares the same connection pool as the live server, so truncate can be
  // destructive. We recommend stopping the server before running this command.
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  await pool.query("TRUNCATE TABLE itinerary_stops");
  await pool.query("TRUNCATE TABLE itineraries");
  await pool.query("TRUNCATE TABLE scams");
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");

  // Re-import initDb's side-effects: it re-runs CREATE IF NOT EXISTS and, since the tables are
  // now empty, re-seeds via seedCuratedContent(). We import dynamically to avoid pulling in
  // dotenv twice.
  const { initDb } = await import("../db");
  await initDb();
  const [itinRows]: any = await pool.query("SELECT COUNT(*) as cnt FROM itineraries");
  const [scamRows]: any = await pool.query("SELECT COUNT(*) as cnt FROM scams");
  console.log(`✅ seed: itineraries=${itinRows[0].cnt}, scams=${scamRows[0].cnt}`);
}

async function main() {
  const mode = (process.argv[2] || "seed") as Mode;
  const fileArg = process.argv[3];

  try {
    if (mode === "json") {
      const fp = fileArg || path.resolve(process.cwd(), "..", "data", "final", "scenarios.json");
      await runJson(fp);
    } else if (mode === "md") {
      const fp =
        fileArg ||
        path.resolve(process.cwd(), "..", "data", "final", "杭州套路避坑指南.md");
      await runMd(fp);
    } else if (mode === "seed") {
      await runSeed();
    } else {
      console.error(`Unknown mode: ${mode}. Use one of: json | md | seed`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Import failed:", err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();