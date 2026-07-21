import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import TravelReadinessCheck, { STEP_TO_CATEGORY, STEP_KEYS, STEPS, type StepKey } from "./TravelReadinessCheck";
import { SURVIVAL_TIPS } from "../data";

// 实用工具页分组：按「什么时候用 + 有多重要」组织，而不是平铺。
const SURVIVAL_GROUPS: {
  step: string;
  title: string;
  sub: string;
  categories: string[];
  accent: string;
}[] = [
  {
    step: "01",
    title: "出发前 · 必须完成",
    sub: "支付与网络是两条生命线，不搞定落地寸步难行",
    categories: ["Payment", "Internet"],
    accent: "text-rose-600 bg-rose-50 border-rose-100",
  },
  {
    step: "02",
    title: "出发前 · 建议装好",
    sub: "必备 App 全家桶与过境免签政策，出发前 10 分钟搞定",
    categories: ["Apps", "Visa"],
    accent: "text-amber-700 bg-amber-50 border-amber-100",
  },
  {
    step: "03",
    title: "落地后 · 即刻上手",
    sub: "地铁乘车码与共享单车，落地当天现学现用",
    categories: ["Transit"],
    accent: "text-emerald-700 bg-emerald-50 border-emerald-100",
  },
];

// chip 上展示的中文短标签（≤4 个汉字）。从 STEPS[].title 里抽取主干词。
// 数据源仍是 STEPS，将来改 STEP 标题时把下方映射一并改。
const STEP_CHIP_LABELS: Record<StepKey, string> = {
  pay1: "支付宝",
  vpn1: "eSIM",
  map1: "地图",
  taxi1: "打车",
  twov: "144h",
  no_tea: "不喝茶",
};

/**
 * SurvivalTab — 实用工具标签页。
 *
 * 旧布局：左侧 lg:col-span-4 永久占用一块来放 TravelReadinessCheck，挤压 8 栏主区。
 * 新布局：
 *   ① 顶部整备度紧凑条（6 个圆点 chip + 进度条），默认收起原 6 按钮的详细列表；
 *   ② 用户点 "展开完整清单" 后，下方就地渲染原 <TravelReadinessCheck />，data-testid 与
 *      aria-pressed 契约保持不变，因此已有单元测试无需修改。
 *   ③ 下方主区 3 段 SURVIVAL_GROUPS 卡片网格，整页宽度铺开，"注意事项"将来扩 group
 *      只需添加 SURVIVAL_GROUPS 项，无须再动本组件结构。
 *
 * STEP_TO_CATEGORY 联动（勾选 → 卡片亮绿框）保留，位于下面的 groupTips.map 内部。
 */
interface SurvivalTabProps {
  theme: {
    accentBg: string;
    accentText: string;
    accentColor: string;
  };
  cityName: string;
  completedSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
}

export default function SurvivalTab({ theme, cityName, completedSteps, onToggleStep }: SurvivalTabProps) {
  const [readinessExpanded, setReadinessExpanded] = useState(false);

  // 用于顶部紧凑条的进度数字（X / 6 已就绪）
  const doneCount = STEP_KEYS.filter((k) => completedSteps[k]).length;
  const totalCount = STEP_KEYS.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* 1. 页面上下文头：上方说明 + 引导文案 */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs">
        <span className={`text-[10px] font-mono tracking-widest ${theme.accentText} uppercase font-bold`}>
          数字化生存配置 (跨城市通用平台)
        </span>
        <h2 className="text-2xl font-extrabold text-slate-900 mt-1">独立自由行配置支柱</h2>
        <p className="text-xs text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
          中国已经实现了极高的数字化与无现金化。下方配置卡片按「出发前必须完成 → 出发前建议装好 →
          落地后即刻上手」的使用顺序排列，请从上往下依次搞定。这些不仅适用于{cityName}，也全面通用
          于上海、北京、西安等全国各个大城市。<strong className="text-slate-700">勾选上方整备度条目，
          正文对应的配置卡片会亮起绿框</strong>，方便核对已落地的能力。
        </p>
      </div>

      {/* 2. 顶部独立整备度紧凑条：6 个圆点 chip + 进度 + 展开按钮。
          默认收起原 6 按钮列表，把主区让出来给"注意事项"。点开后展开原 TravelReadinessCheck。 */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
          {/* 左：标题 + 进度 + X/6 已就绪（小屏可堆叠） */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-extrabold text-slate-900">您的旅行整备度</h3>
              <span className={`text-[10px] font-mono font-bold ${theme.accentText}`}>
                {pct}% · {doneCount}/{totalCount} 已就绪
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${theme.accentColor} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* 中：6 个圆点 chip。
              chip 点击 → onToggleStep(key)；已完成的 chip 用 theme accent 填充。 */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 md:gap-2.5 shrink-0">
            {STEP_KEYS.map((k) => {
              const checked = !!completedSteps[k];
              const label = STEP_CHIP_LABELS[k as StepKey];
              return (
                <button
                  key={k}
                  type="button"
                  data-testid={`chip-${k}`}
                  aria-pressed={checked}
                  onClick={() => onToggleStep(k)}
                  title={STEPS.find((s) => s.key === k)?.title ?? label}
                  className={[
                    "h-10 md:h-11 px-2.5 md:px-3 rounded-full text-[11px] md:text-xs font-bold",
                    "border transition-all flex items-center justify-center gap-1.5 truncate",
                    checked
                      ? `${theme.accentBg} ${theme.accentText} border-transparent shadow-xs`
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-white",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-block h-1.5 w-1.5 md:h-2 md:w-2 rounded-full shrink-0",
                      checked ? "bg-white/80" : "bg-slate-300",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          {/* 右：展开/收起按钮 */}
          <button
            type="button"
            data-testid="readiness-toggle"
            aria-expanded={readinessExpanded}
            onClick={() => setReadinessExpanded((v) => !v)}
            className={[
              "shrink-0 h-10 px-4 rounded-full border text-xs font-bold",
              "flex items-center gap-1.5 transition-all",
              readinessExpanded
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-400",
            ].join(" ")}
          >
            {readinessExpanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                收起详细清单
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                展开完整清单
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {/* 展开时渲染原 TravelReadinessCheck —— 测试契约保持完整（data-testid="step-${key}"、aria-pressed） */}
        <AnimatePresence initial={false}>
          {readinessExpanded && (
            <motion.div
              key="readiness-expanded"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 20 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
              data-testid="readiness-expanded-region"
            >
              <TravelReadinessCheck
                completedSteps={completedSteps}
                onToggle={onToggleStep}
                theme={{
                  accentBg: theme.accentBg,
                  accentText: theme.accentText,
                  accentColor: theme.accentColor,
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. 主区：3 段 SURVIVAL_GROUPS 卡片网格（保持现状，仅去掉外层 lg:col-span 包裹） */}
      <div className="space-y-8">
        {SURVIVAL_GROUPS.map((group) => {
          const groupTips = SURVIVAL_TIPS.filter((t) => group.categories.includes(t.category));
          if (groupTips.length === 0) return null;
          return (
            <section key={group.step} className="space-y-4">
              {/* 阶段标题：按使用时序 + 重要性分组 */}
              <div className="flex items-center gap-3 px-1">
                <span className={`font-mono text-xs font-extrabold px-2.5 py-1.5 rounded-xl border ${group.accent}`}>
                  {group.step}
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{group.title}</h3>
                  <p className="text-[11px] text-slate-400">{group.sub}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {groupTips.map((tip) => {
                  // 联动：勾选了对应整备度步骤 → 卡片亮起绿框
                  const linkedSteps = Object.entries(STEP_TO_CATEGORY).filter(
                    ([, cat]) => cat === tip.category,
                  );
                  const isChecked = linkedSteps.some(([stepKey]) => completedSteps[stepKey]);
                  let badgeColor = "bg-slate-100 text-slate-800 border-slate-200";
                  if (tip.category === "Payment") badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-100";
                  if (tip.category === "Internet") badgeColor = "bg-rose-50 text-rose-800 border-rose-100";
                  if (tip.category === "Transit") badgeColor = "bg-blue-50 text-blue-800 border-blue-100";

                  return (
                    <div
                      key={tip.title}
                      className={`bg-white border rounded-3xl p-6 flex flex-col justify-between gap-5 shadow-xs transition-all ${
                        isChecked
                          ? "border-emerald-300 ring-2 ring-emerald-200"
                          : "border-slate-200"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${badgeColor}`}>
                            {tip.category === "Payment" ? "移动支付" : tip.category === "Internet" ? "免屏蔽网络" : tip.category === "Transit" ? "公共交通" : tip.category === "Apps" ? "必备APP" : "签证指南"} 配置
                          </span>
                          {tip.essential && (
                            <span className="text-[10px] bg-red-50 text-red-700 font-extrabold px-2 py-0.5 rounded border border-red-100 animate-pulse">
                              极其关键
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-950 mb-4">{tip.title}</h3>

                        <ol className="space-y-3">
                          {tip.steps.map((step, idx) => (
                            <li key={idx} className="flex gap-2.5 text-xs text-slate-600 leading-relaxed">
                              <span className={`font-mono text-[10px] font-extrabold ${theme.accentText} ${theme.accentBg} h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                                {idx + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                        <strong className="text-slate-700 font-bold block mb-0.5">💡 向导生存小建议:</strong>
                        {tip.tips}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </motion.div>
  );
}
