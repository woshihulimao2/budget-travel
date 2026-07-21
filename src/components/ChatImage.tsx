import { useState } from "react";
import { Image as ImageIcon, Loader2, Search } from "lucide-react";
import type { SourceMode } from "./Header";

// Image with graceful fallback: if the AI-provided URL fails to load (dead/hallucinated link,
// Wikipedia blocked in mainland China, CDN timeout, ...), try the Chinese-language Wikipedia
// mirror first and then fall back to a chip with one-click search links on domestic
// image-search engines (Baidu / Bing CN / Sogou) so the user can always find a picture.
export default function ChatImage({ src, alt, sourceMode }: { src?: string; alt?: string; sourceMode?: SourceMode }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mode: SourceMode = sourceMode || "domestic";

  // Derive a human-readable keyword for the image from the URL or the alt text.
  // The server is asked with `/api/wiki-image?title=西湖&lang=zh`, so we can pull `title`
  // back out and feed it to a Chinese image-search engine as the search keyword.
  const keyword = (() => {
    if (alt && alt.trim()) return alt.trim();
    if (!src) return "";
    try {
      // Only inspect same-origin /api/wiki-image links to avoid surprises with arbitrary URLs.
      const url = new URL(src, window.location.origin);
      const title = url.searchParams.get("title");
      if (title) return title;
    } catch {
      /* ignore malformed URLs */
    }
    return "";
  })();

  // 真实加载的图片 URL：根据 sourceMode 决定走内站/外站图片代理。
  // 我们把 mode 作为 query 参数追加给 /api/wiki-image，让后端决定镜像优先级。
  const resolvedSrc = (() => {
    if (!src) return src;
    try {
      const url = new URL(src, window.location.origin);
      // 只对同源的 /api/wiki-image 改写模式，避免改写其他图床
      if (url.pathname === "/api/wiki-image") {
        url.searchParams.set("mode", mode);
        return url.toString();
      }
    } catch {
      /* ignore */
    }
    return src;
  })();

  // Build a list of image-search fallbacks matching the current source mode.
  // 内站（domestic）→ 百度/必应CN/搜狗；外站（overseas）→ Google / Bing 国际 / Wikimedia Commons。
  const fallbackSearches = keyword
    ? mode === "overseas"
      ? [
          { label: "Google 图片", url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch` },
          { label: "Bing Images", url: `https://www.bing.com/images/search?q=${encodeURIComponent(keyword)}` },
          { label: "Wikimedia Commons", url: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(keyword)}&title=Special:MediaSearch&go=Go&type=image` },
        ]
      : [
          { label: "百度图片", url: `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(keyword)}` },
          { label: "必应图片", url: `https://cn.bing.com/images/search?q=${encodeURIComponent(keyword)}` },
          { label: "搜狗图片", url: `https://pic.sogou.com/pics?query=${encodeURIComponent(keyword)}` },
        ]
    : [];

  if (!src) return null;

  if (failed) {
    return (
      <div className="my-2 flex flex-wrap items-center gap-1.5">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {alt ? `查看图片：${alt}` : "查看图片链接"}
        </a>
        {fallbackSearches.length > 0 && (
          <span className="text-[10px] text-slate-400 mr-1">
            {mode === "overseas" ? "外站搜图：" : "国内搜图："}
          </span>
        )}
        {fallbackSearches.map((s) => (
          <a
            key={s.label}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              mode === "overseas"
                ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
            }`}
          >
            <Search className="h-3 w-3" />
            {s.label}搜「{keyword}」
          </a>
        ))}
      </div>
    );
  }

  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block my-2">
      {!loaded && !failed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium w-fit">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>正在为「{alt || "图片"}」加载实景…</span>
        </div>
      )}
      {/* 注意：不能加 `hidden` className —— `display:none` 会让浏览器完全跳过资源加载，
          onLoad 永远不触发，骨架会一直转。这里用纯 opacity-0 占位，浏览器仍会正常 fetch。 */}
      <img
        src={resolvedSrc}
        alt={alt || ""}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`max-w-full rounded-xl border border-slate-200 my-2 transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0 absolute h-0 w-0 overflow-hidden pointer-events-none"
        }`}
      />
    </a>
  );
}
