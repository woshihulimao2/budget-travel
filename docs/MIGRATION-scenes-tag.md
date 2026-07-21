# 场景标签（Scene Tags）改造 — 数据层优先实施方案

> 2026-07 重构
> 目标：把"防坑指南"按用户场景（衣服 / 美食 / 住宿 / 出行）分类过滤，
> 整套标签体系**在数据入库时就打好**，前端只负责展示和过滤。

---

## 1. 为什么必须在数据层打 tag？

最早考虑过在前端用 `scamType` 派生出 scene 标签（"Tea House → Food"）。
但这有 3 个硬伤：

1. **跨数据源不一致** — 同一个 scamType 在不同城市的描述可能跨越多个场景
   （"西安回民街按串计价"既是 Food 也是 Lodging 的引导）。
2. **不能编辑** — 一旦派生出错，运营改不了源码
3. **不能加维度** — 以后想加 "Payment / Visa" 等新场景，又要改前端

所以这次改造的核心：**入库即打 tag，存到 DB 字段**。

---

## 2. 数据模型

### 类型

```ts
// src/types.ts
export type SceneTag = "Apparel" | "Food" | "Lodging" | "Transport";
export const SCENE_TAGS: SceneTag[] = ["Apparel", "Food", "Lodging", "Transport"];

export interface ScamInfo {
  // ...原有字段
  scenes?: SceneTag[];
}
```

### DB schema

```sql
ALTER TABLE scams ADD COLUMN scenes VARCHAR(64) NULL AFTER category;
```

- 类型用 `VARCHAR(64)` 而**不是 `JSON`**：跨 MySQL 5.7/8.x 行为一致，
  写代码简单（`JSON.stringify` / `split(',')`），SQL 查询可以用
  `FIND_IN_SET('Food', scenes)`。
- 缺省 `NULL`：老数据不报错，新数据才会写。

---

## 3. 入库流水线

### 三层 derivation 策略

```ts
// src/safety/sceneDerivation.ts
function deriveScenes(input: {
  scamType?: string;
  category?: string;
  explicitScenes?: unknown;
}): SceneTag[] {
  // 1) 显式 tags 优先（来源：JSON "scenes" 或 MD **场景标签** 块）
  // 2) 兜底：用 scamType 启发式映射
  // 3) 兜底：用 category 文本关键词匹配
}
```

**优先级**：显式 > scamType > category

**为什么不全靠显式？**
- 老数据没有显式标签 → 不能挂掉
- 关键词匹配覆盖 90% 套路

---

## 4. 显式标签的数据源格式

### `data/final/scenarios.json`

```json
{
  "id": "SC01",
  "name": "西湖「茶托」/ 假英语学生骗局",
  "risk": "high",
  "category": "茶托/酒托",
  "scenes": ["Food"],
  ...
}
```

### `data/final/杭州套路避坑指南.md`

在每个 `## 套路标题` 块内，可加：

```markdown
**场景标签**：美食、住宿
```

解析正则：

```ts
/\*\*场景标签\*\*[：:]\s*([^\n]+)/i
```

捕到 `美食、住宿`，split 后过滤 SCENE_TAGS。捕不到就走派生。

---

## 5. 派生映射表（兜底层）

### scamType 启发式

| scamType | 默认 scenes |
|----------|-------------|
| `Tea House` | `["Food"]` |
| `Fake Goods` | `["Apparel"]` |
| `Transport` | `["Transport"]` |
| `Overcharging` | `["Food", "Lodging"]` |
| `Crowd Warning` | `["Transport"]` |

### category 关键词兜底

| category 含有的字 | scenes |
|-------------------|--------|
| 茶托/酒托/咖啡/餐厅/回民街/夜市 | `["Food"]` |
| 丝绸/玉器/龙井/购物/假货/山寨 | `["Apparel"]` |
| 黑车/大巴/机场/车站/出租/公交 | `["Transport"]` |
| 住宿/民宿/跟团/酒店 | `["Lodging"]` |

---

## 6. 入库 CLI

```bash
# 全套种子（含 13 条 scams，每条都已标 scenes）
npm run import:seed

# 重新灌 scenarios.json（保留人工标注的 scenes）
npm run import:scenarios

# 重新灌 MD 文件（带 **场景标签** 块）
npm run import:scenarios:md
```

三种入口都通过同一个 `upsertScam({ ... scenes })` 写入。

---

## 7. API

### 已有透传

- `GET /api/scams` 输出包含 `scenes: string[]`
- `POST /api/admin/import-scenarios*` 三个入口都接 `scenes`

### 新增

- `GET /api/scenes?city=hangzhou`

```json
{
  "scenes": {
    "Apparel": 3,
    "Food": 4,
    "Lodging": 1,
    "Transport": 4
  },
  "list": {
    "Apparel": [{ "id": "...", "title": "...", ... }],
    ...
  },
  "city": "hangzhou"
}
```

供后续"全局场景计数"展示用。v1 前端暂未使用，但已上线方便调试。

---

## 8. 前端落地

### 新组件

| 文件 | 用途 |
|------|------|
| `src/components/TravelReadinessCheck.tsx` | 整备度（从 dashboard 搬到 survival） |
| `src/components/ScamExam.tsx` | 考试化模拟器（搬到 scams tab 顶部） |
| `src/components/HotPostsSidebar.tsx` | 搜索框 + Top 5（桌面双栏 / H5 垂叠） |
| `src/components/ScamCategoryTabs.tsx` | 5 个 sub-tab（横滑 / 计数） |

### 整备度 ↔ 实用工具联动

`STEP_TO_CATEGORY` 把 6 个步骤映射到 5 大支柱分类。勾上某步骤，对应支柱卡片亮起绿框。

```ts
export const STEP_TO_CATEGORY: Record<StepKey, string> = {
  pay1: "Payment",  vpn1: "Internet", map1: "Apps",
  taxi1: "Transit", twov: "Visa",    no_tea: "Essentials",
};
```

### Scams tab 全新布局

```
┌─────────────────────────────────────────┐
│ HotPostsSidebar (搜索 + Top 5)          │  ← 桌面左右 / H5 上下
├─────────────────────────────────────────┤
│ ScamExam (考试)                          │  ← 满宽
├─────────────────────────────────────────┤
│ ScamCategoryTabs (全部 / 衣服 / 美食 / 住宿 / 出行) │
├──────────────────┬──────────────────────┤
│ 黑名单 col-5     │ 详情 col-7            │  ← filtered by scenes
└──────────────────┴──────────────────────┘
```

---

## 9. 数据库迁移（生产环境）

### 升级前

```sql
-- 检查 scenes 列是否存在
SELECT COLUMN_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scams' AND COLUMN_NAME = 'scenes';
```

### 自动迁移

`initDb()` 在 server 启动时会自动跑：

```sql
ALTER TABLE scams ADD COLUMN scenes VARCHAR(64) NULL AFTER category;
```

是幂等的：先查 `information_schema`，有列就跳过。

### 旧数据回填

启动后用 `npm run import:seed` 或 `npm run import:scenarios` 重新灌入数据。
**老数据**会用 `deriveScenes()` 自动派生 scenes，**不会丢**。

---

## 10. 测试覆盖

| 套件 | 用例数 | 关键验证 |
|------|--------|---------|
| `safety/sceneDerivation.test.ts` | 21 | 显式 > scamType > category 三层优先级 |
| `components/TravelReadinessCheck.test.tsx` | 8 | 0%/50%/100% 进度、勾选回调、STEP_TO_CATEGORY |
| `components/ScamExam.test.tsx` | 5 | 状态机、超时算错、错题本 |
| `components/HotPostsSidebar.test.tsx` | 7 | 搜索匹配、H5 垂叠、热门点击 |
| `components/ScamCategoryTabs.test.tsx` | 7 | 计数、汉化、active 高亮、H5 横滑 |
| `safety/moderationPatterns.test.ts` | 20 | 之前的 AI 安全词库 |
| `safety/inputGuard.test.ts` | 13 | 输入审核 |
| `safety/outputGuard.test.ts` | 13 | 输出审核 |
| **总计** | **94** | **全过** ✅ |

---

## 11. 后续可做

- 后台管理界面：可视化编辑某条 scam 的 scenes 标签
- 接 RAG：把 `scenes` 作为元数据过滤维度
- 国际化：英文版 sub-tab（"Apparel / Food / Lodging / Transport"）
- 用户行为分析：哪个 scenes 的 scam 点击率最高，反向迭代内容