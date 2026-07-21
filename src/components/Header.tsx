import React from "react";
import { Compass, ShieldAlert, KeyRound, MessageSquare, BookOpen, Map, MapPin, User } from "lucide-react";

export type SourceMode = "domestic" | "overseas";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeCity: string;
  setActiveCity: (city: string) => void;
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  /** 父组件注入的"账户"导航项（一般在 navItems 末尾出现，可附带登录态徽标）。 */
  accountItem?: {
    id: string;
    label: string;
    badge?: "guest" | "logged-in";
  };
  rightSlot?: React.ReactNode;
}

export const CITY_THEMES: Record<string, {
  name: string;
  enName: string;
  accentColor: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  shadowColor: string;
  gradientFrom: string;
  badge: string;
  bgImage: string;
}> = {
  hangzhou: {
    name: "杭州",
    enName: "Hangzhou",
    accentColor: "bg-teal-500",
    accentBg: "bg-teal-50",
    accentText: "text-teal-700",
    accentBorder: "border-teal-100",
    shadowColor: "shadow-teal-200",
    gradientFrom: "from-teal-950/80",
    badge: "茶香西湖",
    bgImage: "/src/assets/images/hangzhou_west_lake_1783387644728.jpg"
  },
  shanghai: {
    name: "上海",
    enName: "Shanghai",
    accentColor: "bg-fuchsia-600",
    accentBg: "bg-fuchsia-50",
    accentText: "text-fuchsia-700",
    accentBorder: "border-fuchsia-100",
    shadowColor: "shadow-fuchsia-200",
    gradientFrom: "from-fuchsia-950/80",
    badge: "魔都繁华",
    bgImage: "/src/assets/images/shanghai_skyline_1783387656895.jpg"
  },
  xian: {
    name: "西安",
    enName: "Xi'an",
    accentColor: "bg-orange-500",
    accentBg: "bg-orange-50",
    accentText: "text-orange-700",
    accentBorder: "border-orange-100",
    shadowColor: "shadow-orange-200",
    gradientFrom: "from-orange-950/80",
    badge: "大唐秦俑",
    bgImage: "/src/assets/images/xian_terracotta_1783387668255.jpg"
  }
};

export default function Header({ activeTab, setActiveTab, activeCity, setActiveCity, sourceMode, setSourceMode, accountItem, rightSlot }: HeaderProps) {
  const theme = CITY_THEMES[activeCity] || CITY_THEMES.hangzhou;

  const baseNavItems = [
    { id: "dashboard", label: "控制面板", icon: Map },
    { id: "itineraries", label: "精选路线", icon: Compass },
    { id: "scams", label: "防坑指南", icon: ShieldAlert },
    { id: "survival", label: "实用工具", icon: KeyRound },
    { id: "phrases", label: "常用口语", icon: BookOpen },
    { id: "chat", label: "AI向导汉斯", icon: MessageSquare },
  ];
  // 桌面端导航项（>= md）：不需要"账户"入口，因为 web 端顶栏胶囊里已经有
  // 登录/登出按钮，再加一个账户 tab 是冗余。
  const desktopNavItems = baseNavItems;
  // 移动端导航项（< md）：在末尾追加父组件注入的"账户"项，让 H5 用户有集中入口。
  const mobileNavItems = accountItem
    ? [...baseNavItems, { id: accountItem.id, label: accountItem.label, icon: User, badge: accountItem.badge }]
    : baseNavItems;

  return (
    <header className={`sticky top-0 z-40 w-full border-b ${theme.accentBorder} bg-white/95 backdrop-blur-md`}>
      <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
        
        {/* Logo and Brand */}
        <div className="flex items-center gap-2.5 shrink-0 cursor-pointer" onClick={() => setActiveTab("dashboard")}>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${theme.accentColor} text-white shadow-md ${theme.shadowColor}`}>
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-gray-900 font-sans">
              全国<span className={`${theme.accentText}`}>独立行</span>
            </span>
            <div className="text-[10px] font-mono text-gray-500 tracking-widest uppercase leading-none">
              外宾防坑生存手册
            </div>
          </div>
        </div>

        {/* City Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {Object.entries(CITY_THEMES).map(([key, config]) => {
            const isSelected = activeCity === key;
            return (
              <button
                key={key}
                onClick={() => setActiveCity(key)}
                className={`flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-bold transition-all duration-300 ${
                  isSelected
                    ? `${config.accentColor} text-white shadow-sm`
                    : "text-gray-600 hover:text-gray-900 hover:bg-slate-200/50"
                }`}
              >
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{config.name}</span>
                <span className="hidden lg:inline text-[9px] opacity-80 font-normal">({config.enName})</span>
              </button>
            );
          })}
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badge = (item as any).badge as "guest" | "logged-in" | undefined;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? `${theme.accentBg} ${theme.accentText} shadow-xs border ${theme.accentBorder}/30`
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? theme.accentText : "text-gray-400"}`} />
                {item.label}
                {badge === "logged-in" && (
                  <span
                    aria-label="已登录"
                    title="已登录"
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
                  />
                )}
                {badge === "guest" && (
                  <span
                    aria-label="未登录"
                    title="未登录"
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Mobile right slot：H5 当前不再显示"当前 tab label"（H5 用底部 sub-bar 高亮就够了），
            把空间完全让给账户入口，避免顶栏拥挤。 */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {rightSlot}
        </div>

        {/* Desktop right slot (e.g. login / user menu) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {rightSlot}
        </div>
      </div>

      {/* Mobile Sticky Sub-Bar */}
      <div className="md:hidden flex items-center justify-around border-t border-gray-100 bg-white py-1.5 px-2">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all ${
                isActive ? `${theme.accentText} scale-105 font-bold` : "text-gray-400"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
