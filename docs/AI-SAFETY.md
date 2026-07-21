# AI Safety — Hangzhou Travel Guide

This document explains the multi-layer safety / moderation layer wrapped
around the LLM endpoints (`/api/chat`, `/api/customize`) in
`code_project/server.ts`. It was added in mid-2026 to fix several
production-grade risks that the original v1 had:

1. `/api/chat` was anonymous and unbounded — anyone in the world could
   hit it and run up the LLM bill.
2. User input was sent straight to the model with no filtering, so a
   trivial `ignore previous instructions` prompt would either succeed
   (instructing Hanz to do something else) or be flagged only by the
   model's own RLHF alignment (which is not auditable from our side).
3. Model output was echoed verbatim to the user — including any URLs,
   phone numbers, ID-card numbers, etc. that the model might
   inadvertently emit.
4. The JWT secret had a hard-coded dev fallback that worked in
   production too — meaning anyone with the repo could forge tokens.

The new layer addresses all four with five concrete mechanisms:

---

## 5-layer defense

```
[Browser]
   │   (1) client clamps message length to 1000 chars (UX nicety)
   ▼
[Helmet]  ←  adds HTTP security headers (X-Frame-Options, HSTS, etc.)
   │
[express.json limit: 1mb]  ←  rejects giant payloads
   │
[requireAuth]  ←  /api/chat now requires a valid JWT (refresh-token aware)
   │
[rate limit]  ←  chat: 20/min/user, customize: 5/min/user, per user-id
   │
[inputGuard]  ←  validates shape, checks history + message for jailbreaks
                and out-of-scope topics; rewrites to safe message
   │
[LLM call]  ←  MiniMax / OpenAI-compatible endpoint with system prompt
                that already includes the safety appendix.
   │
[outputGuard]  ←  masks PII, removes non-allowlisted URLs, truncates,
                  and rejects responses that leak system-prompt content.
   ▼
[Browser]
```

---

## Where the rules live (and how to edit them)

Everything is plain TypeScript — no hidden config, no remote service.

| What                            | File                                       |
|---------------------------------|--------------------------------------------|
| Jailbreak / injection regexes   | `src/safety/moderationPatterns.ts` (`JAILBREAK_PATTERNS`) |
| Out-of-scope content regexes    | `src/safety/moderationPatterns.ts` (`BLOCKED_KEYWORDS`)    |
| PII masking patterns            | `src/safety/moderationPatterns.ts` (`PII_PATTERNS`)        |
| Soft refusal messages (zh/en)   | `src/safety/refusalResponses.ts`                          |
| Safety appendix for system prompt | `src/safety/safetyPrompt.ts`                            |
| Pipeline orchestration          | `src/safety/inputGuard.ts`, `src/safety/outputGuard.ts`  |
| Tunable limits (rate, length)   | `.env.example` (`CHAT_RATE_LIMIT_*`, `CHAT_INPUT_MAX_LEN`, ...) |

To add a new blocked keyword:

1. Open `src/safety/moderationPatterns.ts`.
2. Add an entry to `BLOCKED_KEYWORDS` (or `JAILBREAK_PATTERNS`).
   Pick a stable `ruleId` (e.g. `violent-002`). Categorize it.
3. Add a test case in `src/__tests__/safety/moderationPatterns.test.ts`.
4. Run `npm test`. Make sure it passes.

To add a new refusal message locale:

1. Open `src/safety/refusalResponses.ts`.
2. Add a new locale key next to `zh` and `en`.
3. Update `pickLocale()` to choose it.

To change rate limits / message length:

* Edit `.env` (or `.env.example` for documentation).
* Restart the server (`tsx server.ts` will auto-pick up).

---

## What each layer does

### 1. Helmet (`server.ts` line ~26)

Adds a sensible set of HTTP security headers. We disable the default
CSP because the SPA serves mixed resources and we already control the
routes. We set `crossOriginResourcePolicy: cross-origin` so the
`/api/wiki-image` proxy can be used by `<img>` tags.

### 2. JSON limit (`server.ts` line ~33)

`express.json({ limit: "1mb" })`. Anything larger gets a 413 from
Express before we even see it. This blocks a trivial memory-DoS attack.

### 3. `requireAuth` (`server.ts`)

`/api/chat` now requires a valid bearer token. The `hooks.ts`
`authedFetch` handles refresh-token rotation on 401 automatically.
Users who are not signed in get a friendly message in the chat UI
("请先登录后再向汉斯提问"), not a hard error.

`/api/customize` was already protected; we left that untouched.

### 4. Rate limit (`server.ts`)

Two `express-rate-limit` instances:

* `chatRateLimiter` — 20 req/min/user (configurable via env). 429
  replies include the friendly `refusal("rateLimited")` text so the
  frontend can surface it inline.
* `customizeRateLimiter` — 5 req/min/user (JSON output is expensive).

Key generator prefers `req.user.id` (set by `requireAuth`) and falls
back to `req.ip` for any future non-auth route.

### 5. Input guard (`src/safety/inputGuard.ts`)

Order of checks (cheap → expensive):

1. **Shape** — empty? over `maxLen`? → block with a tailored message.
2. **History** — every history item (capped at 500 chars each) is
   scanned for jailbreak patterns. This catches *indirect prompt
   injection* where an attacker poisons a previous turn.
3. **Current message** — same checks. Jailbreak hit takes priority
   over blocked-content hit (more diagnostic).
4. **Clean** — strip whitespace padding and any leftover `<system>`
   marker characters before sending to the model.

Returns one of:
* `{ action: "allow", cleanedMessage, cleanedHistory }`
* `{ action: "block", ruleId, category, reason, userMessage }`

In the "block" branch the frontend is told the friendly refusal
message — the rule ID is hidden from the user but logged server-side
for triage.

### 6. Output guard (`src/safety/outputGuard.ts`)

After `stripThinkTags()` strips `<think>` reasoning, we:

1. **Detect system-prompt leakage** — if the reply contains the
   literal text `安全与角色约束` or `<system>` tags, replace it
   entirely with the fallback "I couldn't answer" message.
2. **URL whitelist** — keep `/api/wiki-image?*`, `wikipedia.org`,
   `upload.wikimedia.org`, `*.baidu.com`, `*.bing.com`, `*.sogou.com`,
   `*.gov.cn`. Everything else becomes `[外链已移除]`.
3. **PII masking** — phone (CN), ID card (CN), email, bank card
   (13–19 digits), passport (`E/G + 8 digits`). Replaced with
   placeholders like `[手机号已脱敏]`. If anything was masked, append
   a one-line notice to the user.
4. **Truncate** at `CHAT_OUTPUT_MAX_LEN` (default 4000). When truncating
   we try to preserve a trailing `![...](/api/wiki-image?...)` markdown
   line so the curated UI still shows the picture.
5. **Empty / fallback** — if the model returned nothing, send the
   localized "I'm a bit tired" refusal.

The verdict includes `action`, `redactedUrls`, `maskedPii`, `truncated`,
and (when applicable) `reason` — these are logged so we can see how
often the guard fires.

---

## Configuration cheatsheet (.env)

| Variable | Default | What it controls |
|----------|---------|------------------|
| `JWT_SECRET` | dev fallback | **Must override in production** — server refuses to start otherwise. |
| `CHAT_RATE_LIMIT_WINDOW_MS` | 60000 | Chat window. |
| `CHAT_RATE_LIMIT_MAX` | 20 | Requests / window / user. |
| `CUSTOMIZE_RATE_LIMIT_WINDOW_MS` | 60000 | Custom window. |
| `CUSTOMIZE_RATE_LIMIT_MAX` | 5 | Requests / window / user. |
| `CHAT_INPUT_MAX_LEN` | 1000 | Per-user message cap. |
| `CHAT_OUTPUT_MAX_LEN` | 4000 | Per-reply cap before truncation. |

---

## Known limitations / what this layer does NOT do

* It does not call a server-side moderation API (e.g. OpenAI's
  Moderation endpoint). All matching is local regex, which means
  sophisticated attacks (paraphrasing, base64-encoded payloads,
  multi-turn induction) are caught only by the system prompt
  constraints. **Treat the regex layer as the first line of defense,
  not the only one.**
* The rate limiter is in-memory; in a multi-process deployment each
  process has its own counter. To share state you'd add Redis (out of
  scope for v2).
* History content is checked per-item but not deduplicated; an attacker
  who floods 50 history items still triggers at most one reject.
* PII masking is best-effort regex. A creative model output could
  smuggle a phone number written as "一三八零零一三八零零零" (Chinese
  numerals) and we'd miss it. The system prompt tells the model not
  to do this in the first place.
* We do NOT translate or paraphrase the user's question. If a user
  writes in a language the model doesn't speak well, the model may
  still answer (and we let it).

To extend the layer with any of these, edit the files in
`src/safety/` directly.

---

## Tests

```bash
npm test           # one-shot
npm run test:watch # watch mode
npm run test:coverage
```

Current coverage: **46 tests** covering:

* Matchers — jailbreak, blocked content, combined precedence, PII.
* Input guard — shape, history injection, direct injection, blocked
  content, locale selection.
* Output guard — URL whitelist, PII masking, truncation, system-prompt
  leak detection, empty / fallback.

When you add a new pattern, add at least one test for: a positive
case (should match), a negative case (should NOT match a near-miss),
and a locale case if applicable.

---

## Quick audit checklist

When changing the safety layer, run through these:

- [ ] Did you add a positive test for the new pattern?
- [ ] Did you add a negative test (near-miss)?
- [ ] Did `npm test` pass?
- [ ] Did `npm run lint` (which is just `tsc --noEmit`) pass?
- [ ] Did you restart the dev server so `tsx` picks up new files?
- [ ] Did you update this README with the new behavior?
- [ ] In production: did the deployment include a real `JWT_SECRET`
      and the right `CHAT_RATE_LIMIT_*`?
- [ ] Hit `POST /api/chat` with a known-bad payload and verify the
      blocked-message comes back (sanity check on a deploy).
