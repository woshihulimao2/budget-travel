/**
 * HotNotesByLocationPanel — 防坑指南页面底部「入库攻略」主从单面板。
 *
 * 设计目标：
 *   1. 把原来 5 个 HotNotesLocationPanel 合并为一个主面板，
 *      避免「同结构重复 5 次」的视觉噪声 + 13275px 的滚动长度。
 *   2. 顶部「数据胶囊 + 5 个 category tag」让用户一眼知道有多少笔记、
 *      多少地点、覆盖哪些主题。
 *   3. 主区沿用 ScamTab 已验证的「左 4 栏 location chip / 右 8 栏热门明细」布局，
 *      但是跨 category 的 location 汇总。
 *   4. 跨 category 过滤：5 个主题 tag 按钮，toggle 后只显示该 category 的明细。
 *
 * 数据来源：GET /api/hot-notes（不带 category 即返回全部）+ /api/hot-notes?category=衣|食|住|行|其他
 */

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  ImageOff,
  Loader2,
  AlertCircle,
  MapPin,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

export type MediaStatus = "reachable" | "auth_required" | "gone" | "error";

export interface HotNoteApi {
  id: string;
  platform: "xhs" | "dy" | "bili" | "wb" | string;
  category: string;
  sub_category: string | null;
  title: string;
  content: string | null;
  author: string | null;
  publish_time: string | null;
  source_url: string;
  source_keyword: string | null;
  media_type: "image" | "video" | "mixed";
  cover_url: string | null;
  liked_count: number;
  collected_count: number;
  comment_count: number;
  share_count: number;
  tags: string[];
  relevance: number | null;
  cover_status: MediaStatus | null;
  cover_hash: string | null;
  /** Server-computed location slug (see /api/hot-notes). */
  location_slug?: string;
}

export interface LocationGroup {
  slug: string;
  name: string;
  count: number;
  topNoteId: string;
  topCommentCount: number;
}

export interface HotNotesByLocationPanelProps {
  apiBase?: string;
  pageSize?: number;
  accentBg: string;
  accentText: string;
  accentColor: string;
  /** 是否默认展开（不再有 header 折叠按钮）。默认 false。 */
  defaultOpen?: boolean;
  /** 是否隐藏折叠 header（嵌入外层卡片时使用）。默认 false。 */
  hideHeader?: boolean;
}

interface ApiResponse {
  notes: HotNoteApi[];
  media: Record<string, Array<{
    kind: "image" | "video";
    seq: number;
    url: string;
    media_status: MediaStatus;
    http_status: number | null;
  }>>;
  total: number;
  reachableTotal: number;
  locations: LocationGroup[];
  limit: number;
  offset: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  xhs: "小红书", dy: "抖音", bili: "B站", wb: "微博",
};
const PLATFORM_TINT: Record<string, string> = {
  xhs: "bg-rose-50 text-rose-700 border-rose-100",
  dy: "bg-slate-900 text-white border-slate-900",
  bili: "bg-blue-50 text-blue-700 border-blue-100",
  wb: "bg-amber-50 text-amber-700 border-amber-100",
};
const CATEGORY_EMOJI: Record<string, string> = {
  衣: "🛍️", 食: "🍜", 住: "🏨", 行: "🚇", 其他: "🎒",
};
const STATUS_LABEL: Record<MediaStatus, string> = {
  reachable: "图可访问", auth_required: "鉴权拒绝", gone: "已失效", error: "请求失败",
};
const STATUS_TINT: Record<MediaStatus, string> = {
  reachable: "bg-emerald-100 text-emerald-700 border-emerald-200",
  auth_required: "bg-amber-100 text-amber-700 border-amber-200",
  gone: "bg-rose-100 text-rose-700 border-rose-200",
  error: "bg-rose-100 text-rose-700 border-rose-200",
};

const ALL_CATEGORIES = ["衣", "食", "住", "行", "其他"] as const;
type CategoryKey = (typeof ALL_CATEGORIES)[number];

// Web 端左右分栏固定高度：右侧滚动区默认露出「头部行 + 前 N 张卡片」的高度，
// 左侧地点列表高度与右侧对齐，两栏各自独立滚动（H5 不受影响，仍走页面滚动）。
const DESKTOP_VISIBLE_CARDS = 10;

// Aggregate the currently-loaded notes into location groups by the
// server-provided `location_slug` (single source of truth — no client-side
// keyword table). Names come from the server's `locations` list; unknown
// slugs fall back to the slug string.
function aggregateLocations(notes: HotNoteApi[], serverLocations: LocationGroup[]): LocationGroup[] {
  const nameBySlug = new Map<string, string>();
  for (const sl of serverLocations) nameBySlug.set(sl.slug, sl.name);

  const map = new Map<string, { count: number; topCommentCount: number; topNoteId: string }>();
  for (const n of notes) {
    const slug = n.location_slug || "other-hz";
    const existing = map.get(slug) || { count: 0, topCommentCount: 0, topNoteId: "" };
    existing.count++;
    if ((n.comment_count || 0) > existing.topCommentCount) {
      existing.topCommentCount = n.comment_count || 0;
      existing.topNoteId = n.id;
    }
    map.set(slug, existing);
  }
  return Array.from(map.entries())
    .map(([slug, v]) => ({
      slug,
      name: nameBySlug.get(slug) || slug,
      count: v.count,
      topNoteId: v.topNoteId,
      topCommentCount: v.topCommentCount,
    }))
    .sort((a, b) => b.count - a.count);
}

export default function HotNotesByLocationPanel(props: HotNotesByLocationPanelProps) {
  const {
    apiBase = "/api",
    pageSize = 10,
    accentBg,
    accentText,
    accentColor,
    defaultOpen = false,
    hideHeader = false,
  } = props;

  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryKey>>(
    new Set(ALL_CATEGORIES),
  );

  // 分页状态：每个 category 独立维护 offset；merged 显示
  const [pageOffsets, setPageOffsets] = useState<Record<CategoryKey, number>>({
    衣: 0, 食: 0, 住: 0, 行: 0, 其他: 0,
  });
  const [loadedPerCat, setLoadedPerCat] = useState<Record<CategoryKey, boolean>>({
    衣: false, 食: false, 住: false, 行: false, 其他: false,
  });

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // 检测 H5（基于 viewport 宽度 < 768px），决定用 Load More 按钮还是无限滚动
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 检测桌面端（lg 断点 >= 1024px）：左右分栏固定高度 + 独立滚动只在桌面生效
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 桌面端分栏高度：测量右栏「头部行 + 前 10 张卡片」的实际高度，
  // 作为左右两栏共同的 max-height；卡片高度随图片/文案变化时由 ResizeObserver 重测。
  const rightScrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardsWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  // 单一 fetch 函数：拉取一组 (category, offset) 数据并 merge 到现有 data
  const fetchBatch = async (
    cat: CategoryKey,
    offset: number,
  ): Promise<{ cat: CategoryKey; json: ApiResponse }> => {
    const params = new URLSearchParams({
      category: cat,
      limit: String(pageSize),
      offset: String(offset),
      mediaOnly: "all",
    });
    const r = await fetch(`${apiBase}/hot-notes?${params.toString()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${cat}`);
    return { cat, json: (await r.json()) as ApiResponse };
  };

  // 首次 fetch：5 类各拉 10 条
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLoadedPerCat({ 衣: false, 食: false, 住: false, 行: false, 其他: false });
    setPageOffsets({ 衣: 0, 食: 0, 住: 0, 行: 0, 其他: 0 });

    const initBatch = async () => {
      try {
        const results = await Promise.all(
          ALL_CATEGORIES.map((cat) => fetchBatch(cat, 0)),
        );
        if (cancelled) return;
        const mergedNotes: HotNoteApi[] = [];
        const mergedMedia: ApiResponse["media"] = {};
        const locMap = new Map<string, LocationGroup>();
        let mergedTotal = 0;
        let mergedReachable = 0;
        const catCounts: Record<string, number> = {};
        for (const { cat, json } of results) {
          for (const n of json.notes) {
            mergedNotes.push(n);
            catCounts[cat] = (catCounts[cat] || 0) + 1;
          }
          Object.assign(mergedMedia, json.media);
          mergedTotal += json.total;
          mergedReachable += json.reachableTotal;
          for (const loc of json.locations) {
            const cur = locMap.get(loc.slug);
            if (!cur || cur.count < loc.count) {
              locMap.set(loc.slug, { ...loc });
            }
          }
        }
        const locations = Array.from(locMap.values()).sort((a, b) => b.count - a.count);
        setData({
          notes: mergedNotes,
          media: mergedMedia,
          total: mergedTotal,
          reachableTotal: mergedReachable,
          locations,
          limit: pageSize,
          offset: 0,
        });
        // 标记哪些 category 已加载完（API 返回的 notes.length < pageSize 说明到底）
        const newLoaded: Record<CategoryKey, boolean> = {
          衣: false, 食: false, 住: false, 行: false, 其他: false,
        };
        for (const { cat, json } of results) {
          if (json.notes.length < pageSize) newLoaded[cat] = true;
        }
        setLoadedPerCat(newLoaded);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initBatch();
    return () => {
      cancelled = true;
    };
  }, [apiBase, pageSize, open]);

  /**
   * Load More：每个未到底的 category 增量 pageSize 条，merge 到 data。
   * 当 selectedCategories.size < 5 时，只增量当前选中的 category（节省流量）。
   * 当 selectedLocation 不为 null 时，仍然 5 类都增量，client 端 location 过滤即可。
   */
  const loadMore = React.useCallback(async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const catsToFetch: CategoryKey[] =
        selectedCategories.size === ALL_CATEGORIES.length
          ? (ALL_CATEGORIES as unknown as CategoryKey[])
          : (Array.from(selectedCategories) as CategoryKey[]);
      const tasks = catsToFetch
        .filter((cat) => !loadedPerCat[cat])
        .map((cat) => fetchBatch(cat, pageOffsets[cat] + pageSize));
      if (tasks.length === 0) return;
      const results = await Promise.all(tasks);
      if (!data) return;
      // merge
      const newNotes: HotNoteApi[] = [];
      const newMedia: ApiResponse["media"] = { ...data.media };
      const newLoaded: Record<CategoryKey, boolean> = { ...loadedPerCat };
      const newOffsets: Record<CategoryKey, number> = { ...pageOffsets };
      for (const { cat, json } of results) {
        newNotes.push(...json.notes);
        Object.assign(newMedia, json.media);
        newOffsets[cat] = pageOffsets[cat] + pageSize;
        if (json.notes.length < pageSize) newLoaded[cat] = true;
      }
      // locations 一般不变（没新增），但是为了稳，merge topNoteId 仍可拼接 notes
      setData({
        ...data,
        notes: [...data.notes, ...newNotes],
        media: newMedia,
        offset: data.offset + newNotes.length,
      });
      setLoadedPerCat(newLoaded);
      setPageOffsets(newOffsets);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [data, loadingMore, loadedPerCat, pageOffsets, selectedCategories, apiBase, pageSize]);

  // H5 端 IntersectionObserver：sentinel div 进入视口触发 loadMore
  useEffect(() => {
    if (!isMobile) return;
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) loadMore();
      },
      { rootMargin: "200px" },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [isMobile, loadingMore, loadMore]);

  // 当前右侧明细：location 筛选 + category 筛选 + 按评论数 desc
  // 注：分页在 fetch 层用 offset 实现，前端这里只做"显示当前已加载的子集"
  const rightColumnNotes = useMemo(() => {
    if (!data) return [];
    let pool = data.notes;
    if (selectedLocation) {
      pool = pool.filter((n) => (n.location_slug || "other-hz") === selectedLocation);
    }
    if (selectedCategories.size !== ALL_CATEGORIES.length) {
      pool = pool.filter((n) => selectedCategories.has(n.category as CategoryKey));
    }
    return [...pool].sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0));
  }, [data, selectedLocation, selectedCategories]);

  // 桌面端：测量右栏可视高度（头部行 + 前 DESKTOP_VISIBLE_CARDS 张卡片）。
  // 卡片不足 10 张时取实际内容高度（此时右栏无内滚，左栏跟随收窄）。
  React.useLayoutEffect(() => {
    if (!isDesktop) {
      setPanelHeight(null);
      return;
    }
    const wrap = cardsWrapRef.current;
    const scroller = rightScrollRef.current;
    if (!wrap || !scroller) return;
    const measure = () => {
      const cards = Array.from(wrap.children) as HTMLElement[];
      if (cards.length === 0) {
        setPanelHeight(null);
        return;
      }
      const last = cards[Math.min(DESKTOP_VISIBLE_CARDS, cards.length) - 1];
      // 卡片底边相对滚动容器内容顶部的距离 = 视口内相对距离 + 已滚动量
      const h =
        last.getBoundingClientRect().bottom -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      setPanelHeight(Math.ceil(h));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [isDesktop, rightColumnNotes]);

  // 切换地点 / 主题筛选后，右栏滚回顶部，避免停留在上一个筛选的滚动位置
  useEffect(() => {
    rightScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedLocation, selectedCategories]);

  // 是否还能继续加载更多
  const hasMore = (() => {
    if (!data) return false;
    if (selectedCategories.size === ALL_CATEGORIES.length) {
      // 5 类全开：所有类都到底才算完
      return Object.values(loadedPerCat).some((v) => !v);
    }
    // 只看选中的类
    return (Array.from(selectedCategories) as CategoryKey[]).some(
      (cat) => !loadedPerCat[cat],
    );
  })();
  const currentShown = rightColumnNotes.length;
  const totalAfterFilter = (() => {
    // 数据全集不能从 data.total 直接拿 (因为那是 db 全集，未应用 category 筛选)
    // 这里用 data.total 减 不在 selectedCategories 的类 (估算)
    if (selectedCategories.size === ALL_CATEGORIES.length) return data?.total ?? 0;
    if (!data) return 0;
    let n = 0;
    for (const c of selectedCategories) {
      n += data.notes.filter((x) => x.category === c).length;
    }
    // 累加：包含未知的 total（按类别）
    // 简化：返回 0 表示未知
    return n;
  })();
  const shownIsAll = data ? currentShown >= totalAfterFilter : false;

  // 跨 location 汇总（保持原 behavior：从全量 notes 重建 location）
  const aggregatedLocations = useMemo(() => {
    if (!data) return [];
    return aggregateLocations(data.notes, data.locations);
  }, [data]);

  // category counts（跨 location 全量）
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (data) {
      for (const n of data.notes) {
        counts[n.category] = (counts[n.category] || 0) + 1;
      }
    }
    return counts;
  }, [data]);

  const toggleCategory = (cat: CategoryKey) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const selectedLoc = selectedLocation
    ? aggregatedLocations.find((l) => l.slug === selectedLocation)
    : null;

  // Top 12 location（按 count desc）
  const topLocations = aggregatedLocations.slice(0, 12);

  const totalNotes = data?.total ?? 0;
  const totalLocations = aggregatedLocations.filter((l) => l.count > 0).length;

  return (
    <section
      data-testid="hot-notes-by-loc-panel"
      className={hideHeader ? "" : "bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs"}
    >
      {!hideHeader && (
        <>
      {/* 顶部 hero header：单行收口紧凑 */}
      <button
        type="button"
        data-testid="hot-notes-by-loc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 md:px-7 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <span className="text-base md:text-lg shrink-0">📍</span>
          <span className="text-sm md:text-base font-extrabold text-slate-900 shrink-0">
            杭州笔记入库攻略
          </span>
          <span className={`text-[10px] md:text-xs font-mono px-2.5 py-1 rounded-full ${accentBg} ${accentText} shrink-0`}>
            {open ? `${totalNotes} 条 · ${totalLocations} 个地点` : `按地点分类 · ${totalNotes} 条`}
          </span>
          {open && (
            <div className="hidden md:flex items-center gap-1 text-[10px]">
              {ALL_CATEGORIES.map((cat) => (
                <span key={cat} className="font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {CATEGORY_EMOJI[cat]} {cat} {categoryCounts[cat] || 0}
                </span>
              ))}
            </div>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
        )}
      </button>
        </>
      )}

      {(!hideHeader || open) && (
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="by-loc-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className={hideHeader ? "" : "overflow-hidden border-t border-slate-100"}
            data-testid="hot-notes-by-loc-body"
          >
            <div className="p-5 md:p-7 space-y-4">
              {/* 子说明：聚合后说明 */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                  从小红书 / 抖音 / B 站 / 微博等平台抓取的杭州相关笔记，
                  按<strong className="text-slate-700">评论数降序</strong>展示，右侧列表可上下滚动查看全部；
                  左侧按杭州细分地域分组、高度与右侧对齐并可单独滚动。
                  下方的「🛍️衣 🍜食 🏨住 🚇行 🎒其他」点击可叠加主题过滤。
                </p>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在从数据库加载入库笔记…
                </div>
              )}

              {error && !loading && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <strong className="font-bold">加载失败：</strong>
                    <span className="ml-1">{error}</span>
                  </div>
                </div>
              )}

              {!loading && !error && data && (
                <>
                  {/* 5 category toggle row（H5 横向滚动 + 顶部 sticky） */}
                  <div
                    className="sticky top-[120px] md:top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 py-2 -mx-1 px-1 md:mx-0 md:px-0 md:bg-transparent md:backdrop-blur-none md:static md:py-0"
                    data-testid="hot-notes-by-loc-cat-sticky"
                  >
                    <div
                      className="flex items-center gap-1 bg-slate-100 rounded-2xl md:rounded-full p-1.5 md:p-1 text-[12px] md:text-[11px] font-bold w-fit max-w-full overflow-x-auto"
                      role="toolbar"
                      aria-label="主题筛选"
                    >
                    {ALL_CATEGORIES.map((cat) => {
                      const isActive = selectedCategories.has(cat);
                      const count = categoryCounts[cat] || 0;
                      return (
                        <button
                          key={cat}
                          type="button"
                          data-testid={`hot-notes-by-loc-cat-${cat}`}
                          aria-pressed={isActive}
                          onClick={() => toggleCategory(cat)}
                          disabled={count === 0}
                          className={`shrink-0 min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                            isActive
                              ? `${accentColor} text-white shadow-sm`
                              : count === 0
                              ? "text-slate-300 cursor-not-allowed"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {CATEGORY_EMOJI[cat]} {cat} · {count}
                        </button>
                      );
                    })}
                    </div>
                  </div>

                  {/* 主区：左 4 栏 location / 右 8 栏明细（H5 顶部双 row sticky，Web 左 4 sticky + 右 8 内部滚动） */}
                  <div
                    className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-start"
                    data-testid="hot-notes-by-loc-layout"
                  >
                    {/* 左 4 栏（桌面 sticky） / 顶部 chip 横滑（H5 sticky top-[58px]） */}
                    <div
                      className="lg:col-span-4 flex flex-row lg:flex-col gap-2 lg:gap-2.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0 sticky top-[200px] md:top-[60px] z-[9] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 py-1.5 lg:bg-transparent lg:backdrop-blur-none lg:static lg:py-0 lg:pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full"
                      style={isDesktop && panelHeight ? { maxHeight: panelHeight, overflowY: "auto" } : undefined}
                      data-testid="hot-notes-by-loc-locations"
                    >
                      <div className="text-[11px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-1 shrink-0">
                        <MapPin className="h-3.5 w-3.5" />
                        地点 · {topLocations.length}
                      </div>
                      <button
                        type="button"
                        data-testid="hot-notes-by-loc-loc-all"
                        aria-pressed={selectedLocation === null}
                        onClick={() => setSelectedLocation(null)}
                        className={`shrink-0 min-h-[44px] w-auto lg:w-full whitespace-nowrap text-left p-3 rounded-2xl border transition-all ${
                          selectedLocation === null
                            ? `${accentColor} border-transparent text-white shadow-md`
                            : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold">📍 全部地点</span>
                          <span className={`text-[10px] font-mono font-bold ${selectedLocation === null ? "text-white/80" : "text-slate-400"}`}>
                            {totalNotes}
                          </span>
                        </div>
                        <div className={`text-[10px] mt-0.5 ${selectedLocation === null ? "text-white/80" : "text-slate-400"}`}>
                          按评论数取 Top
                        </div>
                      </button>

                      {topLocations.map((loc) => {
                        const isSelected = selectedLocation === loc.slug;
                        return (
                          <button
                            key={loc.slug}
                            type="button"
                            data-testid={`hot-notes-by-loc-loc-${loc.slug}`}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedLocation(loc.slug)}
                            className={`shrink-0 min-h-[44px] w-auto lg:w-full whitespace-nowrap text-left p-3 rounded-2xl border transition-all ${
                              isSelected
                                ? `${accentColor} border-transparent text-white shadow-md`
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold">{loc.name}</span>
                              <span className={`text-[10px] font-mono font-bold ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                                {loc.count}
                              </span>
                            </div>
                            <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                              <TrendingUp className="h-3 w-3" />
                              顶部 {fmtCount(loc.topCommentCount)} 评论
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 右 8 栏：当前过滤条件下的热门明细。
                        Web：固定高度（头部行 + 前 10 张卡片，动态测量）内部滚动，未测量前兜底 600px；
                        H5：走页面 scroll。左栏高度与此对齐，见上方 panelHeight。 */}
                    <div
                      ref={rightScrollRef}
                      className="lg:col-span-8 lg:max-h-[600px] lg:overflow-y-auto lg:pr-2 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full"
                      style={isDesktop && panelHeight ? { maxHeight: panelHeight } : undefined}
                      data-testid="hot-notes-by-loc-details"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-y-1.5 gap-x-3 px-1">
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 uppercase tracking-widest">
                          <span>
                            {selectedLoc
                              ? `${selectedLoc.name} · ${selectedLoc.count} 条`
                              : `全部 · ${totalNotes} 条`}
                          </span>
                          {selectedCategories.size !== ALL_CATEGORIES.length && (
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${accentBg} ${accentText}`}>
                              已筛主题 {selectedCategories.size}/5
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">按评论数降序</span>
                      </div>

                      {rightColumnNotes.length === 0 && (
                        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
                          当前筛选下没有入库笔记。切换地点或主题试试。
                        </div>
                      )}

                      <div ref={cardsWrapRef} className="space-y-4">
                        {rightColumnNotes.map((n, idx) => (
                          <NoteBigCard
                            key={n.id}
                            note={n}
                            mediaByNote={data.media[n.id] || []}
                            rank={idx + 1}
                            isTop={idx === 0 && !selectedLocation}
                            accentColor={accentColor}
                          />
                        ))}
                      </div>

                      {/* 分页加载：Web 端按钮 + H5 端 sentinel（IntersectionObserver） */}
                      <div className="flex flex-col items-center gap-2 pt-2">
                        {/* H5 端：sentinel 触发无限滚动；Web 端 hidden */}
                        {!isMobile && hasMore && (
                          <button
                            type="button"
                            data-testid="hot-notes-load-more"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className={`min-h-[44px] px-6 py-2.5 rounded-full text-xs font-bold transition-all ${
                              loadingMore
                                ? "bg-slate-100 text-slate-400 cursor-wait"
                                : `${accentBg} ${accentText} hover:shadow-md`
                            }`}
                          >
                            {loadingMore ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                加载中...
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                加载更多
                                <span className="opacity-60">（还有 {data.total - currentShown} 条）</span>
                              </span>
                            )}
                          </button>
                        )}
                        {!isMobile && !hasMore && currentShown > 0 && (
                          <p className="text-[11px] text-slate-400 py-2">
                            — 已加载全部 {currentShown} 条入库笔记 —
                          </p>
                        )}

                        {/* H5 sentinel：IntersectionObserver 在上面 useEffect 里挂载 */}
                        {isMobile && (
                          <div
                            ref={sentinelRef}
                            data-testid="hot-notes-scroll-sentinel"
                            className="h-2 w-full"
                            aria-hidden
                          />
                        )}
                        {isMobile && loadingMore && (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在加载更多...
                          </div>
                        )}
                        {isMobile && !hasMore && currentShown > 0 && (
                          <p className="text-[11px] text-slate-400 py-3">
                            — 已到底部，共 {currentShown} 条 —
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// 单张大卡
// -----------------------------------------------------------------------------

function NoteBigCard({
  note,
  mediaByNote,
  rank,
  isTop,
  accentColor,
}: {
  note: HotNoteApi;
  mediaByNote: Array<{
    kind: "image" | "video";
    seq: number;
    url: string;
    media_status: MediaStatus;
    http_status: number | null;
  }>;
  rank: number;
  isTop: boolean;
  accentColor: string;
}) {
  const platformLabel = PLATFORM_LABEL[note.platform] || note.platform;
  const platformTint = PLATFORM_TINT[note.platform] || "bg-slate-100 text-slate-700 border-slate-200";
  const coverStatus: MediaStatus = note.cover_status || "auth_required";
  const isVideo = note.media_type === "video";

  // Load the cover through the server-side proxy (/api/note-image), which adds
  // the platform Referer the browser can't. We attempt optimistically for any
  // note that has a cover image candidate and wasn't probed as permanently
  // gone — the earlier direct probe often says auth_required where the proxy
  // still succeeds. onError falls back to the placeholder.
  const [imgFailed, setImgFailed] = useState(false);
  const hasCandidate =
    (!!note.cover_url || mediaByNote.some((m) => m.kind === "image")) &&
    coverStatus !== "gone";
  const proxySrc = `/api/note-image?noteId=${encodeURIComponent(note.id)}&seq=0`;
  const showImage = hasCandidate && !imgFailed;

  return (
    <a
      href={note.source_url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`hot-notes-by-loc-card-${note.id}`}
      className={`group block bg-white border rounded-3xl overflow-hidden shadow-xs hover:border-slate-400 hover:shadow-md transition-all ${
        isTop ? "border-2 border-rose-300 shadow-md ring-2 ring-rose-200" : "border-slate-200"
      }`}
    >
      <div className="md:flex">
        <div className="md:w-2/5 bg-slate-100 relative aspect-[16/10] md:aspect-auto overflow-hidden">
          {showImage ? (
            <img src={proxySrc} alt={note.title} loading="lazy" referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
              {isVideo ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 mb-1"><path d="M8 5v14l11-7z"/></svg>
              ) : (
                <ImageOff className="h-7 w-7 mb-1.5" />
              )}
              <span className="text-[10px] font-mono uppercase tracking-widest">
                {isVideo ? "视频笔记" : STATUS_LABEL[coverStatus]}
              </span>
            </div>
          )}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/70 text-white border border-white/20 tracking-wider">
              #{rank}
            </span>
            <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase border tracking-wider ${platformTint}`}>
              {platformLabel}
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/90 text-slate-700">
              {CATEGORY_EMOJI[note.category]} {note.category}
            </span>
          </div>
          {isVideo && (
            <div className="absolute top-2 right-2 h-7 w-7 bg-black/60 rounded-full flex items-center justify-center pointer-events-none">
              <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4"><path d="M8 5v14l11-7z"/></svg>
            </div>
          )}
          {isTop && (
            <div className="absolute bottom-2 left-2 text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-rose-600 text-white uppercase tracking-widest">
              🔥 评论数第一
            </div>
          )}
        </div>
        <div className="md:w-3/5 p-4 md:p-5 flex flex-col gap-2.5">
          <h4 className="font-extrabold text-[14px] md:text-[15px] leading-snug text-slate-900 line-clamp-2 group-hover:text-slate-700 transition-colors">
            {note.title}
          </h4>
          {note.content && (
            <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-2">
              {note.content}
            </p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
            {note.author && <span>@{note.author}</span>}
            {note.publish_time && (
              <span>{new Date(note.publish_time).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
            )}
            {note.source_keyword && (
              <span className={`px-1.5 py-0.5 rounded ${accentColor} text-white`}>{note.source_keyword}</span>
            )}
          </div>
          <div className="mt-auto flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-3">
              <span>👍 {fmtCount(note.liked_count)}</span>
              <span>⭐ {fmtCount(note.collected_count)}</span>
              <span className="font-extrabold text-slate-900">💬 {fmtCount(note.comment_count)}</span>
              <span>↗ {fmtCount(note.share_count)}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </a>
  );
}

function fmtCount(n: number | null | undefined): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 100_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 10_000).toFixed(1).replace(/\.0$/, "") + "w";
}