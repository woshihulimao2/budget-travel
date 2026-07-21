import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ChatImage from "./ChatImage";
import type { SourceMode } from "./Header";

// Renders chat message content as Markdown, including inline images the AI guide provides.
export default function ChatMarkdown({ content, sourceMode }: { content: string; sourceMode?: SourceMode }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        h1: ({ children }) => <h1 className="text-sm font-extrabold mb-2 mt-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-extrabold mb-2 mt-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-extrabold mb-1.5 mt-1">{children}</h3>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline font-medium">
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <ChatImage src={typeof src === "string" ? src : undefined} alt={alt} sourceMode={sourceMode} />
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-[11px] border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left font-bold">{children}</th>,
        td: ({ children }) => <td className="border border-slate-200 px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
