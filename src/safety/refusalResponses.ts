/**
 * Refusal / safety responses shown to the user when the input or output
 * guard intercepts a request.
 *
 * Two locales are supported:
 *   - "zh": default for domestic users (HK/TW/MO travellers may also benefit)
 *   - "en": used when the request comes in `sourceMode === "overseas"`
 *
 * Tone: friendly, on-brand ("汉斯"/Hanz travel guide), and offers a soft
 * redirect back to legitimate travel topics. We never reveal that a
 * keyword filter caught the message — that helps users who legitimately
 * tripped on a substring (e.g. a Chinese idiom containing the word "爆炸").
 */

export type RefusalKey =
  | "blocked"
  | "outOfScope"
  | "inputTooLong"
  | "inputEmpty"
  | "jailbreak"
  | "rateLimited"
  | "authRequired"
  | "modelError"
  | "piiLeak";

type Locale = "zh" | "en";

const TEMPLATES: Record<Locale, Record<RefusalKey, string>> = {
  zh: {
    blocked:
      "这个问题不在汉斯的服务范围内哦～ 我是专门帮你在杭州避开旅行陷阱的向导，要不来聊聊西湖、灵隐、龙井村怎么逛、或者支付宝怎么绑定外卡？",
    outOfScope:
      "作为旅行向导，我不便讨论这个话题。不过如果你想了解杭州的几条反套路路线（避黑车、避茶托、避野导），我很乐意帮忙。",
    inputTooLong:
      "消息有点长，我怕误解你的意思，麻烦精简到 {maxLen} 字以内再发一次～",
    inputEmpty:
      "你还没说想问什么哦～ 输入框空着我也猜不到。",
    jailbreak:
      "哈哈，你在玩什么游戏？我就是个帮你规划杭州行程的向导，咱们还是说说想去哪儿玩吧～",
    rateLimited:
      "请求太频繁啦，先让我喘口气，请稍后再试。",
    authRequired:
      "请先登录后再使用 AI 向导功能（这是为了防止滥用，保护大家的服务质量）。",
    modelError:
      "汉斯今天有点累，没能回答你的问题，要不等会儿换个话题再试一次？",
    piiLeak:
      "（系统安全提示：原回答中包含可能涉及个人隐私的信息，已被自动脱敏。请不要在旅行对话中分享银行卡号、身份证号等敏感信息。）",
  },
  en: {
    blocked:
      "That's outside what Hanz can help with — I'm your Hangzhou travel guide, specializing in dodging scams and getting around. Want me to suggest a West Lake walking route, a legit tea shop, or how to set up Alipay with a foreign card?",
    outOfScope:
      "As a travel guide, I'd rather not dive into that one. But if you'd like to know how to avoid the tea-house scam, unlicensed taxis, or overcharging touts in Hangzhou, I'm all yours.",
    inputTooLong:
      "That's a bit long — please trim it under {maxLen} characters and resend, I want to make sure I don't misread you.",
    inputEmpty:
      "Looks like the message came through empty. Type your question and I'll do my best.",
    jailbreak:
      "Haha, looks like you're testing me 😄 I'm just a Hangzhou travel guide — let's talk about your trip instead!",
    rateLimited:
      "Too many requests in a short time. Please give me a moment and try again shortly.",
    authRequired:
      "Please sign in to chat with Hanz. This helps us keep the guide free of abuse for everyone.",
    modelError:
      "Hantz is having a moment — couldn't get an answer just now. Want to try a different question?",
    piiLeak:
      "(System notice: the original reply contained something that looked like personal information, so it was masked automatically. Please don't share bank-card or passport numbers in chat.)",
  },
};

export function refusal(key: RefusalKey, locale: Locale = "zh", vars?: Record<string, string | number>): string {
  const raw = TEMPLATES[locale][key] ?? TEMPLATES.zh[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}

export function pickLocale(sourceMode?: string): Locale {
  return sourceMode === "overseas" ? "en" : "zh";
}
