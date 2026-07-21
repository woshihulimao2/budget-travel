/**
 * Input guard — runs BEFORE the model is called.
 *
 * Pipeline (cheap and deterministic — no model call):
 *   1. shape validation (must be a non-empty string, under maxLen)
 *   2. indirect-injection check: scan every history item's `content`
 *      for jailbreak patterns. A clever attacker can poison history so
 *      that on a later turn the model "remembers" a fake system message.
 *   3. direct check on the new `message`: jailbreak → blocked keywords
 *   4. cleaning: strip whitespace-only padding and any literal `<system>`
 *      tag characters so they don't end up in the prompt as content.
 *
 * If everything passes, we return action="allow" + the cleaned message.
 * If anything trips, we return action="block" with a friendly refusal
 * that gets shown to the user as if it were a normal assistant reply
 * (so we don't reveal the filter to attackers).
 */

import {
  matchJailbreak,
  matchBlockedContent,
  type RuleHit,
} from "./moderationPatterns";
import { refusal, pickLocale, type RefusalKey } from "./refusalResponses";

export type GuardAction = "allow" | "block";

export type GuardVerdict =
  | {
      action: "allow";
      cleanedMessage: string;
      cleanedHistory: { role: "user" | "assistant"; content: string }[];
    }
  | {
      action: "block";
      ruleId: string;
      category: RuleHit["category"];
      reason: "empty" | "tooLong" | "jailbreak-history" | "jailbreak-message" | "blocked-content";
      userMessage: string;
    };

export interface HistoryItem {
  role: string;       // "user" | "model" | anything else (we'll normalize)
  content: string;
}

export interface InputGuardOptions {
  message: string;
  history?: HistoryItem[];
  maxLen: number;
  sourceMode?: string; // "overseas" → en refusal, else zh
  /** Per-history content cap. Default = 500 chars, matching server.ts. */
  historyItemMaxLen?: number;
}

const SYSTEM_MARKER_RE = /<\s*\/?\s*(system|im_start|im_end|internal|admin|root)\s*>/gi;

/**
 * Normalize a history item: collapse to {user|assistant}, drop anything else.
 * Also enforces a per-item content length cap.
 */
function normalizeHistory(
  history: HistoryItem[] | undefined,
  cap: number,
): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(history)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of history.slice(-10)) {
    if (!h || typeof h.content !== "string") continue;
    const role: "user" | "assistant" = h.role === "model" ? "assistant" : "user";
    // Truncate & strip any remaining <system> markers.
    const cleaned = h.content.slice(0, cap).replace(SYSTEM_MARKER_RE, "").trim();
    if (cleaned) out.push({ role, content: cleaned });
  }
  return out;
}

/**
 * Strip the most obvious injection vectors from user text without changing
 * the natural-language content the user typed (lowercase only — we don't
 * translate or paraphrase).
 */
function cleanMessage(input: string): string {
  return input
    .replace(SYSTEM_MARKER_RE, "")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

function blockVerdict(
  reason: "empty" | "tooLong" | "jailbreak-history" | "jailbreak-message" | "blocked-content",
  hit: RuleHit | null,
  userMessage: string,
  locale: "zh" | "en",
): GuardVerdict {
  return {
    action: "block",
    ruleId: hit?.ruleId ?? "len-001",
    category: hit?.category ?? "jailbreak",
    reason,
    userMessage,
  };
}

export function guardInput(opts: InputGuardOptions): GuardVerdict {
  const locale = pickLocale(opts.sourceMode);
  const historyCap = opts.historyItemMaxLen ?? 500;

  // 1. shape validation
  if (typeof opts.message !== "string" || opts.message.trim() === "") {
    return blockVerdict("empty", null, refusal("inputEmpty", locale), locale);
  }
  if (opts.message.length > opts.maxLen) {
    return blockVerdict(
      "tooLong",
      null,
      refusal("inputTooLong", locale, { maxLen: opts.maxLen }),
      locale,
    );
  }

  // 2. indirect-injection check: scan history FIRST so an attacker can't
  //    hide a payload in the previous user turn.
  for (const item of normalizeHistory(opts.history, historyCap)) {
    const hit = matchJailbreak(item.content) ?? matchBlockedContent(item.content);
    if (hit) {
      return blockVerdict(
        "jailbreak-history",
        hit,
        refusal("jailbreak", locale),
        locale,
      );
    }
  }

  // 3. direct check on current message
  const directHit = matchJailbreak(opts.message) ?? matchBlockedContent(opts.message);
  if (directHit) {
    const key: RefusalKey = directHit.category === "jailbreak" ? "jailbreak" : "blocked";
    return blockVerdict(
      directHit.category === "jailbreak" ? "jailbreak-message" : "blocked-content",
      directHit,
      refusal(key, locale),
      locale,
    );
  }

  // 4. clean and return
  return {
    action: "allow",
    cleanedMessage: cleanMessage(opts.message),
    cleanedHistory: normalizeHistory(opts.history, historyCap),
  };
}
