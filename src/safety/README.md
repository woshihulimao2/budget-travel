# `src/safety/` — AI Safety Layer

This directory is the single source of truth for everything that
filters or limits what goes to and comes from the LLM. It is
intentionally **plain TypeScript data + small pure functions** so that:

- a non-engineer can read & edit patterns,
- tests run without spinning up the server,
- changes can be diff-reviewed by hand.

## Files

| File | What it is |
|------|-----------|
| `moderationPatterns.ts` | Three regex tables: jailbreaks, blocked content, PII. **Edit me when adding new forbidden content.** |
| `inputGuard.ts` | The orchestrator called from `server.ts` for each incoming chat message. |
| `outputGuard.ts` | The orchestrator called after the model returns. |
| `safetyPrompt.ts` | The Chinese-language safety appendix that is appended to the system prompt. |
| `refusalResponses.ts` | Localized (zh / en) refusal / redirect messages. |
| `README.md` | This file. |

A higher-level overview, deployment checklist, and configuration
table live in `../../docs/AI-SAFETY.md`.

## How to add a new blocked keyword

```ts
// src/safety/moderationPatterns.ts
export const BLOCKED_KEYWORDS: KeywordRule[] = [
  // ...
  {
    pattern: /新关键词|alternative-spelling/i,
    ruleId: "blocked-my-new-keyword",   // unique, lowercase-with-dashes
    category: "illegal",                 // see RuleCategory in this file
    hardBlock: true,                     // false = log only
  },
];
```

Then add at least one positive + one negative test in
`src/__tests__/safety/moderationPatterns.test.ts`.

## How to add a new locale

1. Open `refusalResponses.ts`.
2. Add a new locale object next to `zh` / `en`.
3. Add a `keyof typeof TEMPLATES` to the `Locale` type.
4. Extend `pickLocale(sourceMode)` to map your trigger to it.

## How to extend PII masking

Add a new entry to `PII_PATTERNS`. Use a `g` flag and provide a
human-friendly `replacement` string. The mask runs over both the
output and (defensively) anywhere else a PII-like substring might
appear.

## How to test

```bash
# from code_project/
npm test
npm run test:watch
npm run test:coverage
```

Coverage report lands in `coverage/`.

## Style rules

- No I/O, no network calls, no env reads inside files in this directory.
  Inputs come in via function arguments. This keeps testing trivial.
- Patterns MUST be `RegExp` objects created at module load time
  (so they're shared across calls). We reset `lastIndex` defensively
  when scanning because some rules use the `g` flag.
- Every rule needs a stable `ruleId` so logs can be queried.
  Convention: `<category-prefix>-<short-name>`.
- Hard-block by default; only flip to `hardBlock: false` if you have
  evidence the pattern causes false positives.
