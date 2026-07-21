/**
 * TravelReadinessCheck — the 6-item preparedness checklist + progress bar.
 *
 * Originally lived inside the dashboard (App.tsx ~L1204-1355). Moved out
 * so the survival "实用工具" tab can own it, and the dashboard can be
 * reserved for nav-style overview content.
 *
 * Two modes:
 *   - default: full layout with progress bar + 6 buttons + completion banner
 *   - compact: just a tiny ring + "X / 6 已就绪" — useful for places where
 *              we still want a glance of readiness but can't afford the height
 *
 * Exports STEP_TO_CATEGORY so the survival SURVIVAL_TIPS cards can apply
 * a ring highlight when a corresponding step is checked.
 */

import React from "react";
import { CheckCircle2 } from "lucide-react";

export interface TravelReadinessCheckProps {
  completedSteps: Record<string, boolean>;
  onToggle: (key: string) => void;
  /** Render a compact version (just progress + counter) */
  compact?: boolean;
  /** Color theme for the bar. Defaults to slate. */
  theme?: {
    accentBg: string;
    accentText: string;
    accentColor: string;
  };
}

export const STEP_KEYS = [
  "pay1",   // 支付宝
  "vpn1",   // VPN / eSIM
  "map1",   // Apple Maps / 高德
  "taxi1",  // 正规出租车
  "twov",   // 144h 免签机票
  "no_tea", // 拒绝喝茶
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export interface ReadinessStep {
  key: StepKey;
  title: string;
  desc: string;
}

/**
 * Step → category mapping consumed by SURVIVAL_TIPS cards for the
 * "you completed this → highlight the matching tip" linkage.
 */
export const STEP_TO_CATEGORY: Record<StepKey, string> = {
  pay1: "Payment",
  vpn1: "Internet",
  map1: "Apps",
  taxi1: "Transit",
  twov: "Visa",
  no_tea: "Essentials",
};

export const STEPS: ReadinessStep[] = [
  {
    key: "pay1",
    title: "下载并绑定好支付宝（Alipay）",
    desc: "绑定好本国 Visa/Mastercard 信用卡，解决全部支付问题。",
  },
  {
    key: "vpn1",
    title: "购买过境免 VPN 漫游 eSIM 卡",
    desc: "免屏蔽保持 Google、Ins、WhatsApp 正常畅连。",
  },
  {
    key: "map1",
    title: "检查自带苹果地图（Apple Maps）",
    desc: "国内调用高德英文 API，定位精准，支持全英文检索。",
  },
  {
    key: "taxi1",
    title: "熟知正规出租车排队规范",
    desc: "拒绝任何在到达大厅内搭讪招揽的私家黑车。",
  },
  {
    key: "twov",
    title: "离境联程机票/酒店信息备齐",
    desc: "过境中国海关申请 144 小时 TWOV 许可签的硬性凭证。",
  },
  {
    key: "no_tea",
    title: "熟记「不喝茶，谢谢！」",
    desc: "拒绝景点（西湖/南京东路/碑林）可疑同路人搭讪去喝茶。",
  },
];

function computeProgress(steps: Record<string, boolean>): { done: number; total: number; pct: number } {
  const total: number = STEP_KEYS.length;
  const done = STEP_KEYS.filter((k) => steps[k]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

export default function TravelReadinessCheck(props: TravelReadinessCheckProps) {
  const { completedSteps, onToggle, compact, theme } = props;
  const themeCls = theme ?? {
    accentBg: "bg-indigo-50",
    accentText: "text-indigo-600",
    accentColor: "bg-indigo-500",
  };
  const { done, total, pct } = computeProgress(completedSteps);

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 text-xs">
        <div className={`h-2 w-16 rounded-full bg-slate-100 overflow-hidden`}>
          <div className={`h-full ${themeCls.accentColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono font-bold text-slate-700">
          {done}/{total} 已就绪
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xs">
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">您的旅行整备度</h3>
        <p className="text-xs text-slate-500">勾选以下项目，确保您对中国自由行做足 100% 准备！</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-bold font-mono">
          <span className={themeCls.accentText}>数字化生存检查</span>
          <span className="text-slate-900">{pct}% 已完成</span>
        </div>
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${themeCls.accentColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        {pct === 100 ? (
          <div className={`${themeCls.accentBg} ${themeCls.accentText} text-[11px] p-2.5 rounded-lg font-semibold flex items-center gap-1.5`}>
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>极棒！您已整备完毕，可以像本地达人一样畅游！</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">完成下方打卡清单，解锁极致安全的独立自由行。</div>
        )}
      </div>

      <div className="space-y-3.5" data-testid="readiness-steps">
        {STEPS.map((step) => {
          const checked = !!completedSteps[step.key];
          return (
            <button
              key={step.key}
              type="button"
              data-testid={`step-${step.key}`}
              aria-pressed={checked}
              onClick={() => onToggle(step.key)}
              className="w-full flex items-start gap-3 text-left hover:bg-slate-50 p-2 rounded-lg transition-all"
            >
              <input
                type="checkbox"
                checked={checked}
                readOnly
                tabIndex={-1}
                className={`mt-0.5 rounded h-4 w-4 shrink-0 ${checked ? themeCls.accentColor : ""}`}
              />
              <div>
                <h4 className="text-xs font-bold text-slate-900">{step.title}</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">{step.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}