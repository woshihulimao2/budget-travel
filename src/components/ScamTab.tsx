import { motion } from "motion/react";
import HotNotesByLocationPanel from "./HotNotesByLocationPanel";
import ScamExam, { type ScamExamQuestion } from "./ScamExam";
import type { ScamInfo } from "../types";

/**
 * ScamTab — 防坑指南标签页。
 *
 * 结构（三段）：
 *   ① hero 头：标题 + 收录/高危/中度条数胶囊
 *   ② 主区 HotNotesByLocationPanel（左地点 / 右评论数排序明细，左右等高独立滚动）
 *   ③ 末段独立信息块：防坑结业考试 ScamExam
 */
interface ScamTabProps {
  theme: {
    accentBg: string;
    accentText: string;
    accentColor: string;
    shadowColor: string;
  };
  cityName: string;
  cityScams: ScamInfo[];
  highDangerCount: number;
  examQuestions: ScamExamQuestion[];
}

export default function ScamTab(props: ScamTabProps) {
  const { theme, cityName, cityScams, highDangerCount, examQuestions } = props;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* 1. 页面头：标题 + 简介（已切换为入库攻略视角，5 大主题 + 总条数） */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs">
        <span className={`text-[10px] font-mono tracking-widest ${theme.accentText} uppercase font-bold`}>
          杭州笔记入库攻略数据库
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">
          {cityName}实战避雷笔记
        </h2>
        <p className="text-xs md:text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
          从小红书 / 抖音 / B 站 / 微博等平台抓取的杭州相关实战笔记，
          按<strong className="text-slate-700">5 大主题</strong>分类筛选，
          选主题后右侧按<strong className="text-slate-700">评论数降序</strong>展示热门笔记。
          点击笔记卡片可跳转到原帖。
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-mono">
            收录 <strong>{cityScams.length}</strong> 条
          </span>
          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-mono">
            高危 <strong>{highDangerCount}</strong> 条
          </span>
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-mono">
            中度 <strong>{cityScams.filter((s) => s.dangerLevel !== "High").length}</strong> 条
          </span>
        </div>
      </div>

      {/* 2. 入库攻略主区：5 分类 chip + 评论数排序大卡（H5 兼容） */}
      <HotNotesByLocationPanel
        apiBase="/api"
        pageSize={100}
        accentBg={theme.accentBg}
        accentText={theme.accentText}
        accentColor={theme.accentColor}
        defaultOpen
        hideHeader
      />

      {/* 5. 末尾独立信息块：防坑结业考试 */}
      <section
        data-testid="scam-exam-section"
        className="bg-gradient-to-br from-indigo-50 via-white to-teal-50 border-2 border-indigo-200 rounded-3xl p-6 md:p-8 shadow-xs"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className={`text-[10px] font-mono tracking-widest ${theme.accentText} uppercase font-bold`}>
              🎓 实战演练 · 进入下一关
            </span>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">防坑结业考试</h3>
            <p className="text-xs text-slate-600 mt-1.5 max-w-xl leading-relaxed">
              前文你已经吸收了<strong className="text-slate-800"> {cityScams.length} 条套路</strong>的拆解；
              敢不敢花 60 秒来一场 2 题速测？答错的题目会自动加入错题本，方便事后巩固薄弱环节。
            </p>
          </div>
        </div>
        <div className="mt-6">
          <ScamExam questions={examQuestions} cityName={cityName} />
        </div>
      </section>
    </motion.div>
  );
}
