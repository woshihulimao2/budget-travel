import mysql from "mysql2/promise";
import crypto from "crypto";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "travel_guide",
  waitForConnections: true,
  connectionLimit: 10,
});

const DEFAULT_CONFIG = {
  alipayAccount: "alipay-merchant@example.com",
  alipayQrUrl: "",
  wechatMerchantId: "wx_merchant_100234",
  wechatQrUrl: "",
  paypalClientId: "paypal_sandbox_client_id_abc123",
  priceCny: "9.9",
  priceUsd: "1.5",
  vipCode: "VIP888",
};

const DEMO_TRANSACTION = {
  id: "tx_1719283748291",
  itineraryId: "demo_1",
  itineraryTitle: "杭州 + 上海 3天 舒适型之旅",
  payerAccount: "woshihulimao@gmail.com",
  paymentMethod: "Alipay",
  amount: "¥9.9",
  timestamp: "2026-07-06 14:22:15",
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_config (
      id INT PRIMARY KEY,
      alipay_account VARCHAR(255) NOT NULL,
      alipay_qr_url TEXT,
      wechat_merchant_id VARCHAR(255),
      wechat_qr_url TEXT,
      paypal_client_id VARCHAR(255),
      price_cny VARCHAR(20),
      price_usd VARCHAR(20),
      vip_code VARCHAR(50)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      seq INT AUTO_INCREMENT PRIMARY KEY,
      id VARCHAR(64) NOT NULL UNIQUE,
      itinerary_id VARCHAR(128) NOT NULL,
      itinerary_title VARCHAR(255),
      payer_account VARCHAR(255) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      amount VARCHAR(50),
      timestamp VARCHAR(50)
    )
  `);

  // Auth
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti CHAR(36) PRIMARY KEY,
      user_id INT NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Curated content
  await pool.query(`
    CREATE TABLE IF NOT EXISTS itineraries (
      id VARCHAR(64) PRIMARY KEY,
      city VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      duration VARCHAR(32),
      pace VARCHAR(32),
      description TEXT,
      tags JSON,
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_city (city)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS itinerary_stops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      itinerary_id VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL,
      time VARCHAR(64),
      title VARCHAR(255),
      description TEXT,
      cost VARCHAR(64),
      tip TEXT,
      location VARCHAR(255),
      FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE,
      INDEX idx_itin (itinerary_id, sort_order)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scams (
      id VARCHAR(64) PRIMARY KEY,
      city VARCHAR(32) NOT NULL,
      slug VARCHAR(128) NOT NULL,
      title VARCHAR(255) NOT NULL,
      scam_type VARCHAR(32),
      danger_level VARCHAR(16),
      risk VARCHAR(16),
      category VARCHAR(64),
      scenes VARCHAR(64),
      scenario TEXT,
      mechanism TEXT,
      defense TEXT,
      tip TEXT,
      evidence_score INT DEFAULT 0,
      note_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      keywords JSON,
      top_notes JSON,
      top_comments JSON,
      source VARCHAR(32),
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_city_slug (city, slug),
      INDEX idx_city (city)
    )
  `);

  // Idempotent column backfill for upgrades from pre-scenes schemas.
  // scenes is a comma-separated string (e.g. "Food,Transport") so it works
  // on MySQL 5.7 and 8.x without JSON column quirks. We query
  // information_schema first so reruns are no-ops.
  try {
    const [cols]: any = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scams' AND COLUMN_NAME = 'scenes'`
    );
    if (!Array.isArray(cols) || cols.length === 0) {
      await pool.query(`ALTER TABLE scams ADD COLUMN scenes VARCHAR(64) NULL AFTER category`);
    }
  } catch (err: any) {
    console.warn("[scams] scenes column add failed (non-fatal):", err?.message || err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_itineraries (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      cities JSON,
      duration VARCHAR(32),
      budget VARCHAR(32),
      interests JSON,
      summary TEXT,
      checklist JSON,
      custom_itinerary JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_created (user_id, created_at)
    )
  `);

  // -----------------------------------------------------------------------
  // Seed payment_config + payment_transactions
  // -----------------------------------------------------------------------

  const [configRows] = await pool.query("SELECT id FROM payment_config WHERE id = 1");
  if ((configRows as any[]).length === 0) {
    await pool.query(
      `INSERT INTO payment_config
        (id, alipay_account, alipay_qr_url, wechat_merchant_id, wechat_qr_url, paypal_client_id, price_cny, price_usd, vip_code)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULT_CONFIG.alipayAccount,
        DEFAULT_CONFIG.alipayQrUrl,
        DEFAULT_CONFIG.wechatMerchantId,
        DEFAULT_CONFIG.wechatQrUrl,
        DEFAULT_CONFIG.paypalClientId,
        DEFAULT_CONFIG.priceCny,
        DEFAULT_CONFIG.priceUsd,
        DEFAULT_CONFIG.vipCode,
      ]
    );
  }

  const [txCountRows] = await pool.query("SELECT COUNT(*) as cnt FROM payment_transactions");
  if ((txCountRows as any[])[0].cnt === 0) {
    await pool.query(
      `INSERT INTO payment_transactions
        (id, itinerary_id, itinerary_title, payer_account, payment_method, amount, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        DEMO_TRANSACTION.id,
        DEMO_TRANSACTION.itineraryId,
        DEMO_TRANSACTION.itineraryTitle,
        DEMO_TRANSACTION.payerAccount,
        DEMO_TRANSACTION.paymentMethod,
        DEMO_TRANSACTION.amount,
        DEMO_TRANSACTION.timestamp,
      ]
    );
  }

  // -----------------------------------------------------------------------
  // Seed curated content from src/data.ts (only on first boot)
  // -----------------------------------------------------------------------
  const [itinCountRows] = await pool.query("SELECT COUNT(*) as cnt FROM itineraries");
  if ((itinCountRows as any[])[0].cnt === 0) {
    await seedCuratedContent();
  }

  // -----------------------------------------------------------------------
  // hot_notes / note_images / note_videos
  // -----------------------------------------------------------------------
  // 三张表，承载小红书等平台抓取的「话题热点笔记」，按 url / 媒体可达性入库：
  // - hot_notes  : 一条笔记 = 一行（主表，平台 id 主键）
  // - note_images: 一张图 = 一行，与 hot_notes 一对多；带 media_status 用于标注 URL 死活
  // - note_videos: 一个视频 = 一行，与 hot_notes 一对多
  // 媒体可达性字段（media_status + http_status + probed_at + bytes + content_type）
  // 由独立的 probe_xhs_media.ts 周期性探测后更新，便于前端按真实状态渲染占位图。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hot_notes (
      id              VARCHAR(64) PRIMARY KEY,
      platform        VARCHAR(16) NOT NULL DEFAULT 'xhs',
      category        VARCHAR(16) NOT NULL,
      sub_category    VARCHAR(32),
      title           VARCHAR(512) NOT NULL,
      content         TEXT,
      author          VARCHAR(128),
      publish_time    DATETIME NULL,
      source_url      VARCHAR(1024) NOT NULL,
      source_keyword  VARCHAR(128),
      media_type      ENUM('image','video','mixed') NOT NULL DEFAULT 'image',
      cover_url       VARCHAR(1024),
      liked_count     INT NOT NULL DEFAULT 0,
      collected_count INT NOT NULL DEFAULT 0,
      comment_count   INT NOT NULL DEFAULT 0,
      share_count     INT NOT NULL DEFAULT 0,
      tags            JSON,
      relevance       DECIMAL(4,2) DEFAULT NULL,
      note_relevant   TINYINT(1) NOT NULL DEFAULT 1,
      scraped_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category, sub_category),
      INDEX idx_publish (publish_time),
      INDEX idx_relevant (note_relevant)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS note_images (
      id              BIGINT AUTO_INCREMENT PRIMARY KEY,
      note_id         VARCHAR(64) NOT NULL,
      seq             SMALLINT UNSIGNED NOT NULL,
      url             VARCHAR(1024) NOT NULL,
      url_hash        CHAR(64) NOT NULL,
      media_status    ENUM('unknown','reachable','auth_required','gone','error') NOT NULL DEFAULT 'unknown',
      http_status     SMALLINT UNSIGNED NULL,
      probed_at       DATETIME NULL,
      bytes           INT UNSIGNED NULL,
      content_type    VARCHAR(64) NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_note_seq (note_id, seq),
      UNIQUE KEY uniq_hash (url_hash),
      INDEX idx_note (note_id),
      INDEX idx_status (media_status),
      CONSTRAINT fk_note_images_note
        FOREIGN KEY (note_id) REFERENCES hot_notes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS note_videos (
      id              BIGINT AUTO_INCREMENT PRIMARY KEY,
      note_id         VARCHAR(64) NOT NULL,
      seq             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      url             VARCHAR(1024) NOT NULL,
      url_hash        CHAR(64) NOT NULL,
      media_status    ENUM('unknown','reachable','auth_required','gone','error') NOT NULL DEFAULT 'unknown',
      http_status     SMALLINT UNSIGNED NULL,
      probed_at       DATETIME NULL,
      bytes           INT UNSIGNED NULL,
      content_type    VARCHAR(64) NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_note_seq (note_id, seq),
      UNIQUE KEY uniq_hash (url_hash),
      INDEX idx_note (note_id),
      INDEX idx_status (media_status),
      CONSTRAINT fk_note_videos_note
        FOREIGN KEY (note_id) REFERENCES hot_notes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await runMigrations();
}

// ---------------------------------------------------------------------------
// Idempotent migrations for tables created before a column existed.
// `CREATE TABLE IF NOT EXISTS` never alters an existing table, so any column
// added after a DB was first provisioned has to be back-filled here.
// ---------------------------------------------------------------------------
async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function runMigrations() {
  // refresh_tokens.token_secret: stores sha256(refresh secret) so the secret
  // half of the "<jti>.<secret>" refresh token is actually verified on rotate.
  if (!(await columnExists("refresh_tokens", "token_secret"))) {
    await pool.query(
      `ALTER TABLE refresh_tokens ADD COLUMN token_secret CHAR(64) NULL`,
    );
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export function rowToConfig(row: any) {
  return {
    alipayAccount: row.alipay_account,
    alipayQrUrl: row.alipay_qr_url || "",
    wechatMerchantId: row.wechat_merchant_id,
    wechatQrUrl: row.wechat_qr_url || "",
    paypalClientId: row.paypal_client_id,
    priceCny: row.price_cny,
    priceUsd: row.price_usd,
    vipCode: row.vip_code,
  };
}

export function rowToTransaction(row: any) {
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    itineraryTitle: row.itinerary_title,
    payerAccount: row.payer_account,
    paymentMethod: row.payment_method,
    amount: row.amount,
    timestamp: row.timestamp,
  };
}

export function rowToUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function rowToItinerary(row: any, stops: any[] = []) {
  return {
    id: row.id,
    city: row.city,
    title: row.title,
    duration: row.duration,
    pace: row.pace,
    description: row.description,
    tags: safeJson(row.tags, []),
    stops,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToStop(row: any) {
  return {
    time: row.time || "",
    title: row.title || "",
    description: row.description || "",
    cost: row.cost || "",
    tip: row.tip || "",
    location: row.location || "",
  };
}

export function rowToScam(row: any) {
  return {
    id: row.id,
    city: row.city,
    slug: row.slug,
    title: row.title,
    scamType: row.scam_type || "Overcharging",
    dangerLevel: row.danger_level || "Medium",
    risk: row.risk || "medium",
    category: row.category || "",
    scenes: parseCsvScenes(row.scenes),
    scenario: row.scenario || "",
    howItWorks: row.mechanism || "",
    prevention: row.defense || "",
    localProTip: row.tip || "",
    evidenceScore: row.evidence_score ?? 0,
    noteCount: row.note_count ?? 0,
    commentCount: row.comment_count ?? 0,
    keywords: safeJson(row.keywords, []),
    topNotes: safeJson(row.top_notes, []),
    topComments: safeJson(row.top_comments, []),
    source: row.source || "",
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Parse the comma-separated scenes column into a typed array.
 * Returns [] for null/undefined/empty input.
 */
function parseCsvScenes(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === "string");
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function encodeScenes(scenes: string[] | undefined): string | null {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  // De-dup and keep stable order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scenes) {
    if (typeof s !== "string") continue;
    const trimmed = s.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out.length === 0 ? null : out.join(",");
}

export function rowToCustomItinerary(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    cities: safeJson(row.cities, []),
    duration: row.duration,
    budget: row.budget,
    interests: safeJson(row.interests, []),
    summary: row.summary || "",
    checklist: safeJson(row.checklist, []),
    customItinerary: safeJson(row.custom_itinerary, []),
    createdAt: row.created_at,
  };
}

function safeJson(v: any, fallback: any) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Curated content seed (mirrors src/data.ts so first boot is never empty)
// ---------------------------------------------------------------------------

const SEED_ITINERARIES: Array<{
  id: string;
  city: string;
  title: string;
  duration: string;
  pace: "Leisurely" | "Moderate" | "Active";
  description: string;
  tags: string[];
  sortOrder: number;
  stops: Array<{
    time: string;
    title: string;
    description: string;
    cost: string;
    tip: string;
    location: string;
  }>;
}> = [
  {
    id: "hz-1-day-classic",
    city: "hangzhou",
    title: "杭州经典 1 日游（断桥 → 雷峰塔）",
    duration: "1 天",
    pace: "Leisurely",
    description: "一条贯穿西湖核心的慢节奏路线，步行 + 游船为主，零购物。",
    tags: ["西湖", "断桥", "雷峰塔", "1天"],
    sortOrder: 10,
    stops: [
      { time: "08:30 - 10:00", title: "断桥 & 白堤", description: "从地铁 1 号线龙翔桥站步行前往，体验西湖晨雾。", cost: "免费", tip: "西湖边自称「学生」主动搭讪邀请喝茶的，一律拒绝。", location: "断桥残雪" },
      { time: "10:00 - 12:00", title: "坐船游三潭印月", description: "在岳湖码头购票（55 元含湖中三岛），使用支付宝扫码上船。", cost: "¥55", tip: "不要在码头边拉客的「快艇」买票，认准官方窗口。", location: "岳湖码头" },
      { time: "12:00 - 13:30", title: "楼外楼（西湖店）午餐", description: "明码标价的国营老字号，凭护照可领英文菜单。", cost: "¥150", tip: "景区周边的「西湖醋鱼 99 元包吃」都是预制菜，不要进。", location: "孤山路 30 号" },
      { time: "14:00 - 16:00", title: "雷峰塔景区", description: "登塔俯瞰全湖，可不买票只在外面苏堤拍照。", cost: "¥40", tip: "门口有人兜售「开光佛牌」「高僧加持香」一律拒绝。", location: "夕照山" },
      { time: "16:30 - 18:00", title: "河坊街 & 南宋御街", description: "步行老街，吃定胜糕、葱包桧，谨慎买丝绸。", cost: "¥50", tip: "丝绸只去万事利专柜买；景区「真丝」几乎都是化纤。", location: "河坊街" },
    ],
  },
  {
    id: "hz-3-day-cultural",
    city: "hangzhou",
    title: "杭州文化深度 3 日游（西湖 + 灵隐 + 龙井）",
    duration: "3 天",
    pace: "Moderate",
    description: "包含灵隐寺、龙井村、西溪湿地，节奏适中，深度体验。",
    tags: ["灵隐寺", "龙井", "西溪", "3天"],
    sortOrder: 20,
    stops: [
      { time: "Day1 09:00", title: "飞来峰 + 灵隐寺", description: "飞来峰门票 45 元；灵隐寺免费但需微信预约。", cost: "¥45", tip: "寺院内「法物流通处」才是正规开光品，外面小店都是山寨。", location: "灵隐路" },
      { time: "Day1 14:00", title: "龙井村品茶", description: "认准狮牌 / 西湖牌门店；私人茶农家谨慎。", cost: "¥200", tip: "出租车司机推荐的茶农家大多是回扣点。", location: "龙井村" },
      { time: "Day2 全天", title: "西溪湿地", description: "周家村入口进，乘摇橹船 + 步行。", cost: "¥80 + ¥100", tip: "入口处拉客的「导游讲解」99% 是带你去购物点的。", location: "周家村" },
      { time: "Day3 上午", title: "中国茶叶博物馆", description: "免费，全面了解龙井分级。", cost: "免费", tip: "出口处的「茶农直销」不要买。", location: "龙井路 88 号" },
      { time: "Day3 下午", title: "京杭大运河拱宸桥", description: "乘运河游船，桥西历史街区。", cost: "¥80", tip: "运河边「免费讲解」通常是黑导游，会拉去玉器店。", location: "拱宸桥" },
      { time: "Day3 晚", title: "武林夜市", description: "夜市小吃为主，谨慎扫码领礼品。", cost: "¥80", tip: "二维码领礼品活动多为获取个人信息，不要扫。", location: "武林路" },
    ],
  },
  {
    id: "hz-5-day-adventurer",
    city: "hangzhou",
    title: "杭州深度 5 日游（含千岛湖 / 乌镇 1 日往返）",
    duration: "5 天",
    pace: "Active",
    description: "杭州市区 4 天 + 千岛湖或乌镇 1 日往返。",
    tags: ["千岛湖", "乌镇", "5天"],
    sortOrder: 30,
    stops: [
      { time: "Day1", title: "西湖 + 灵隐", description: "经典 1 日游路线。", cost: "¥300", tip: "见 hz-1-day-classic。", location: "西湖" },
      { time: "Day2", title: "龙井 + 九溪", description: "徒步九溪十八涧，终点到六和塔。", cost: "¥100", tip: "九溪深处晚上没路灯，不要夜间逗留。", location: "九溪" },
      { time: "Day3", title: "西溪湿地", description: "全天慢游。", cost: "¥250", tip: "见 hz-3-day-cultural。", location: "西溪" },
      { time: "Day4", title: "千岛湖或乌镇一日游", description: "乘高铁或正规一日游团（携程上选 200+ 元纯玩团）。", cost: "¥500", tip: "99 元一日游必购物，不要报。", location: "千岛湖 / 乌镇" },
      { time: "Day5", title: "京杭运河 + 返程", description: "上午运河博物馆，下午返程。", cost: "¥150", tip: "高铁站出站口拉客黑车一律拒绝，用滴滴。", location: "运河" },
    ],
  },
  {
    id: "sh-1-day-classic",
    city: "shanghai",
    title: "上海经典 1 日游（外滩 + 陆家嘴）",
    duration: "1 天",
    pace: "Leisurely",
    description: "外滩、南京东路、陆家嘴三件套，一天搞定。",
    tags: ["外滩", "陆家嘴", "1天"],
    sortOrder: 110,
    stops: [
      { time: "09:00", title: "外滩观景", description: "从南京东路 1 号口出，步行到外滩。", cost: "免费", tip: "外滩「拍照收费」「帮你合影要钱」一律拒绝。", location: "外滩" },
      { time: "11:00", title: "南京东路步行街", description: "步行老店，永安百货、先施公司。", cost: "免费", tip: "南京东路上「主动找您练英语合影」的茶托一律拒绝。", location: "南京东路" },
      { time: "13:00", title: "陆家嘴三件套", description: "登上海中心或金茂大厦。", cost: "¥180", tip: "楼下有人兜售「快速登顶打折票」不要买，去官方柜台。", location: "陆家嘴" },
      { time: "16:00", title: "豫园 & 城隍庙", description: "九曲桥、城隍庙小吃。", cost: "¥80", tip: "豫园周边「免费导游」99% 拉去玉器店。", location: "豫园" },
    ],
  },
  {
    id: "sh-3-day-cultural",
    city: "shanghai",
    title: "上海文化 3 日游（外滩 + 田子坊 + 迪士尼）",
    duration: "3 天",
    pace: "Moderate",
    description: "海派文化深度 + 迪士尼一日。",
    tags: ["迪士尼", "田子坊", "3天"],
    sortOrder: 120,
    stops: [
      { time: "Day1", title: "外滩 + 武康路", description: "梧桐区 + 武康大楼。", cost: "¥100", tip: "武康路「免费咖啡试喝拉客」多为办卡骗局。", location: "武康路" },
      { time: "Day2", title: "迪士尼乐园", description: "使用官方 App 买票 + 排队。", cost: "¥600", tip: "黄牛票不要买，全是假票或过期票。", location: "迪士尼" },
      { time: "Day3", title: "田子坊 + 思南公馆", description: "海派弄堂 + 老洋房。", cost: "¥150", tip: "田子坊「现场手作 DIY」拉客多为强卖。", location: "田子坊" },
      { time: "Day3 晚", title: "外滩夜景", description: "黄浦江两岸灯光。", cost: "¥120", tip: "外滩游船黑票 99 元/位多为野船，认准官方码头。", location: "外滩" },
      { time: "返程", title: "虹桥 / 浦东机场", description: "提前 2 小时到机场。", cost: "—", tip: "出口拉客黑车一律拒绝，用滴滴或地铁。", location: "机场" },
    ],
  },
  {
    id: "xa-1-day-classic",
    city: "xian",
    title: "西安经典 1 日游（城墙 + 钟鼓楼）",
    duration: "1 天",
    pace: "Leisurely",
    description: "明城墙骑行 + 回民街 + 钟鼓楼广场。",
    tags: ["城墙", "回民街", "1天"],
    sortOrder: 210,
    stops: [
      { time: "08:30", title: "南门登城墙", description: "租自行车骑行 14 公里。", cost: "¥54 + ¥45", tip: "城墙下「免费指路」多为拉客去玉器店。", location: "永宁门" },
      { time: "12:00", title: "回民街午餐", description: "老孙家泡馍、贾三灌汤包。", cost: "¥80", tip: "门口拉客「XX 套餐便宜」多为回扣店。", location: "回民街" },
      { time: "14:00", title: "钟鼓楼广场", description: "登鼓楼看皮影。", cost: "¥50", tip: "广场上「合影免费送照片」要钱，不要拍。", location: "钟楼" },
      { time: "16:00", title: "小雁塔", description: "免费，凭护照换票。", cost: "免费", tip: "门口拉客「讲解」多为假导游。", location: "小雁塔" },
    ],
  },
  {
    id: "xa-3-day-cultural",
    city: "xian",
    title: "西安文化 3 日游（兵马俑 + 华山）",
    duration: "3 天",
    pace: "Active",
    description: "兵马俑 + 华山 + 市区博物馆全覆盖。",
    tags: ["兵马俑", "华山", "3天"],
    sortOrder: 220,
    stops: [
      { time: "Day1 上午", title: "兵马俑", description: "官网提前 1 天预约，凭护照入园。", cost: "¥120", tip: "火车站路边「假冒国营公交车」拉客一律拒绝，到东广场乘游 5（306）路。", location: "临潼" },
      { time: "Day1 下午", title: "华清宫", description: "长恨歌实景演出（可选）。", cost: "¥120 + ¥298", tip: "黄牛「长恨歌内部票」全假。", location: "华清宫" },
      { time: "Day2 全天", title: "华山", description: "高铁 + 缆车一日。", cost: "¥540", tip: "山门口拉客「快速通道」多为强卖。", location: "华山" },
      { time: "Day3 上午", title: "陕西历史博物馆", description: "免费预约。", cost: "免费", tip: "馆外「免费讲解」多为拉客卖玉器。", location: "陕历博" },
      { time: "Day3 下午", title: "大雁塔 + 大唐不夜城", description: "夜景灯光秀。", cost: "¥80", tip: "大雁塔广场「免费合影」多为拉客。", location: "大雁塔" },
    ],
  },
];

const SEED_SCAMS: Array<{
  id: string;
  city: string;
  slug: string;
  title: string;
  scamType: string;
  dangerLevel: string;
  risk: string;
  category: string;
  scenes: string[];
  scenario: string;
  mechanism: string;
  defense: string;
  tip: string;
  source: string;
  sortOrder: number;
}> = [
  {
    id: "hangzhou-tea-scam",
    city: "hangzhou",
    slug: "tea-scam",
    title: "西湖「茶托」/ 假英语学生骗局",
    scenes: ["Food"],
    scamType: "Tea House",
    dangerLevel: "High",
    risk: "high",
    category: "茶托/酒托",
    scenario: "在西湖边、河坊街，会有热情的男女或自称「艺术系学生」主动搭讪，邀请您参加「本地茶艺节」或去「地道茶馆」。",
    mechanism: "带到隐秘私人茶室，端上小吃茶水，结账时高达 1,000 - 8,000 元，多名壮汉围住强迫刷卡。",
    defense: "绝对不要跟随陌生人去喝茶、就餐！如被索要天价账单，立即拨打 110。",
    tip: "真正中国学生性格含蓄，极少在景区拉客去特定茶馆。想喝茶去酒店前台推荐或国营茶室。",
    source: "seed",
    sortOrder: 10,
  },
  {
    id: "hangzhou-silk-fake",
    city: "hangzhou",
    slug: "silk-fake",
    title: "河坊街 / 南宋御街假冒「老字号」假货",
    scenes: ["Apparel"],
    scamType: "Fake Goods",
    dangerLevel: "Medium",
    risk: "medium",
    category: "购物假货",
    scenario: "河坊街、南宋御街景区内有不少挂「老字号」招牌的丝绸店。",
    mechanism: "宣称「工厂直销 100% 真丝」，实为 100% 化纤 / 涤纶，价格虚高 10 倍。",
    defense: "买丝绸认准万事利（Wensli）等品牌专柜；不要在景区「老字号」买。",
    tip: "真丝产品应有「100% 桑蚕丝」国标标签，化纤手感发硬、不吸水。",
    source: "seed",
    sortOrder: 20,
  },
  {
    id: "hangzhou-longjing-pretender",
    city: "hangzhou",
    slug: "longjing-pretender",
    title: "景区高价「山寨」西湖龙井茶陷阱",
    scenes: ["Apparel"],
    scamType: "Fake Goods",
    dangerLevel: "Medium",
    risk: "medium",
    category: "山寨假货",
    scenario: "西湖景区路边摊、出租车司机引路「私人茶农院」。",
    mechanism: "外地低端茶冒充西湖龙井，10 倍溢价售卖，号称「茶农直销」。",
    defense: "买茶应去龙井村老字号（狮牌、西湖牌）品牌门店，不买路边摊。",
    tip: "认准包装上「西湖龙井」地理标志 + 防伪码。",
    source: "seed",
    sortOrder: 30,
  },
  {
    id: "hangzhou-blackcar",
    city: "hangzhou",
    slug: "blackcar",
    title: "火车站与机场外的非法拉客「黑车」",
    scenes: ["Transport"],
    scamType: "Transport",
    dangerLevel: "Medium",
    risk: "medium",
    category: "交通黑车",
    scenario: "杭州东站、城站、机场出口有「老乡」「黑车司机」拉客。",
    mechanism: "不上计程表、绕路、加价；个别甚至强行拉去购物点。",
    defense: "排队乘坐正规出租车；用支付宝里的「滴滴出行」（全英文、支持外卡）。",
    tip: "杭州出租车起步 13 元 / 3 公里；滴滴可实时翻译聊天。",
    source: "seed",
    sortOrder: 40,
  },
  {
    id: "shanghai-tea-scam",
    city: "shanghai",
    slug: "tea-scam",
    title: "南京东路 / 外滩「茶托」骗局",
    scenes: ["Food"],
    scamType: "Tea House",
    dangerLevel: "High",
    risk: "high",
    category: "茶托/酒托",
    scenario: "南京东路、外滩有自称「想练英语」年轻人主动搭讪。",
    mechanism: "邀请去「茶艺表演」或「茶馆」，结账时数千至上万元。",
    defense: "绝对不要跟随；礼貌拒绝后迅速离开。",
    tip: "警惕任何在景区主动用英语搭讪的陌生人。",
    source: "seed",
    sortOrder: 110,
  },
  {
    id: "shanghai-bund-photo",
    city: "shanghai",
    slug: "bund-photo",
    title: "外滩「拍照收费」陷阱",
    scamType: "Overcharging",
    scenes: ["Transport"],
    dangerLevel: "Medium",
    risk: "medium",
    category: "拍照收费",
    scenario: "外滩观景台有人主动帮您「专业拍照」。",
    mechanism: "拍完要求 ¥50 - ¥200 一张，不给不让走。",
    defense: "礼貌拒绝，自己用手机拍，或直接走开。",
    tip: "外滩栏杆边「专业摄影」基本都是强卖。",
    source: "seed",
    sortOrder: 120,
  },
  {
    id: "shanghai-disney-scalper",
    city: "shanghai",
    slug: "disney-scalper",
    title: "迪士尼黄牛假票",
    scamType: "Fake Goods",
    scenes: ["Apparel", "Transport"],
    dangerLevel: "Medium",
    risk: "medium",
    category: "假票",
    scenario: "迪士尼地铁口、停车场有人兜售「内部折扣票」。",
    mechanism: "假票或已过期电子票，刷码入园失败。",
    defense: "只在迪士尼官方 App 或官网买票。",
    tip: "迪士尼官方票价浮动，平日 ¥399，高峰 ¥599。",
    source: "seed",
    sortOrder: 130,
  },
  {
    id: "xian-terracotta-bus",
    city: "xian",
    slug: "terracotta-bus",
    title: "西安火车站假冒『兵马俑专线』黑大巴",
    scamType: "Transport",
    scenes: ["Transport"],
    dangerLevel: "High",
    risk: "high",
    category: "假公交",
    scenario: "西安火车站东广场有人冒充「游 5 路」国营公交。",
    mechanism: "假冒车拉去山寨「地宫」「玉器店」强制购物。",
    defense: "到火车站东广场正规公交站乘游 5（306）路，¥7 直达兵马俑。",
    tip: "国营公交车身有「游 5」黄色编号，私人面包车不是。",
    source: "seed",
    sortOrder: 210,
  },
  {
    id: "xian-jade-shop",
    city: "xian",
    slug: "jade-shop",
    title: "回民街 / 城墙「免费导游」拉去玉器店",
    scamType: "Overcharging",
    scenes: ["Apparel", "Lodging"],
    dangerLevel: "Medium",
    risk: "medium",
    category: "购物黑店",
    scenario: "城墙下、回民街有「免费讲解」「免费指路」。",
    mechanism: "带去玉器店，强迫消费或收茶水费。",
    defense: "拒绝一切「免费讲解」；想买玉去正规品牌店。",
    tip: "西安玉器水深，老坑和田玉价格虚高数十倍。",
    source: "seed",
    sortOrder: 220,
  },
];

async function seedCuratedContent() {
  for (const it of SEED_ITINERARIES) {
    await pool.query(
      `INSERT INTO itineraries
        (id, city, title, duration, pace, description, tags, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        it.id,
        it.city,
        it.title,
        it.duration,
        it.pace,
        it.description,
        JSON.stringify(it.tags),
        it.sortOrder,
      ]
    );

    for (let i = 0; i < it.stops.length; i++) {
      const s = it.stops[i];
      await pool.query(
        `INSERT INTO itinerary_stops
          (itinerary_id, sort_order, time, title, description, cost, tip, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [it.id, i, s.time, s.title, s.description, s.cost, s.tip, s.location]
      );
    }
  }

  for (const sc of SEED_SCAMS) {
    await pool.query(
      `INSERT INTO scams
        (id, city, slug, title, scam_type, danger_level, risk, category, scenes, scenario, mechanism, defense, tip, source, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sc.id,
        sc.city,
        sc.slug,
        sc.title,
        sc.scamType,
        sc.dangerLevel,
        sc.risk,
        sc.category,
        encodeScenes(sc.scenes),
        sc.scenario,
        sc.mechanism,
        sc.defense,
        sc.tip,
        sc.source,
        sc.sortOrder,
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers exported for server.ts / CLI scripts
// ---------------------------------------------------------------------------

export async function upsertScam(sc: {
  id: string;
  city: string;
  slug: string;
  title: string;
  scamType?: string;
  dangerLevel?: string;
  risk?: string;
  category?: string;
  scenes?: string[];
  scenario?: string;
  mechanism?: string;
  defense?: string;
  tip?: string;
  evidenceScore?: number;
  noteCount?: number;
  commentCount?: number;
  keywords?: string[];
  topNotes?: any[];
  topComments?: string[];
  source?: string;
  sortOrder?: number;
}): Promise<"inserted" | "updated"> {
  const [existing]: any = await pool.query(
    "SELECT id FROM scams WHERE city = ? AND slug = ?",
    [sc.city, sc.slug]
  );

  const fields = {
    scam_type: sc.scamType || "Overcharging",
    danger_level: sc.dangerLevel || "Medium",
    risk: sc.risk || "medium",
    category: sc.category || "",
    scenes: encodeScenes(sc.scenes),
    scenario: sc.scenario || "",
    mechanism: sc.mechanism || "",
    defense: sc.defense || "",
    tip: sc.tip || "",
    evidence_score: sc.evidenceScore ?? 0,
    note_count: sc.noteCount ?? 0,
    comment_count: sc.commentCount ?? 0,
    keywords: JSON.stringify(sc.keywords || []),
    top_notes: JSON.stringify(sc.topNotes || []),
    top_comments: JSON.stringify(sc.topComments || []),
    source: sc.source || "import",
    sort_order: sc.sortOrder ?? 0,
  };

  if (existing.length > 0) {
    await pool.query(
    `UPDATE scams SET
         title = ?, scam_type = ?, danger_level = ?, risk = ?, category = ?, scenes = ?,
         scenario = ?, mechanism = ?, defense = ?, tip = ?,
         evidence_score = ?, note_count = ?, comment_count = ?,
         keywords = ?, top_notes = ?, top_comments = ?,
         source = ?, sort_order = ?
       WHERE city = ? AND slug = ?`,
      [
        sc.title,
        fields.scam_type,
        fields.danger_level,
        fields.risk,
        fields.category,
        fields.scenes,
        fields.scenario,
        fields.mechanism,
        fields.defense,
        fields.tip,
        fields.evidence_score,
        fields.note_count,
        fields.comment_count,
        fields.keywords,
        fields.top_notes,
        fields.top_comments,
        fields.source,
        fields.sort_order,
        sc.city,
        sc.slug,
      ]  
    );
    return "updated";
  }

  await pool.query(
    `INSERT INTO scams
      (id, city, slug, title, scam_type, danger_level, risk, category, scenes, scenario, mechanism, defense, tip, evidence_score, note_count, comment_count, keywords, top_notes, top_comments, source, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sc.id,
      sc.city,
      sc.slug,
      sc.title,
      fields.scam_type,
      fields.danger_level,
      fields.risk,
      fields.category,
      fields.scenes,
      fields.scenario,
      fields.mechanism,
      fields.defense,
      fields.tip,
      fields.evidence_score,
      fields.note_count,
      fields.comment_count,
      fields.keywords,
      fields.top_notes,
      fields.top_comments,
      fields.source,
      fields.sort_order,
    ]
  );
  return "inserted";
}

// ---------------------------------------------------------------------------
// hot_notes / note_images / note_videos helpers
// ---------------------------------------------------------------------------

/**
 * 一行 hot_notes 记录。
 * id = 平台原始笔记 id (例如小红书的 24/25 位 hex)；relevance 取值 0..1，
 * 表示关键词命中度（用于前端进一步筛选），null 表示未经筛选器跑过。
 */
export interface HotNoteRow {
  id: string;
  platform?: string;
  category: string;
  subCategory?: string | null;
  title: string;
  content?: string | null;
  author?: string | null;
  publishTime?: Date | string | null;
  sourceUrl: string;
  sourceKeyword?: string | null;
  mediaType: "image" | "video" | "mixed";
  coverUrl?: string | null;
  likedCount?: number;
  collectedCount?: number;
  commentCount?: number;
  shareCount?: number;
  tags?: string[];
  relevance?: number | null;
  noteRelevant?: boolean;
}

export interface NoteMediaRow {
  noteId: string;
  seq: number;
  url: string;
}

/**
 * SHA-256 用于 url_hash 列。
 * 用 Node 内置 crypto，避免引入新依赖。
 */
function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Upsert 一条 hot_notes：已存在按 id 更新；不存在插入。
 * 返回 "inserted" / "updated"。
 */
export async function upsertHotNote(note: HotNoteRow): Promise<"inserted" | "updated"> {
  const [existing]: any = await pool.query(
    "SELECT id FROM hot_notes WHERE id = ?",
    [note.id],
  );

  const tagsJson = note.tags ? JSON.stringify(note.tags) : null;
  const publishTime = note.publishTime
    ? note.publishTime instanceof Date
      ? note.publishTime
      : new Date(note.publishTime)
    : null;

  if (Array.isArray(existing) && existing.length > 0) {
    await pool.query(
      `UPDATE hot_notes SET
         platform = COALESCE(?, platform),
         category = ?,
         sub_category = ?,
         title = ?,
         content = ?,
         author = ?,
         publish_time = ?,
         source_url = ?,
         source_keyword = ?,
         media_type = ?,
         cover_url = ?,
         liked_count = ?,
         collected_count = ?,
         comment_count = ?,
         share_count = ?,
         tags = ?,
         relevance = ?,
         note_relevant = ?
       WHERE id = ?`,
      [
        note.platform ?? null,
        note.category,
        note.subCategory ?? null,
        note.title,
        note.content ?? null,
        note.author ?? null,
        publishTime,
        note.sourceUrl,
        note.sourceKeyword ?? null,
        note.mediaType,
        note.coverUrl ?? null,
        note.likedCount ?? 0,
        note.collectedCount ?? 0,
        note.commentCount ?? 0,
        note.shareCount ?? 0,
        tagsJson,
        note.relevance ?? null,
        note.noteRelevant === false ? 0 : 1,
        note.id,
      ],
    );
    return "updated";
  }

  await pool.query(
    `INSERT INTO hot_notes
      (id, platform, category, sub_category, title, content, author, publish_time,
       source_url, source_keyword, media_type, cover_url,
       liked_count, collected_count, comment_count, share_count, tags,
       relevance, note_relevant)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.platform ?? "xhs",
      note.category,
      note.subCategory ?? null,
      note.title,
      note.content ?? null,
      note.author ?? null,
      publishTime,
      note.sourceUrl,
      note.sourceKeyword ?? null,
      note.mediaType,
      note.coverUrl ?? null,
      note.likedCount ?? 0,
      note.collectedCount ?? 0,
      note.commentCount ?? 0,
      note.shareCount ?? 0,
      tagsJson,
      note.relevance ?? null,
      note.noteRelevant === false ? 0 : 1,
    ],
  );
  return "inserted";
}

/**
 * 删除某 note_id 下指定媒体类型的全部记录（用于重导入前清空）。
 */
export async function clearNoteMedia(
  noteId: string,
  kind: "image" | "video",
): Promise<void> {
  const table = kind === "image" ? "note_images" : "note_videos";
  await pool.query(`DELETE FROM ${table} WHERE note_id = ?`, [noteId]);
}

/**
 * 插入一条媒体记录。
 * - url_hash 自动用 sha256 计算
 * - 重复 (note_id, seq) 或 url_hash 时静默忽略 (INSERT IGNORE)
 */
export async function insertNoteMedia(
  kind: "image" | "video",
  row: NoteMediaRow,
): Promise<void> {
  const table = kind === "image" ? "note_images" : "note_videos";
  await pool.query(
    `INSERT IGNORE INTO ${table} (note_id, seq, url, url_hash) VALUES (?, ?, ?, ?)`,
    [row.noteId, row.seq, row.url, sha256Hex(row.url)],
  );
}

/**
 * 把 note_images / note_videos 单条媒体记录的探测结果写入。
 */
export async function updateNoteMediaProbe(
  kind: "image" | "video",
  urlHash: string,
  probe: {
    mediaStatus: "reachable" | "auth_required" | "gone" | "error";
    httpStatus: number | null;
    bytes: number | null;
    contentType: string | null;
  },
): Promise<void> {
  const table = kind === "image" ? "note_images" : "note_videos";
  await pool.query(
    `UPDATE ${table}
       SET media_status = ?,
           http_status = ?,
           bytes = ?,
           content_type = ?,
           probed_at = NOW()
     WHERE url_hash = ?`,
    [
      probe.mediaStatus,
      probe.httpStatus,
      probe.bytes,
      probe.contentType,
      urlHash,
    ],
  );
}

/**
 * 取出尚未探测（media_status='unknown'）的全部媒体 URL。
 * 用于 probe_xhs_media.ts 周期运行。
 */
export async function fetchUnprobedMedia(
  limit = 500,
): Promise<Array<{
  kind: "image" | "video";
  url: string;
  urlHash: string;
}>> {
  const [imgRows]: any = await pool.query(
    `SELECT url, url_hash AS urlHash FROM note_images
       WHERE media_status = 'unknown'
       LIMIT ?`,
    [limit],
  );
  const [vidRows]: any = await pool.query(
    `SELECT url, url_hash AS urlHash FROM note_videos
       WHERE media_status = 'unknown'
       LIMIT ?`,
    [limit],
  );
  const out: Array<{ kind: "image" | "video"; url: string; urlHash: string }> = [];
  for (const r of imgRows) out.push({ kind: "image", url: r.url, urlHash: r.urlHash });
  for (const r of vidRows) out.push({ kind: "video", url: r.url, urlHash: r.urlHash });
  return out;
}

/**
 * 小红书等 CDN URL 通常会因为缺签名 / Referer 返回 403。
 * 我们记录 media_status 时按 http_status 分类：
 *  - 2xx            → reachable
 *  - 401 / 403      → auth_required（前端应该走代理或灰底占位）
 *  - 404 / 410      → gone（资源永久不可用）
 *  - 其它 / 异常    → error
 */
export function classifyHttpStatus(status: number): "reachable" | "auth_required" | "gone" | "error" {
  if (status >= 200 && status < 400) return "reachable";
  if (status === 401 || status === 403) return "auth_required";
  if (status === 404 || status === 410) return "gone";
  return "error";
}