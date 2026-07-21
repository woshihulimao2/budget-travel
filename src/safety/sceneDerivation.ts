/**
 * Scene-tag derivation — shared between the server (admin import endpoints),
 * the CLI importer (scripts/import_scenarios.ts), and unit tests.
 *
 * Three layers, evaluated in priority order:
 *   1. Explicit scenes from the upstream data (JSON "scenes" or MD **场景标签** block).
 *      Accepts both enum names ("Food") and Chinese labels ("美食").
 *   2. Heuristic mapping from scamType (the 5-slot enum from the editor).
 *   3. Keyword fallback using the free-text `category` (e.g. "茶托/酒托", "丝绸").
 *
 * The layers are NOT mixed: once we get a non-empty hit we stop. This makes the
 * behaviour predictable and easy to unit-test. It also keeps stale explicit
 * tags from being silently overridden by category text.
 */

import { SCENE_TAGS, type SceneTag } from "../types";
import { SCENE_LABELS_ZH } from "../data";

const SCENE_SET = new Set<SceneTag>(SCENE_TAGS);

export const SCAM_TYPE_TO_SCENES: Record<string, SceneTag[]> = {
  "Tea House":     ["Food"],
  "Fake Goods":    ["Apparel"],
  "Transport":     ["Transport"],
  "Overcharging":  ["Food", "Lodging"],
  "Crowd Warning": ["Transport"],
};

export const CATEGORY_TEXT_TO_SCENES: Array<{ kw: string | RegExp; scenes: SceneTag[] }> = [
  { kw: "茶托", scenes: ["Food"] },
  { kw: "酒托", scenes: ["Food"] },
  { kw: "咖啡", scenes: ["Food"] },
  { kw: "餐厅", scenes: ["Food"] },
  { kw: "回民街", scenes: ["Food"] },
  { kw: "夜市",   scenes: ["Food"] },
  { kw: "丝绸", scenes: ["Apparel"] },
  { kw: "玉器", scenes: ["Apparel"] },
  { kw: "龙井", scenes: ["Apparel"] },
  { kw: "购物", scenes: ["Apparel"] },
  { kw: "假货", scenes: ["Apparel"] },
  { kw: "山寨", scenes: ["Apparel"] },
  { kw: "黑车", scenes: ["Transport"] },
  { kw: "大巴", scenes: ["Transport"] },
  { kw: "机场", scenes: ["Transport"] },
  { kw: "车站", scenes: ["Transport"] },
  { kw: "出租", scenes: ["Transport"] },
  { kw: "公交", scenes: ["Transport"] },
  { kw: "住宿", scenes: ["Lodging"] },
  { kw: "民宿", scenes: ["Lodging"] },
  { kw: "跟团", scenes: ["Lodging"] },
  { kw: "酒店", scenes: ["Lodging"] },
];

function sanitizeExplicitScenes(arr: unknown): SceneTag[] {
  if (!Array.isArray(arr)) return [];
  const out: SceneTag[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if ((SCENE_TAGS as string[]).includes(trimmed)) {
      if (!out.includes(trimmed as SceneTag)) out.push(trimmed as SceneTag);
      continue;
    }
    // Map Chinese label → enum name
    for (const t of SCENE_TAGS) {
      if (SCENE_LABELS_ZH[t] === trimmed && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

export interface DeriveScenesInput {
  scamType?: string;
  category?: string;
  explicitScenes?: unknown;
}

export function deriveScenes(input: DeriveScenesInput): SceneTag[] {
  const explicit = sanitizeExplicitScenes(input.explicitScenes);
  if (explicit.length > 0) return explicit;

  const set = new Set<SceneTag>();
  if (input.scamType && SCAM_TYPE_TO_SCENES[input.scamType]) {
    for (const s of SCAM_TYPE_TO_SCENES[input.scamType]) set.add(s);
  }
  if (set.size === 0 && input.category) {
    for (const rule of CATEGORY_TEXT_TO_SCENES) {
      const ok =
        rule.kw instanceof RegExp ? rule.kw.test(input.category) : input.category.includes(rule.kw);
      if (ok) for (const s of rule.scenes) set.add(s);
    }
  }
  return Array.from(set);
}

export function isSceneTag(s: unknown): s is SceneTag {
  return typeof s === "string" && SCENE_SET.has(s as SceneTag);
}
