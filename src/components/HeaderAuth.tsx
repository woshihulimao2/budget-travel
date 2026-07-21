import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LogIn,
  LogOut,
  User,
  X,
  Mail,
  KeyRound,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { authedFetch, clearTokens, getAccessToken, setTokens } from "../hooks";

type Mode = "login" | "register";

export interface AuthUser {
  id: number;
  email: string;
  createdAt?: string;
}

interface Props {
  user: AuthUser | null;
  onUserChange: (u: AuthUser | null) => void;
  /** 当父组件需要直接打开登录弹窗时，可通过此 prop 控制；否则组件自己管理开关。 */
  openSignal?: number;
  /** H5 端已登录用户点圆形头像时触发，父组件应切到 activeTab = "account" */
  onNavigateToAccount?: () => void;
}

// =============================================================================
// 共享的鉴权状态机（web 端与 H5 端共用）
// =============================================================================
function useAuthState({ openSignal, onUserChange }: Pick<Props, "openSignal" | "onUserChange">) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 父组件可通过 openSignal++ 触发打开弹窗
  useEffect(() => {
    if (typeof openSignal === "number" && openSignal > 0) {
      setOpen(true);
    }
  }, [openSignal]);

  // H5：锁住背景滚动，避免底层跟着拖（仅在 open 时启用）
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "请求失败");
        return;
      }
      setTokens(data.accessToken, data.refreshToken);
      onUserChange(data.user);
      setOpen(false);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err?.message || "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    busy,
    error,
    submit,
  };
}

async function callLogout(onUserChange: (u: AuthUser | null) => void) {
  try {
    const refresh = localStorage.getItem("auth_refresh_token");
    if (refresh) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
    }
  } catch {
    /* ignore */
  } finally {
    clearTokens();
    onUserChange(null);
  }
}

// =============================================================================
// 主组件：顶栏入口 + 顶栏侧弹窗
//   - Web 端 (>= md) 走原版居中卡片、完整胶囊
//   - H5 端 (< md)   走 MobileAuthSheet 从底部弹出
// =============================================================================
export default function HeaderAuth({ user, onUserChange, openSignal, onNavigateToAccount }: Props) {
  // 恢复登录态
  useEffect(() => {
    if (user) return;
    if (!getAccessToken()) return;
    (async () => {
      try {
        const res = await authedFetch("/api/auth/me");
        if (!res.ok) {
          clearTokens();
          return;
        }
        const data = await res.json();
        onUserChange(data.user);
      } catch {
        /* ignore */
      }
    })();
  }, [user, onUserChange]);

  const auth = useAuthState({ openSignal, onUserChange });

  return (
    <div className="relative">
      {/* Web 端顶栏胶囊（>= md 显示） */}
      <WebHeaderSlot
        user={user}
        onClickLogin={() => auth.setOpen(true)}
        onLogout={() => callLogout(onUserChange)}
      />
      {/* H5 端顶栏胶囊（< md 显示）：
          未登录 → 打开登录 sheet；
          已登录 → 圆形头像，父组件负责切到 activeTab = "account"。 */}
      <MobileHeaderSlot
        user={user}
        onClickLogin={() => auth.setOpen(true)}
        onNavigateToAccount={onNavigateToAccount}
        onLogout={() => callLogout(onUserChange)}
      />

      {/* 弹窗：Web / H5 各一套 */}
      {auth.open && (
        <WebAuthModal auth={auth} />
      )}
      {auth.open && (
        <MobileAuthSheet auth={auth} />
      )}
    </div>
  );
}

// =============================================================================
// Web 端组件（>= md 显示）
// =============================================================================
function WebHeaderSlot({
  user,
  onClickLogin,
  onLogout,
}: {
  user: AuthUser | null;
  onClickLogin: () => void;
  onLogout: () => void | Promise<void>;
}) {
  // 这里用 hidden md:flex 让 web 端只在 >= md 屏渲染
  if (user) {
    return (
      <div className="hidden md:flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-full pl-2 pr-3 py-1">
          <User className="h-3.5 w-3.5 text-slate-500" />
          <span className="max-w-[140px] truncate">{user.email}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-full px-3 py-1 bg-white"
          title="登出"
        >
          <LogOut className="h-3.5 w-3.5" />
          登出
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClickLogin}
      className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-full px-3 py-1.5 shadow-sm"
    >
      <LogIn className="h-3.5 w-3.5" />
      登录 / 注册
    </button>
  );
}

function WebAuthModal({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  // 仅在 >= md 屏渲染这个居中卡片；< md 屏用 MobileAuthSheet
  return createPortal(
    <div className="hidden md:flex fixed inset-0 z-[100] items-center justify-center p-4 overflow-y-auto bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
        <button
          type="button"
          onClick={() => auth.setOpen(false)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 z-10"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-base font-extrabold text-slate-900 mb-1">
          {auth.mode === "register" ? "注册账号" : "登录账号"}
        </h2>
        <p className="text-[11px] text-slate-500 mb-4">
          登录后可保存您的 AI 定制行程，换设备也能看到。
        </p>
        <form onSubmit={auth.submit} className="space-y-3">
          <div>
            <label htmlFor="auth-email" className="text-[11px] font-bold text-slate-700 block mb-1">邮箱</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={auth.email}
              onChange={(e) => auth.setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="text-[11px] font-bold text-slate-700 block mb-1">密码（≥ 8 位）</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={auth.mode === "register" ? "new-password" : "current-password"}
              value={auth.password}
              onChange={(e) => auth.setPassword(e.target.value)}
              placeholder="至少 8 位"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          {auth.error && (
            <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {auth.error}
            </div>
          )}
          <button
            type="submit"
            disabled={auth.busy}
            className="w-full py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-700 rounded-lg disabled:opacity-50"
          >
            {auth.busy ? "处理中..." : auth.mode === "register" ? "注册并登录" : "登录"}
          </button>
        </form>
        <div className="mt-4 text-center text-[11px] text-slate-500">
          {auth.mode === "register" ? (
            <>
              已有账号？
              <button
                type="button"
                className="ml-1 underline font-medium text-slate-700"
                onClick={() => auth.setMode("login")}
              >
                去登录
              </button>
            </>
          ) : (
            <>
              还没注册？
              <button
                type="button"
                className="ml-1 underline font-medium text-slate-700"
                onClick={() => auth.setMode("register")}
              >
                立即注册
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// =============================================================================
// H5 端组件（< md 显示）
// =============================================================================
function MobileHeaderSlot({
  user,
  onClickLogin,
  onNavigateToAccount,
  onLogout,
}: {
  user: AuthUser | null;
  onClickLogin: () => void;
  onNavigateToAccount?: () => void;
  onLogout: () => void | Promise<void>;
}) {
  if (user) {
    // H5 已登录：只露圆形头像（不带邮箱文字，节省顶栏横向空间）。
    // 点击 → 通知父组件切到 activeTab = "account" 跳到"账户"页。
    return (
      <button
        type="button"
        onClick={() => onNavigateToAccount?.()}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 text-white text-xs font-extrabold shrink-0 active:bg-slate-700"
        title={user.email}
        aria-label={`账户 ${user.email}，点击查看`}
      >
        {user.email.slice(0, 1).toUpperCase()}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClickLogin}
      className="md:hidden inline-flex items-center gap-1 text-[11px] font-medium text-white bg-slate-900 hover:bg-slate-700 active:bg-slate-800 rounded-full px-2.5 py-1.5 shadow-sm min-h-[32px] shrink-0"
    >
      <LogIn className="h-3.5 w-3.5" />
      登录
    </button>
  );
}

function MobileAuthSheet({ auth }: { auth: ReturnType<typeof useAuthState> }) {
  return createPortal(
    <div
      className="md:hidden fixed inset-0 z-[100] flex items-end bg-slate-900/50 backdrop-blur-sm"
      style={{ minHeight: "100dvh" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) auth.setOpen(false);
      }}
    >
      <div
        className="relative w-full bg-white shadow-2xl border border-slate-200
                   rounded-t-3xl p-5
                   max-h-[92dvh] overflow-y-auto
                   pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        role="dialog"
        aria-modal="true"
      >
        {/* 顶部把手 */}
        <div className="-mt-1 mb-2 flex justify-center">
          <span className="block w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {auth.mode === "register" ? "注册账号" : "登录账号"}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                登录后可保存您的 AI 定制行程，换设备也能看到。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => auth.setOpen(false)}
            className="text-slate-400 hover:text-slate-700 p-1 -mr-1"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={auth.submit} className="space-y-3">
          <div>
            <label htmlFor="m-auth-email" className="text-[11px] font-bold text-slate-700 block mb-1">
              邮箱
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="m-auth-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                // iOS Safari: 字号 < 16px 时会自动放大视图；这里统一 16px 防止抖动
                className="w-full pl-9 pr-3 py-2.5 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50"
                value={auth.email}
                onChange={(e) => auth.setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label htmlFor="m-auth-password" className="text-[11px] font-bold text-slate-700 block mb-1">
              密码（≥ 8 位）
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="m-auth-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={auth.mode === "register" ? "new-password" : "current-password"}
                className="w-full pl-9 pr-3 py-2.5 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50"
                value={auth.password}
                onChange={(e) => auth.setPassword(e.target.value)}
                placeholder="至少 8 位"
              />
            </div>
          </div>
          {auth.error && (
            <div
              role="alert"
              className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
            >
              {auth.error}
            </div>
          )}
          <button
            type="submit"
            disabled={auth.busy}
            className="w-full py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-700 active:bg-slate-800 rounded-lg disabled:opacity-50 min-h-[44px]"
          >
            {auth.busy ? "处理中..." : auth.mode === "register" ? "注册并登录" : "登录"}
          </button>
        </form>
        <div className="mt-4 text-center text-[12px] text-slate-500">
          {auth.mode === "register" ? (
            <>
              已有账号？
              <button
                type="button"
                className="ml-1 underline font-medium text-slate-700"
                onClick={() => auth.setMode("login")}
              >
                去登录
              </button>
            </>
          ) : (
            <>
              还没注册？
              <button
                type="button"
                className="ml-1 underline font-medium text-slate-700"
                onClick={() => auth.setMode("register")}
              >
                立即注册
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

