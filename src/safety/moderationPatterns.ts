/**
 * Moderation patterns — the "rulebook" used by input/output guards.
 *
 * Every rule is a regular expression paired with an internal `ruleId`
 * (used for logs and tests). Rules are organized in three buckets:
 *
 *   1. JAILBREAK_PATTERNS — attempts to override the system prompt
 *      (role override, prompt injection, "translate this", DAN mode...).
 *      Hard-blocked regardless of language.
 *
 *   2. BLOCKED_KEYWORDS — out-of-scope content (violence, illegal activity,
 *      explicit sexual content, etc.). Hard-blocked. Note: we deliberately
 *      do NOT encode political entity names here — the system prompt asks
 *      the model to refuse those, and we only enforce a hard block when the
 *      user is clearly asking for illicit action (e.g. asking how to make a
 *      weapon, asking where to buy drugs).
 *
 *   3. PII_PATTERNS — used by the OUTPUT guard to mask Personally
 *      Identifiable Information that the model might accidentally emit
 *      (phone numbers, ID cards, bank cards, passport numbers).
 *
 * IMPORTANT: This file is intentionally pure data + tiny helpers. No I/O,
 * no state. You can edit/add rules at any time without restarting the
 * server (just edit the file and hot-reload in dev, or redeploy in prod).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleCategory =
  | "jailbreak"
  | "violence"
  | "illegal"
  | "sexual"
  | "harassment"
  | "pii";

export interface RuleHit {
  ruleId: string;
  category: RuleCategory;
  excerpt: string; // redacted snippet, safe to log
}

export interface KeywordRule {
  pattern: RegExp;
  ruleId: string;
  category: RuleCategory;
  /**
   * If true: matched input -> hard block reply.
   * If false: matched input -> log warning but allow (used for noisy patterns
   *            where false positives would harm UX).
   */
  hardBlock: boolean;
}

export interface PiiRule {
  pattern: RegExp;
  ruleId: string;
  /** Replacement string. `***` masks a single group; use the string verbatim. */
  replacement: string;
}

// ---------------------------------------------------------------------------
// 1. Jailbreak / prompt injection patterns
// ---------------------------------------------------------------------------
//
// These patterns are intentionally broad — false positives are acceptable
// here because the worst-case is a frustrated user who can rephrase. The cost
// of letting a successful injection through is much higher (model hijack,
// system prompt leak, costly / harmful output).

export const JAILBREAK_PATTERNS: KeywordRule[] = [
  // "ignore previous instructions"
  {
    pattern: /忽略\s*(之前|上面|先前|以上|早前|以下)?[\s\S]{0,6}?(所有|先前|之前|的)?[\s\S]{0,6}?(指令|提示|规则|约束|指示)/i,
    ruleId: "jb-ignore-instructions",
    category: "jailbreak",
    hardBlock: true,
  },
  // English "ignore previous instructions"
  {
    pattern: /\b(ignore|disregard|forget)\b[\s\S]{0,30}\b(previous|above|prior|earlier|all|the)\b[\s\S]{0,15}\b(instruction|prompt|rule|directive|context)/i,
    ruleId: "jb-ignore-instructions-en",
    category: "jailbreak",
    hardBlock: true,
  },
  // "you are now X" / "act as" / "pretend to be"
  {
    pattern: /(你\s*(现在|从现在起)\s*(是|扮演|变成)|act\s+as\s+|pretend\s+(to\s+be|you\s+are)|you\s+are\s+now\s+(a|an|the)\s+)/i,
    ruleId: "jb-role-override",
    category: "jailbreak",
    hardBlock: true,
  },
  // DAN / developer / jailbreak modes
  {
    pattern: /\b(DAN\s+mode|do\s+anything\s+now|developer\s+mode|jailbreak\s+mode|god\s*mode|unrestricted\s+mode)\b/i,
    ruleId: "jb-dan-mode",
    category: "jailbreak",
    hardBlock: true,
  },
  // "assume you have no rules" / "assume you are not bound"
  {
    pattern: /(假设|假定)\s*(你|你现在)?\s*(没有|不受|摆脱|忽略|无视)\s*(任何|所有)?\s*(限制|规则|约束|边界|道德)/i,
    ruleId: "jb-assume-unbound",
    category: "jailbreak",
    hardBlock: true,
  },
  // Direct prompt injection markers: <system>, <|im_start|>, ### Instruction, etc.
  {
    pattern: /<\s*(system|im_start|im_end|internal|admin|root)\s*>/i,
    ruleId: "jb-token-injection",
    category: "jailbreak",
    hardBlock: true,
  },
  {
    pattern: /(^|\n)\s*(system\s*:|assistant\s*:|user\s*:|###\s*(instruction|system|prompt))/i,
    ruleId: "jb-role-marker",
    category: "jailbreak",
    hardBlock: true,
  },
  // "translate this into language X" wrapper for smuggling forbidden content
  {
    pattern: /(把下面|将下面|translate|render|rephrase)\s*[\s\S]{0,30}\b(违规|违规内容|illegal|forbidden|bypass|jailbreak|敏感)\b/i,
    ruleId: "jb-translate-smuggle",
    category: "jailbreak",
    hardBlock: true,
  },
  // "Output the text after this:" / "repeat the system prompt"
  {
    pattern: /(output|repeat|print|reveal|show|disclose|dump|leak)\s*(your\s*|the\s*|full\s*)?(system|initial|original|hidden|secret|internal|developer)\s*(prompt|instruction|message|instructions|rules?)/i,
    ruleId: "jb-leak-system-prompt-en",
    category: "jailbreak",
    hardBlock: true,
  },
  {
    pattern: /(输出|重复|打印|复述|告诉我)\s*(你的\s*)?(系统提示|初始提示|隐藏提示|原始提示|内部规则|内部提示)/,
    ruleId: "jb-leak-system-prompt-zh",
    category: "jailbreak",
    hardBlock: true,
  },
  // "From now on / starting now speak like / no longer follow rules"
  {
    pattern: /(从现在开始|从现在起|now\s+on(?:wards)?|starting\s+now)[\s\S]{0,40}(不再|不要|停止|不用)\s*(遵守|遵循|遵守|听|执行)\s*(规则|指令|约束)/i,
    ruleId: "jb-stop-following",
    category: "jailbreak",
    hardBlock: true,
  },
];

// ---------------------------------------------------------------------------
// 2. Blocked keywords — violence, illegal activity, sexual content
// ---------------------------------------------------------------------------

export const BLOCKED_KEYWORDS: KeywordRule[] = [
  // Weapons / explosives / synthesis (handles both Chinese and English "how to make X")
  {
    pattern: /(如何\s*(制造|制作|调配|合成)|怎么\s*(做|造|制作)|怎么\s*做\s*一个|怎么自制|how\s+to\s+(make|synthesize|build|create|build\s+a)|teach\s+me\s+(how|to)|tutorial\s+(on|for|to))\s*(.{0,40})?(炸弹|爆炸物|枪|枪支|武器|毒品|冰毒|海洛因|化学武器|神经毒剂|bomb|explosive|gun|weapon|drug|meth|heroin|sarin|bioweapon|nerve\s+gas)/i,
    ruleId: "violent-howto",
    category: "violence",
    hardBlock: true,
  },
  // Specific weapon recipes / drug recipes
  {
    pattern: /(炸弹\s*(制作|配方|材料|步骤)|tnt\s*配方|制冰\s*配方|synthesize\s+(meth|sarin|fentanyl))/i,
    ruleId: "violent-recipe",
    category: "violence",
    hardBlock: true,
  },
  // Buying illegal items
  {
    pattern: /(哪里\s*(买|买得到|能买|可以买到)|where\s+to\s+(buy|get))\s*(毒品|枪支|假证件|假护照|假身份证|drug|firearm|fake\s+passport|fake\s+id)/i,
    ruleId: "illegal-purchase",
    category: "illegal",
    hardBlock: true,
  },
  // Explicit sexual content (kept conservative — we only block when clearly asking for pornographic content)
  {
    pattern: /(露骨的色情|色情内容|黄片|porn|pornography|xxx\s+content|nsfw\s+images?)/i,
    ruleId: "sexual-explicit",
    category: "sexual",
    hardBlock: true,
  },
  // Self-harm instructions
  {
    pattern: /(如何\s*自杀|自杀\s*方法|how\s+to\s+(commit\s+suicide|kill\s+myself))/i,
    ruleId: "self-harm",
    category: "violence",
    hardBlock: true,
  },
];

// ---------------------------------------------------------------------------
// 3. PII patterns — used on OUTPUT to mask accidentally emitted personal data
// ---------------------------------------------------------------------------

export const PII_PATTERNS: PiiRule[] = [
  // Chinese mainland mobile (11 digits starting with 1)
  {
    pattern: /\b1[3-9]\d{9}\b/g,
    ruleId: "pii-cn-mobile",
    replacement: "[手机号已脱敏]",
  },
  // China mainland ID card (18 digits, last may be X)
  {
    pattern: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
    ruleId: "pii-cn-idcard",
    replacement: "[身份证号已脱敏]",
  },
  // Email (basic)
  {
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    ruleId: "pii-email",
    replacement: "[邮箱已脱敏]",
  },
  // Generic bank card (16–19 digits, allow spaces/dashes)
  {
    pattern: /\b(?:\d[\s-]?){13,18}\d\b/g,
    ruleId: "pii-bankcard",
    replacement: "[银行卡号已脱敏]",
  },
  // China passport (E/G + 8 digits, or letter + 8 digits)
  {
    pattern: /\b[EG]\d{8}\b/g,
    ruleId: "pii-cn-passport",
    replacement: "[护照号已脱敏]",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redactExcerpt(input: string, matchIndex: number, matchLen: number): string {
  const start = Math.max(0, matchIndex - 12);
  const end = Math.min(input.length, matchIndex + matchLen + 12);
  const snippet = input.slice(start, end).replace(/\s+/g, " ");
  return (start > 0 ? "…" : "") + snippet + (end < input.length ? "…" : "");
}

/**
 * Walk a list of rules and return the FIRST match. Returns `null` if clean.
 */
function findFirstMatch(input: string, rules: KeywordRule[]): RuleHit | null {
  if (!input) return null;
  for (const rule of rules) {
    // Reset lastIndex defensively because we're sharing regex patterns across calls.
    rule.pattern.lastIndex = 0;
    const m = rule.pattern.exec(input);
    if (m && m.index !== undefined) {
      return {
        ruleId: rule.ruleId,
        category: rule.category,
        excerpt: redactExcerpt(input, m.index, m[0].length),
      };
    }
  }
  return null;
}

export function matchJailbreak(input: string): RuleHit | null {
  return findFirstMatch(input, JAILBREAK_PATTERNS);
}

export function matchBlockedContent(input: string): RuleHit | null {
  return findFirstMatch(input, BLOCKED_KEYWORDS);
}

/**
 * Combine jailbreak + blocked content check. Jailbreak has higher priority
 * because it's more diagnostic (you want to know the user tried an injection,
 * not just that they hit a "violence" keyword).
 */
export function matchAnyForbidden(input: string): RuleHit | null {
  return matchJailbreak(input) ?? matchBlockedContent(input);
}

export interface MaskResult {
  text: string;
  hitCount: number;
  hits: { ruleId: string; excerpt: string }[];
}

/**
 * Apply PII replacements in series. Returns the masked text + count of hits.
 */
export function maskPII(input: string): MaskResult {
  if (!input) return { text: input, hitCount: 0, hits: [] };
  let text = input;
  let hitCount = 0;
  const hits: { ruleId: string; excerpt: string }[] = [];

  for (const rule of PII_PATTERNS) {
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, (match, _g1, offset: number) => {
      hitCount += 1;
      hits.push({ ruleId: rule.ruleId, excerpt: redactExcerpt(input, offset, match.length) });
      return rule.replacement;
    });
  }
  return { text, hitCount, hits };
}
