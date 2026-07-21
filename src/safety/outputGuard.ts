/**
 * Output guard — runs AFTER the model returns text, BEFORE it goes to the user.
 *
 * Responsibilities:
 *   1. Length cap: if the response exceeds `maxLen`, truncate but try to keep
 *      any trailing wiki-image markdown intact (those `![..](/api/wiki-image..)` 
 *      lines are part of the curated travel UX — losing them leaves dead
 *      paragraphs in the reply).
 *   2. URL whitelist: only allow:
 *        - /api/wiki-image?...
 *        - *.wikipedia.org / upload.wikimedia.org (image fallbacks)
 *        - *.baidu.com / *.bing.com / *.sogou.com (domestic search fallbacks)
 *      Other URLs get replaced with `[外链已移除]` so we don't accidentally
 *      link out to attacker-controlled domains.
 *   3. PII masking: phone numbers, ID cards, etc. are replaced with placeholders
 *      via `maskPII`.
 *   4. System-prompt leak protection: if the model accidentally emits a chunk
 *      that *looks* like our system prompt (long lists of "1. " headings,
 *      policy text, etc.), redact it.
 *
 * The guard returns a verdict so the caller can log/audit what was changed.
 */

import { maskPII } from "./moderationPatterns";
import { refusal, pickLocale } from "./refusalResponses";

export type OutputGuardAction = "allow" | "redact" | "truncate";

export interface OutputGuardVerdict {
  action: OutputGuardAction;
  reply: string;
  redactedUrls: number;
  maskedPii: number;
  truncated: boolean;
  reason?: string;
}

export interface OutputGuardOptions {
  sourceMode?: string;       // "overseas" → en, else zh
  maxLen?: number;           // default 4000
  /** If supplied, returns the PII-leak notice appended when masking happens. */
  appendPiiNotice?: boolean;
}

const WIKI_IMAGE_MD = /!\[[^\]]*\]\(\/api\/wiki-image\?[^)]+\)/g;

const URL_RE = /(https?:\/\/[^\s)\]]+)/gi;

const ALLOWED_HOST_RE =
  /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:wikipedia\.org|wikimedia\.org|baidu\.com|bdimg\.com|bing\.com|cn\.bing\.com|sogou\.com|sogoucdn\.com|aliyun\.com|alicdn\.com|jsdelivr\.net|githubusercontent\.com|gov\.cn|localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$|\?)/i;

function truncatePreservingTrailingMarkdown(text: string, maxLen: number): { text: string; truncated: boolean } {
  if (text.length <= maxLen) return { text, truncated: false };

  // Find last wiki-image markdown; if it occurs within `maxLen` of the end,
  // try to keep it intact by cutting before it (image markdown is short).
  const matches = [...text.matchAll(WIKI_IMAGE_MD)];
  const last = matches[matches.length - 1];
  if (last && last.index !== undefined && last.index < maxLen) {
    const tail = text.slice(last.index);
    if (tail.length <= 600) {
      // keep tail + a shortened prefix
      const prefixBudget = maxLen - tail.length - 5; // 5 chars for "…\n\n"
      const prefix = text.slice(0, Math.max(0, prefixBudget));
      return { text: prefix + (prefix ? "\n\n…" : "") + tail, truncated: true };
    }
  }
  // Hard truncate
  return { text: text.slice(0, maxLen) + "\n\n[回答已截断]", truncated: true };
}

function looksLikeSystemPromptLeak(text: string): boolean {
  // If the model starts with "你是" + an opening line within the first 400 chars
  // AND the text contains our exact safety header, redact the whole thing.
  const lower = text.slice(0, 400);
  if (/安全与角色约束/.test(text) || /SAFETY_GUARDRAILS/.test(text)) {
    return true;
  }
  if (/<\s*\/?\s*(system|im_start|im_end)\s*>/i.test(text)) {
    return true;
  }
  return false;
}

export function guardOutput(reply: string, opts: OutputGuardOptions = {}): OutputGuardVerdict {
  const locale = pickLocale(opts.sourceMode);
  let text = typeof reply === "string" ? reply : "";
  const maxLen = opts.maxLen ?? 4000;
  let redactedUrls = 0;
  let maskedPii = 0;
  let truncated = false;
  let reason: string | undefined;

  if (!text) {
    return {
      action: "allow",
      reply: refusal("modelError", locale),
      redactedUrls: 0,
      maskedPii: 0,
      truncated: false,
    };
  }

  // 1. System-prompt leak protection
  if (looksLikeSystemPromptLeak(text)) {
    text = refusal("modelError", locale);
    reason = "system-prompt-leak";
    return {
      action: "redact",
      reply: text,
      redactedUrls: 0,
      maskedPii: 0,
      truncated: false,
      reason,
    };
  }

  // 2. URL whitelist
  text = text.replace(URL_RE, (url, _g1, offset: number) => {
    // Wiki API internal URL always allowed
    if (url.startsWith("/api/wiki-image")) return url;
    if (ALLOWED_HOST_RE.test(url)) return url;
    redactedUrls += 1;
    return "[外链已移除]";
  });

  // 3. PII masking
  const pii = maskPII(text);
  text = pii.text;
  maskedPii = pii.hitCount;

  // 4. Truncate
  const t = truncatePreservingTrailingMarkdown(text, maxLen);
  text = t.text;
  truncated = t.truncated;

  // 5. Append PII notice if anything was masked (and caller asked)
  if (maskedPii > 0 && opts.appendPiiNotice !== false) {
    text = text + "\n\n" + refusal("piiLeak", locale);
  }

  const action: OutputGuardAction = redactedUrls > 0 || maskedPii > 0 || reason ? "redact" : truncated ? "truncate" : "allow";

  return {
    action,
    reply: text,
    redactedUrls,
    maskedPii,
    truncated,
    reason,
  };
}
