import { LogIn, LogOut, User, Mail, ChevronRight, Globe2 } from "lucide-react";
import type { AuthUser } from "./HeaderAuth";
import type { SourceMode } from "./Header";

interface Props {
  user: AuthUser | null;
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  onLogout: () => void | Promise<void>;
  onRequireLogin: () => void;
  /** 主题色（内站模式用），来自父组件 */
  accentBg: string;
}

/**
 * "账户"页：仅 H5 端渲染（`md:hidden`，由调用方控制）。
 * 含 4 个区块：
 *   1. 顶部身份卡：大头像 + 邮箱 + 账户 ID + 注册日期
 *   2. 列表项 1 —— 内站 / 外站 切换（pill 控件）
 *   3. 列表项 2 —— 账户邮箱信息行
 *   4. 列表项 3 —— 退出登录（已登录才显示）
 */
export default function AccountPanel({
  user,
  sourceMode,
  setSourceMode,
  onLogout,
  onRequireLogin,
  accentBg,
}: Props) {
  return (
    <div className="md:hidden">
      <div className="px-1">
        {/* 身份卡 */}
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="bg-slate-900 text-white px-5 py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 text-white text-lg font-extrabold flex items-center justify-center shrink-0">
              {user ? user.email.slice(0, 1).toUpperCase() : <User className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              {user ? (
                <>
                  <div className="text-base font-extrabold truncate">{user.email}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    账户 ID：#{user.id}
                    {user.createdAt
                      ? ` · 注册于 ${new Date(user.createdAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-base font-extrabold">未登录</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    登录后可同步您的 AI 定制行程与收藏。
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 列表项 */}
          <ul className="divide-y divide-slate-100">
            {/* 列表项 1：内站 / 外站 切换 */}
            <li>
              <div className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[56px]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Globe2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">图片源</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {sourceMode === "overseas" ? "外站（Google / 英文维基）" : "内站（百度 / 中文维基）"}
                    </div>
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-full p-0.5 shrink-0"
                  role="group"
                  aria-label="内站 / 外站 切换"
                >
                  <button
                    type="button"
                    onClick={() => setSourceMode("domestic")}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                      sourceMode === "domestic"
                        ? `${accentBg} text-white`
                        : "text-slate-500 active:text-slate-900"
                    }`}
                    aria-pressed={sourceMode === "domestic"}
                  >
                    内站
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("overseas")}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                      sourceMode === "overseas"
                        ? "bg-sky-500 text-white"
                        : "text-slate-500 active:text-slate-900"
                    }`}
                    aria-pressed={sourceMode === "overseas"}
                  >
                    外站
                  </button>
                </div>
              </div>
            </li>

            {/* 列表项 2：登录 / 切换账户 */}
            <li>
              <button
                type="button"
                onClick={onRequireLogin}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-50 transition-colors text-left min-h-[56px]"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <LogIn className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {user ? "切换 / 新增账户" : "登录或注册"}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">支持邮箱 + 密码</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </li>

            {/* 列表项 3：账户邮箱信息 */}
            <li>
              <div className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[56px]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">账户邮箱</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[40ch]">
                      {user ? user.email : "未登录"}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider shrink-0">
                  {user ? "Verified" : "Guest"}
                </span>
              </div>
            </li>

            {/* 列表项 4：退出登录（仅已登录） */}
            {user && (
              <li>
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center justify-between px-5 py-4 active:bg-rose-50 transition-colors text-left min-h-[56px] group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-100">
                      <LogOut className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-rose-600">退出登录</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        登出后不影响您本地的浏览数据
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-rose-300" />
                </button>
              </li>
            )}
          </ul>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4 px-4">
          所有账户数据通过 JWT 加密令牌保护，刷新令牌有效期 30 天。
        </p>
      </div>
    </div>
  );
}
