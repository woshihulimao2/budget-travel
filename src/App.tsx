import React, { useState, useEffect, useRef } from "react";
import Header, { CITY_THEMES, SourceMode } from "./components/Header";
import HeaderAuth, { AuthUser } from "./components/HeaderAuth";
import AccountPanel from "./components/AccountPanel";
import ItineraryCard from "./components/ItineraryCard";
import TravelReadinessCheck from "./components/TravelReadinessCheck";
import ScamTab from "./components/ScamTab";
import { PHRASES, SCAM_QUIZ } from "./data";
import { useItineraries, useScams, authedFetch, getAccessToken, clearTokens } from "./hooks";
import { ChatMessage, ScamInfo, CustomItineraryHistoryItem } from "./types";
import { 
  ShieldAlert, Compass, KeyRound, MessageSquare, BookOpen, Map, 
  AlertTriangle, ArrowRight, CheckCircle2, XCircle, 
  Send, RefreshCw, Volume2, Search, Sparkles, MapPin, 
  Settings, User, Landmark, HelpCircle, Loader2,
  History, Trash2, Download, Clock, FileDown, QrCode, CreditCard, Wallet,
  PhoneCall, Plug, Droplets, Banknote, CloudSun, Siren,
  ChevronDown, ChevronUp, Maximize2, Minimize2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ChatMarkdown from "./components/ChatMarkdown";
import SurvivalTab from "./components/SurvivalTab";

// ---------------------------------------------------------------------------
// 控制面板（dashboard）静态数据 —— 面向外国自由行游客最关心的落地信息。
// 纯展示常量，不依赖组件状态，放在组件外避免每次渲染重建。
// ---------------------------------------------------------------------------

type Season = "spring" | "summer" | "autumn" | "winter";

function currentSeason(): Season {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

const SEASON_LABEL: Record<Season, string> = {
  spring: "春季 (3-5月)",
  summer: "夏季 (6-8月)",
  autumn: "秋季 (9-11月)",
  winter: "冬季 (12-2月)",
};

// 每城 × 每季一句「现在来玩要注意什么」——控制面板当季贴士卡用。
const SEASONAL_TIPS: Record<string, Record<Season, string>> = {
  hangzhou: {
    spring: "杭州最美的季节：龙井茶山吐新绿、苏堤桃柳夹岸。早晚温差大，备一件薄外套；清明/五一假期西湖人流巨大，尽量工作日出行。",
    summer: "湿热高温常超 35°C。建议清晨与傍晚游西湖，正午躲进博物馆或茶馆纳凉；随身带水和防晒，午后常有雷阵雨。",
    autumn: "满城桂花飘香，是徒步九溪、灵隐的黄金季节。注意避开国庆黄金周（10月第一周），景区人流是平日的数倍。",
    winter: "阴冷潮湿、室内多无集中供暖，请穿保暖内衣+羽绒服。若遇下雪，「断桥残雪」一年可遇不可求，值得早起。",
  },
  shanghai: {
    spring: "不冷不热的舒适季节，最适合法租界梧桐区 Citywalk。偶有降雨，包里塞一把折叠伞；樱花季（3月底）顾村公园人多。",
    summer: "闷热潮湿，体感常超 38°C。白天安排美术馆/商场等室内行程，傍晚再上外滩看夜景；6-7月是梅雨季，务必带伞。",
    autumn: "全年最佳旅行季：秋高气爽、适合外滩至豫园步行串联。10月国庆周与11月进博会期间酒店涨价明显，提前预订。",
    winter: "湿冷魔法攻击，体感比气温低。室内商场地铁都很暖，采用「洋葱式」穿搭方便穿脱；圣诞/新年外滩灯光很出片。",
  },
  xian: {
    spring: "气候干爽、青龙寺樱花与城墙风筝是特色。风沙偶发，隐形眼镜用户备好眼药水；兵马俑门票提前 2-3 天预约。",
    summer: "干热暴晒，白天可达 40°C。兵马俑展厅内无空调区域闷热，建议一早开馆就进；晚上去大唐不夜城看灯，凉快人也精神。",
    autumn: "最舒服的季节，城墙骑行体验最佳。华山秋色正浓但温差极大，山顶比市区低 10°C 以上，务必带厚外套。",
    winter: "干冷，室内集中供暖很足（进屋记得脱外套）。若遇降雪，城墙和大雁塔雪景是全年最惊艳的画面；羊肉泡馍正当季。",
  },
};

// 紧急求助电话 —— 外国游客最容易在慌乱中找不到的信息，常驻控制面板。
const EMERGENCY_NUMBERS = [
  { number: "110", label: "报警求助", desc: "遇强卖、宰客、威胁时直接拨打，涉外纠纷响应很快" },
  { number: "120", label: "急救中心", desc: "医疗急救，说清所在位置（可让路人代述）" },
  { number: "119", label: "火警", desc: "火灾及被困救援" },
  { number: "96110", label: "反诈专线", desc: "怀疑遇到诈骗时，先打这个电话核实" },
  { number: "12345", label: "市民热线", desc: "投诉商家宰客/服务纠纷，可转英语坐席" },
];

// 落地速查 —— 电压/饮水/小费/汇率这类「到了才发现不知道」的高频问题。
const QUICK_FACTS = [
  { icon: Plug, title: "电压 220V / 50Hz", desc: "插座兼容两脚扁插（Type A）与三脚斜插（Type I），欧标圆脚需转换头，酒店前台一般可借" },
  { icon: Droplets, title: "自来水不可直饮", desc: "请烧开饮用或购买瓶装水（便利店 ¥2 起）；餐厅默认提供热水/茶水而非冰水" },
  { icon: Banknote, title: "无小费文化", desc: "餐厅、出租车、酒店一律不收小费，给了反而可能被婉拒；账单即最终价格" },
  { icon: CreditCard, title: "汇率参考", desc: "US$1 ≈ ¥7.1 / €1 ≈ ¥7.8 / £1 ≈ ¥9.0（以支付宝绑卡实时汇率为准，通常优于机场换汇）" },
];

// 防坑指南列表排序：高危置顶，其余保持原始顺序。
const DANGER_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
function sortByDanger<T extends { dangerLevel: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => (DANGER_RANK[a.dangerLevel] ?? 3) - (DANGER_RANK[b.dangerLevel] ?? 3),
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [activeCity, setActiveCity] = useState<string>("hangzhou");
  // 内站 / 外站 图片源开关（影响汉斯搜索词和图片镜像优先级）
  // 内站：百度/必应CN/搜狗 兜底；后端优先尝试中文维基 + 反代 upload.wikimedia.org
  // 外站：Google/Bing 国际/Commons 兜底；后端优先尝试英文维基 + 不做反代
  const [sourceMode, setSourceMode] = useState<SourceMode>(() => {
    if (typeof window === "undefined") return "domestic";
    try {
      const stored = window.localStorage.getItem("hanz_source_mode");
      return stored === "overseas" ? "overseas" : "domestic";
    } catch {
      return "domestic";
    }
  });

  // 持久化 sourceMode
  useEffect(() => {
    try {
      window.localStorage.setItem("hanz_source_mode", sourceMode);
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [sourceMode]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Scams List Active Item
  const [activeScamId, setActiveScamId] = useState<string>("");

  // Get active city properties
  const theme = CITY_THEMES[activeCity] || CITY_THEMES.hangzhou;

  // Curated content from DB (with static fallback). Declared early so the active-scam effect
  // below can read from it.
  const { data: itinerariesData } = useItineraries(activeCity);
  const { data: scamsData } = useScams(activeCity);

  // Sync active scam ID when active city changes
  useEffect(() => {
    const cityScams = sortByDanger(scamsData.filter((s) => s.city === activeCity));
    if (cityScams.length > 0) {
      setActiveScamId(cityScams[0].id);
    }
  }, [activeCity, scamsData]);

  // Quiz State
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);

  const currentQuizList = SCAM_QUIZ[activeCity as keyof typeof SCAM_QUIZ] || SCAM_QUIZ.hangzhou;

  // Reset quiz when city changes
  useEffect(() => {
    setQuizIndex(0);
    setSelectedOption(null);
    setIsAnswerCorrect(null);
    setQuizScore(0);
    setQuizComplete(false);
  }, [activeCity]);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({
    hangzhou: [
      {
        role: "model",
        content: "你好！我是汉斯（Hanz），您在杭州的本地向导。为独自出行做好准备可能会有些让人头疼，尤其是要搞定移动支付、VPN，或者防范西湖边的茶托骗局。有什么关于杭州旅游的问题，尽管问我吧！",
        timestamp: new Date()
      }
    ],
    shanghai: [
      {
        role: "model",
        content: "Hello! 我是汉斯（Hanz），您在上海的本地AI向导。魔都是一座充满现代魅力与优雅海派气息的都市，但在繁华的南京东路和外滩散步时，一定要警惕那些主动找您练英语合影的“茶托”诈骗。有什么关于上海自由行、机场磁悬浮、外卡绑定的问题，随时问我！",
        timestamp: new Date()
      }
    ],
    xian: [
      {
        role: "model",
        content: "您好！我是汉斯（Hanz），您在西安的本地向导。西安是一座穿越千年的汉唐古都，去看震撼的世界奇迹兵马俑时，千万别坐火车站路边招揽的假冒国营公交车，那会把你拉去山寨假地宫。有什么关于兵马俑预约、城墙骑行、回民街防宰客的问题，尽管提问吧！",
        timestamp: new Date()
      }
    ]
  });

  const [userInput, setUserInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Survival checklist state
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  // Keep the chat pinned to the latest message by scrolling ONLY the chat
  // container (scrollTop), never scrollIntoView — the latter would scroll the
  // whole page/tab. Guarded on the chat tab so switching tabs doesn't jump.
  useEffect(() => {
    if (activeTab !== "chat") return;
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, isChatLoading, activeTab]);

  // AI Itinerary Customizer State
  const [customizeTab, setCustomizeTab] = useState<"curated" | "ai" | "history">("curated");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  // 用于从账户页面触发打开登录弹窗的"信号"（每次 +1 HeaderAuth 内部会 open 一次）
  const [openAuthSignal, setOpenAuthSignal] = useState(0);
  const [itineraryHistory, setItineraryHistory] = useState<CustomItineraryHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Load /api/auth/me on mount to restore session from localStorage tokens
  useEffect(() => {
    if (!getAccessToken()) return;
    (async () => {
      try {
        const res = await authedFetch("/api/auth/me");
        if (!res.ok) {
          clearTokens();
          return;
        }
        const data = await res.json();
        setAuthUser(data.user);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Fetch server-side custom-itinerary history when user logs in
  useEffect(() => {
    if (!authUser) {
      setItineraryHistory([]);
      return;
    }
    (async () => {
      setHistoryLoading(true);
      try {
        // First, migrate any leftover localStorage history into the server (one-shot)
        await migrateLocalHistoryToServer();
        const res = await authedFetch("/api/custom-itineraries");
        if (res.ok) {
          const data = await res.json();
          const items: CustomItineraryHistoryItem[] = (data.items || []).map((it: any) => ({
            id: it.id,
            timestamp: it.timestamp,
            cities: it.cities || [],
            duration: it.duration || "",
            budget: it.budget || "",
            interests: it.interests || [],
            result: {
              summary: it.result?.summary || "",
              checklist: it.result?.checklist || [],
              customItinerary: it.result?.customItinerary || [],
            },
          }));
          setItineraryHistory(items);
          if (items.length > 0 && !selectedHistoryId) {
            setSelectedHistoryId(items[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setHistoryLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const migrateLocalHistoryToServer = async () => {
    // Older builds stored history in localStorage; for now we just clear it so the user sees
    // only their fresh server-side history. A future endpoint will allow direct re-insertion
    // of local-only rows without re-running the AI model.
    try {
      const raw = localStorage.getItem("custom_itinerary_history");
      if (!raw) return;
      const items: any[] = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) {
        localStorage.removeItem("custom_itinerary_history");
        return;
      }
      console.info(
        `[migrateLocalHistoryToServer] found ${items.length} localStorage item(s); clearing.`
      );
      localStorage.removeItem("custom_itinerary_history");
    } catch {
      /* ignore */
    }
  };

  // Payment states for Paid Markdown Downloads
  const [payConfig, setPayConfig] = useState({
    alipayAccount: "alipay-merchant@example.com",
    alipayQrUrl: "",
    wechatMerchantId: "wx_merchant_100234",
    wechatQrUrl: "",
    paypalClientId: "paypal_sandbox_client_id_abc123",
    priceCny: "9.9",
    priceUsd: "1.5",
    vipCode: "VIP888"
  });

  const [transactions, setTransactions] = useState<any[]>([]);
  const [payerEmail, setPayerEmail] = useState("woshihulimao@gmail.com");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [itineraryToCheckout, setItineraryToCheckout] = useState<CustomItineraryHistoryItem | null>(null);
  const [checkoutMethod, setCheckoutMethod] = useState<"Alipay" | "WeChat" | "PayPal" | "VIP">("Alipay");
  
  const [vipInput, setVipInput] = useState("");
  const [alipayPayerInput, setAlipayPayerInput] = useState("woshihulimao@gmail.com");
  const [wechatPayerInput, setWechatPayerInput] = useState("woshihulimao@gmail.com");
  const [paypalPayerInput, setPaypalPayerInput] = useState("woshihulimao@gmail.com");
  
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState(false);
  
  // Real simulated PayPal popups
  const [isPaypalPopupOpen, setIsPaypalPopupOpen] = useState(false);
  const [paypalEmailInput, setPaypalEmailInput] = useState("guest_payer@example.com");
  const [paypalPasswordInput, setPaypalPasswordInput] = useState("");

  // Load configuration and transaction logs from backend.
  // The public /api/payment-config only returns checkout-safe fields (no VIP
  // code / merchant accounts), so we MERGE it into state rather than replace,
  // keeping any admin-only fields already loaded via loadAdminConfig().
  const fetchPaymentData = async () => {
    try {
      const configRes = await fetch("/api/payment-config");
      const configData = await configRes.json();
      if (configData && !configData.error) {
        setPayConfig((prev) => ({ ...prev, ...configData }));
      }

      const txRes = await fetch("/api/payment-transactions");
      const txData = await txRes.json();
      if (txData && Array.isArray(txData)) {
        setTransactions(txData);
      }
    } catch (err) {
      console.error("Failed to load payment info from server:", err);
    }
  };

  // Full config incl. VIP code + merchant accounts — admin only. Called when
  // the 收款配置 modal opens; requires the current user to be an admin.
  const loadAdminConfig = async () => {
    try {
      const res = await authedFetch("/api/admin/payment-config");
      if (res.status === 401 || res.status === 403) {
        setImportMessage("⚠️ 需要管理员权限才能读取完整收款配置（请用管理员账号登录）。");
        return;
      }
      const data = await res.json();
      if (data && !data.error) {
        setPayConfig((prev) => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error("Failed to load admin pay config:", e);
    }
  };

  useEffect(() => {
    fetchPaymentData();
  }, []);

  const handleUpdatePayConfig = async (newConfig: typeof payConfig) => {
    try {
      const res = await authedFetch("/api/payment-config", {
        method: "POST",
        body: JSON.stringify(newConfig)
      });
      if (res.status === 401 || res.status === 403) {
        console.warn("Update pay config denied: admin required.");
        return false;
      }
      const data = await res.json();
      if (data.success) {
        setPayConfig((prev) => ({ ...prev, ...data.config }));
        fetchPaymentData();
        return true;
      }
    } catch (e) {
      console.error("Failed to update pay config:", e);
    }
    return false;
  };

  const checkIsUnlocked = (itineraryId: string) => {
    if (!itineraryId) return false;
    return transactions.some(tx => 
      tx.itineraryId === itineraryId && 
      tx.payerAccount.toLowerCase().trim() === payerEmail.toLowerCase().trim()
    );
  };

  const [customDays, setCustomDays] = useState("3天");
  const [customCities, setCustomCities] = useState<string[]>(["hangzhou"]);
  const [customBudget, setCustomBudget] = useState("moderate");
  const [customInterests, setCustomInterests] = useState<string[]>(["历史古迹", "特色美食"]);
  const [customResult, setCustomResult] = useState<any>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customError, setCustomError] = useState("");

  // Admin import state
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  // Sync cities when page-wide activeCity changes
  useEffect(() => {
    if (customDays === "1天") {
      setCustomCities([activeCity]);
    } else if (customDays === "3天") {
      if (activeCity === "hangzhou") {
        setCustomCities(["hangzhou", "shanghai"]);
      } else if (activeCity === "shanghai") {
        setCustomCities(["shanghai", "hangzhou"]);
      } else {
        setCustomCities(["xian", "hangzhou"]);
      }
    } else {
      setCustomCities(["hangzhou", "shanghai", "xian"]);
    }
  }, [activeCity]);

  const handleSelectDays = (days: string) => {
    setCustomDays(days);
    if (days === "1天") {
      setCustomCities([activeCity]);
    } else if (days === "3天") {
      if (activeCity === "hangzhou") {
        setCustomCities(["hangzhou", "shanghai"]);
      } else if (activeCity === "shanghai") {
        setCustomCities(["shanghai", "hangzhou"]);
      } else {
        setCustomCities(["xian", "hangzhou"]);
      }
    } else {
      setCustomCities(["hangzhou", "shanghai", "xian"]);
    }
  };

  const handleToggleCity = (cityKey: string) => {
    if (customCities.includes(cityKey)) {
      if (customCities.length > 1) {
        setCustomCities(prev => prev.filter(c => c !== cityKey));
      }
    } else {
      setCustomCities(prev => [...prev, cityKey]);
    }
  };

  const handleToggleInterest = (interest: string) => {
    if (customInterests.includes(interest)) {
      setCustomInterests(prev => prev.filter(i => i !== interest));
    } else {
      setCustomInterests(prev => [...prev, interest]);
    }
  };

  const handleGenerateCustomItinerary = async () => {
    if (!authUser) {
      setCustomError("生成定制行程前请先登录 / 注册账号（右上角），历史会自动保存到云端。");
      return;
    }
    setIsCustomizing(true);
    setCustomError("");
    setCustomResult(null);

    try {
      const response = await authedFetch("/api/customize", {
        method: "POST",
        body: JSON.stringify({
          city: activeCity,
          cities: customCities,
          duration: customDays,
          budget: customBudget,
          interests: customInterests,
        }),
      });

      if (response.status === 401) {
        setCustomError("登录已过期，请重新登录后再试。");
        setAuthUser(null);
        clearTokens();
        return;
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: "AI Customizer Server Error" }));
        throw new Error(errBody.error || "AI Customizer Server Error");
      }

      const data = await response.json();
      // Strip server-side _meta before passing to UI components that expect the old shape.
      const { _meta, ...resultOnly } = data;
      setCustomResult(resultOnly);

      // Persist to server: prepend to local history list
      try {
        const newHistoryItem: CustomItineraryHistoryItem = {
          id: data.id || data._meta?.id || Date.now().toString(),
          timestamp: new Date(data._meta?.createdAt || Date.now()).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          cities: [...customCities],
          duration: customDays,
          budget: customBudget,
          interests: [...customInterests],
          result: resultOnly,
        };
        setItineraryHistory((prev) => [newHistoryItem, ...prev]);
        setSelectedHistoryId(newHistoryItem.id);
      } catch (historyErr) {
        console.error("Failed to update local history state:", historyErr);
      }
    } catch (err: any) {
      console.error(err);
      setCustomError(
        err?.message ||
          "抱歉，大模型行程定制目前排队人数较多。请稍后重试，或直接点击左侧切换查看我们的“精选路线”！"
      );
    } finally {
      setIsCustomizing(false);
    }
  };

  const executeActualDownload = (item: CustomItineraryHistoryItem) => {
    const citiesStr = item.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ");
    const budgetStr = item.budget === "budget" ? "高性价比" : item.budget === "moderate" ? "舒适型" : "奢华版";
    
    let md = `# 专属定制行程：${citiesStr} ${item.duration} ${budgetStr}之旅\n\n`;
    md += `> **生成时间**: ${item.timestamp}\n`;
    md += `> **游玩天数**: ${item.duration}\n`;
    md += `> **预算级别**: ${budgetStr}\n`;
    md += `> **兴趣偏好**: ${item.interests.join("、")}\n\n`;
    
    md += `## 💡 AI 专家评估报告\n\n${item.result.summary}\n\n`;
    
    if (item.result.checklist && item.result.checklist.length > 0) {
      md += `## 📋 出行必备准备清单\n\n`;
      item.result.checklist.forEach((check: string) => {
        md += `- [ ] ${check}\n`;
      });
      md += `\n`;
    }
    
    md += `## 🗓️ 详细行程安排\n\n`;
    item.result.customItinerary.forEach((dayItem: any) => {
      const cityHeader = dayItem.city ? ` (${dayItem.city})` : "";
      md += `### 🌟 ${dayItem.day}${cityHeader}\n\n`;
      
      if (dayItem.activities && dayItem.activities.length > 0) {
        dayItem.activities.forEach((act: any, idx: number) => {
          md += `#### ${idx + 1}. ${act.title}\n`;
          md += `- **时间段**: ${act.time}\n animate-pulse`;
          md += `- **预估花费**: ${act.cost}\n`;
          md += `- **详情**: ${act.description}\n`;
          if (act.scamWarning && act.scamWarning !== "无" && !act.scamWarning.includes("建议使用正规官方服务")) {
            md += `- **⚠️ 防坑避雷红警**: ${act.scamWarning}\n`;
          }
          md += `\n`;
        });
      }
    });
    
    md += `\n---\n*本行程由中国独立行防坑排雷助手量身定制，祝您旅途平安愉快！*\n`;
    
    // Create download link
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Itinerary_${citiesStr.replace(/\s+/g, "")}_${item.duration}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMarkdown = (item: CustomItineraryHistoryItem) => {
    setItineraryToCheckout(item);
    setCheckoutMethod("Alipay");
    setPayError("");
    setPaySuccess(false);
    setVipInput("");
    setAlipayPayerInput(payerEmail);
    setWechatPayerInput(payerEmail);
    setPaypalPayerInput(payerEmail);
    setIsCheckoutModalOpen(true);
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening details
    setItineraryHistory((prev) => prev.filter((item) => item.id !== id));
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
    }
    try {
      await authedFetch(`/api/custom-itineraries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete history on server:", err);
    }
  };

  const handleAdminImport = async (kind: "json" | "md" | "seed") => {
    setImportBusy(true);
    setImportMessage("处理中...");
    try {
      if (kind === "json") {
        // The /api/admin/import-scenarios endpoint takes an items[] body; the CLI handles file
        // resolution. For the in-app admin button we use a tiny helper endpoint that reads
        // the preset scenarios.json from disk.
        const res = await authedFetch("/api/admin/import-scenarios-preset", { method: "POST" });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setImportMessage(
          `✅ scenarios.json 导入完成：新增 ${data.inserted ?? 0}，更新 ${data.updated ?? 0}（共 ${data.total ?? 0}）`
        );
      } else if (kind === "md") {
        const res = await authedFetch("/api/admin/import-scenarios-md", {
          method: "POST",
          body: JSON.stringify({ presetPath: true }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setImportMessage(
          `✅ md 解析导入完成：城市=${data.city ?? "?"}，新增 ${data.inserted ?? 0}，更新 ${data.updated ?? 0}（共 ${data.total ?? 0}）`
        );
      } else {
        const res = await authedFetch("/api/admin/seed-from-code", { method: "POST" });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setImportMessage(
          `✅ 重新 seed 完成：itineraries=${data.itineraries ?? 0}，scams=${data.scams ?? 0}`
        );
      }
    } catch (err: any) {
      setImportMessage(`❌ 失败：${err?.message || err}`);
    } finally {
      setImportBusy(false);
    }
  };

  const handleVerifyPayment = async (e?: React.FormEvent, customMethod?: "Alipay" | "WeChat" | "PayPal" | "VIP", customPayer?: string, customDetails?: string) => {
    if (e) e.preventDefault();
    if (!itineraryToCheckout) return;

    setPayError("");
    setIsPaying(true);

    const activeMethod = customMethod || checkoutMethod;
    let payerAccount = "";
    let details = customDetails || "";
    let amount = "";

    if (activeMethod === "Alipay") {
      payerAccount = customPayer || alipayPayerInput.trim();
      if (!payerAccount) {
        setPayError("请填写您的付款支付宝账号（邮箱/手机），以便生成您的专属付费下载订单！");
        setIsPaying(false);
        return;
      }
      amount = `¥${payConfig.priceCny}`;
    } else if (activeMethod === "WeChat") {
      payerAccount = customPayer || wechatPayerInput.trim();
      if (!payerAccount) {
        setPayError("请填写您的付款微信账号，以便后台对账并解锁您的专属下载通道！");
        setIsPaying(false);
        return;
      }
      amount = `¥${payConfig.priceCny}`;
    } else if (activeMethod === "VIP") {
      payerAccount = payerEmail;
      details = customDetails || vipInput.trim();
      if (!details) {
        setPayError("请输入 VIP 免费兑换校验码！");
        setIsPaying(false);
        return;
      }
      amount = "VIP免费";
    } else if (activeMethod === "PayPal") {
      payerAccount = customPayer || paypalPayerInput.trim();
      if (!payerAccount) {
        setPayError("请输入您的 PayPal 支付邮箱！");
        setIsPaying(false);
        return;
      }
      amount = `$${payConfig.priceUsd}`;
    }

    try {
      // Simulate network verification
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const res = await authedFetch("/api/verify-payment", {
        method: "POST",
        body: JSON.stringify({
          itineraryId: itineraryToCheckout.id,
          itineraryTitle: `${itineraryToCheckout.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ")} ${itineraryToCheckout.duration} 定制之旅`,
          payerAccount,
          paymentMethod: activeMethod,
          paymentDetails: details,
          amount
        })
      });

      const data = await res.json();
      if (data.error) {
        setPayError(data.error);
        setIsPaying(false);
        return;
      }

      // Succeeded!
      setPaySuccess(true);
      setIsPaying(false);
      
      // Update the active session payer email to this paid email so they can unlock immediately!
      setPayerEmail(payerAccount);

      // Refresh list from server
      await fetchPaymentData();

      // Trigger actual download!
      executeActualDownload(itineraryToCheckout);

      setTimeout(() => {
        setIsCheckoutModalOpen(false);
        setPaySuccess(false);
      }, 2000);

    } catch (err: any) {
      console.error("Payment verification error:", err);
      setPayError("网络对账验证超时。请确认已完成扫码支付并稍后重试！");
      setIsPaying(false);
    }
  };

  // Handle Chat message submission
  // (Updated 2026-07: /api/chat now requires login + rate-limit + input
  // guard. We use authedFetch so the JWT is sent automatically. If the
  // request returns 401 we surface a soft sign-in prompt instead of a
  // generic "network error".)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: userInput,
      timestamp: new Date()
    };

    const currentCityMessages = chatMessages[activeCity] || [];
    setChatMessages(prev => ({
      ...prev,
      [activeCity]: [...currentCityMessages, userMsg]
    }));

    const originalInput = userInput;
    setUserInput("");
    setIsChatLoading(true);

    // 0. local sanity clamp — the server enforces its own limit but checking
    //    client-side avoids an obvious round-trip for huge inputs.
    if (originalInput.length > 1000) {
      setChatMessages(prev => ({
        ...prev,
        [activeCity]: [
          ...(prev[activeCity] || []),
          {
            role: "model",
            content: "消息有点长，我怕误解你的意思，麻烦精简到 1000 字以内再发一次～",
            timestamp: new Date()
          }
        ]
      }));
      setIsChatLoading(false);
      return;
    }

    try {
      const response = await authedFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: `[当前关注城市: ${activeCity}] ${originalInput}`,
          sourceMode,
          // Limit history to last 10 messages for speed & reliability
          history: currentCityMessages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      });

      // 401 = not signed in (or token expired and refresh failed).
      if (response.status === 401) {
        setChatMessages(prev => ({
          ...prev,
          [activeCity]: [
            ...(prev[activeCity] || []),
            {
              role: "model",
              content: "请先登录后再向汉斯提问～ 点击右上角「登录」按钮即可（这是为了防止滥用、保护大家的服务质量）。",
              timestamp: new Date()
            }
          ]
        }));
        return;
      }

      // 429 = rate limited
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        const message =
          (data && data.reply) ||
          "请求太频繁啦，先让我喘口气，请稍后再试～";
        setChatMessages(prev => ({
          ...prev,
          [activeCity]: [
            ...(prev[activeCity] || []),
            {
              role: "model",
              content: message,
              timestamp: new Date()
            }
          ]
        }));
        return;
      }

      if (!response.ok) {
        throw new Error("Local API server error");
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        role: "model",
        content: data.reply || "我正在为您检索本地出行秘籍。请重新发送您的问题，或者向我询问特定的必备配置和防坑建议。",
        timestamp: new Date()
      };

      setChatMessages(prev => ({
        ...prev,
        [activeCity]: [...(prev[activeCity] || []), assistantMsg]
      }));
    } catch (err) {
      setChatMessages(prev => ({
        ...prev,
        [activeCity]: [
          ...(prev[activeCity] || []),
          {
            role: "model",
            content: "抱歉，我目前与服务器之间的网络连接有点小问题。在这期间，您可以先查看我们的「防坑指南」和「必备配置」菜单，快速掌握最核心的出行整备与防坑要领！",
            timestamp: new Date()
          }
        ]
      }));
    } finally {
      setIsChatLoading(false);
    }
  };

  const toggleStep = (key: string) => {
    setCompletedSteps(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleQuizAnswer = (optionIdx: number) => {
    if (selectedOption !== null) return; // Prevent double answer
    setSelectedOption(optionIdx);
    const correct = optionIdx === currentQuizList[quizIndex].answer;
    setIsAnswerCorrect(correct);
    if (correct) {
      setQuizScore(prev => prev + 1);
    }
  };

  const nextQuizQuestion = () => {
    setSelectedOption(null);
    setIsAnswerCorrect(null);
    if (quizIndex < currentQuizList.length - 1) {
      setQuizIndex(prev => prev + 1);
    } else {
      setQuizComplete(true);
    }
  };

  const resetQuiz = () => {
    setQuizIndex(0);
    setSelectedOption(null);
    setIsAnswerCorrect(null);
    setQuizScore(0);
    setQuizComplete(false);
  };

  // Speech synthesis simulation
  const [playingPhrase, setPlayingPhrase] = useState<string | null>(null);
  const speakPhrase = (text: string, pinyin: string) => {
    setPlayingPhrase(pinyin);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.85;
      utterance.onend = () => setPlayingPhrase(null);
      utterance.onerror = () => setPlayingPhrase(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPlayingPhrase(null), 1500);
    }
  };

  // Filter Phrases based on query
  const filteredPhrases = PHRASES.filter(p => 
    p.english.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.pinyin.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.chinese.includes(searchQuery) ||
    p.purpose.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter Scams based on active city (DB-first via useScams hook)
  const cityScams = scamsData;

  // ------- 控制面板数据切片（都是轻量计算，直接在渲染前算） -------
  const season = currentSeason();
  const seasonalTip = (SEASONAL_TIPS[activeCity] || SEASONAL_TIPS.hangzhou)[season];
  const topDangerScams = sortByDanger(cityScams.filter((s) => s.dangerLevel === "High")).slice(0, 3);
  const highDangerCount = cityScams.filter((s) => s.dangerLevel === "High").length;
  // 三句最能救急的防坑中文，控制面板直接可跟读
  const rescuePhrases = PHRASES.filter((p) =>
    ["不喝茶，谢谢！", "请打表，谢谢。", "可以刷外国卡吗？"].includes(p.chinese),
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-slate-200 selection:text-slate-950">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCity={activeCity}
        setActiveCity={setActiveCity}
        sourceMode={sourceMode}
        setSourceMode={setSourceMode}
        accountItem={{
          id: "account",
          label: "账户",
          badge: authUser ? "logged-in" : "guest",
        }}
        rightSlot={
          <HeaderAuth
            user={authUser}
            onUserChange={setAuthUser}
            openSignal={openAuthSignal}
            onNavigateToAccount={() => setActiveTab("account")}
          />
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Banner Hero applying "Geometric Balance" layout with Localized Theme styling */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-slate-200 border border-slate-200 rounded-3xl overflow-hidden mb-8 shadow-md">
            {/* Left Hero Block with gorgeous background image and gradient overlay */}
            <div className="relative lg:col-span-5 bg-slate-950 text-white p-8 md:p-10 flex flex-col justify-between overflow-hidden group">
              {/* Background Image Layer */}
              <div className="absolute inset-0 z-0">
                <img 
                  src={theme.bgImage} 
                  alt={theme.name} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-75 scale-100 group-hover:scale-105 transition-all duration-700 filter saturate-150 brightness-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-slate-950/20" />
              </div>

              {/* Foreground Content */}
              <div className="relative z-10">
                <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-xs text-white text-[10px] font-mono font-extrabold px-3 py-1 rounded-md uppercase tracking-wider mb-6 border border-white/15">
                  <Sparkles className={`h-3.5 w-3.5 ${theme.accentText} animate-pulse`} /> 
                  <span>{theme.badge} • 2026年最新版</span>
                </div>
                <h1 className="text-3.5xl md:text-4.5xl font-extrabold tracking-tight leading-[1.15] mb-6 text-white">
                  {activeCity === "hangzhou" && <>无忧畅游 <br />魅力杭州 <br /></>}
                  {activeCity === "shanghai" && <>无忧畅游 <br />魔都上海 <br /></>}
                  {activeCity === "xian" && <>无忧畅游 <br />古都西安 <br /></>}
                  <span className={`${theme.accentText} underline decoration-white/25 underline-offset-8`}>
                    拒绝套路。
                  </span>
                </h1>
                <p className="text-slate-200 text-sm leading-relaxed mb-8 font-medium">
                  {activeCity === "hangzhou" && "为独立旅行者量身打造的生存宝典，无套路轻松游览西湖、古典私家园林与硬核科技茶乡。"}
                  {activeCity === "shanghai" && "为独立旅行者量身打造的生存宝典，无套路轻松穿梭在外滩万国建筑博览群、前法租界老洋房与摩天高空之间。"}
                  {activeCity === "xian" && "为独立旅行者量身打造的生存宝典，无套路轻松探索世界第八大奇迹、千年城墙骑行与关中美食。"}
                </p>
              </div>

              {/* Status indicators */}
              <div className="relative z-10 space-y-3.5 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3.5 p-3.5 bg-white/5 backdrop-blur-3xs rounded-xl border border-white/5 hover:border-white/10 hover:bg-white/10 transition-colors">
                  <div className={`w-9 h-9 ${theme.accentBg} rounded-lg flex items-center justify-center ${theme.accentText} shrink-0`}>
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">实时防坑雷达 ({theme.name})</div>
                    <div className="text-[11px] text-slate-300">拆解和揭秘本地景区高发的诱导和欺诈套路。</div>
                  </div>
                </div>
                <div className="flex items-center gap-3.5 p-3.5 bg-white/5 backdrop-blur-3xs rounded-xl border border-white/5 hover:border-white/10 hover:bg-white/10 transition-colors">
                  <div className={`w-9 h-9 ${theme.accentBg} rounded-lg flex items-center justify-center ${theme.accentText} shrink-0`}>
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">数字化生存与跨城通用平台</div>
                    <div className="text-[11px] text-slate-300">5分钟学会配置外包支付宝、免封锁eSIM与高精导航。</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Bento Grid */}
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200">
              {/* Box 1: Avoiding Traps */}
              <div 
                onClick={() => setActiveTab("scams")}
                className="bg-slate-900 text-white p-8 flex flex-col justify-between group cursor-pointer hover:bg-slate-950 transition-colors"
              >
                <div className="text-rose-400 font-mono text-xs font-bold tracking-widest uppercase">01 — 典型套路 ({theme.name})</div>
                <div>
                  <h2 className="text-xl font-bold mb-2 group-hover:text-rose-300 transition-colors">
                    {activeCity === "hangzhou" && "看穿西湖“茶托”骗局"}
                    {activeCity === "shanghai" && "警惕南京东路“茶托”敲诈"}
                    {activeCity === "xian" && "识破兵马俑“假公交大巴”"}
                  </h2>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {activeCity === "hangzhou" && "如何一眼识破主动搭讪的“友好大学生”，避免数千元天价茶单。"}
                    {activeCity === "shanghai" && "流利英语、面容和善的陌生同伴，背后的隐秘地下茶酒套路揭秘。"}
                    {activeCity === "xian" && "穿着制服的揽客队伍，如何把你运去没有兵马俑的山寨泥塑景点。"}
                  </p>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-xl group-hover:translate-x-1.5 transition-transform">→</span>
                </div>
              </div>

              {/* Box 2: Visual Inspiration */}
              <div 
                onClick={() => {
                  setActiveTab("itineraries");
                  setCustomizeTab("curated");
                }}
                className={`${theme.accentColor} text-white p-8 flex flex-col justify-between relative overflow-hidden group cursor-pointer`}
              >
                <div className={`absolute inset-0 bg-gradient-to-t ${theme.gradientFrom} to-transparent z-10`} />
                <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10" />
                <div className="absolute left-4 top-4 z-20 text-[10px] font-mono font-bold tracking-widest uppercase text-white/80 bg-black/20 px-2 py-0.5 rounded">
                  02 — 精选路线 ({theme.name})
                </div>
                
                <div className="z-20 mt-16">
                  <h3 className="text-xl font-extrabold mb-1">
                    {activeCity === "hangzhou" && "3日古典与深度沉浸游"}
                    {activeCity === "shanghai" && "3日优雅梧桐与艺术之旅"}
                    {activeCity === "xian" && "3日汉唐盛世历史探秘游"}
                  </h3>
                  <p className="text-[11px] text-white/80">
                    {activeCity === "hangzhou" && "西湖游船、郭庄古典园林与龙井茶山自然徒步。"}
                    {activeCity === "shanghai" && "法租界洋房Citywalk、外滩夜景与顶级美术馆。"}
                    {activeCity === "xian" && "陕西历史博物馆国宝、城墙骑行与大唐不夜城亮灯。"}
                  </p>
                </div>
                <div className="flex justify-end z-20">
                  <span className="text-lg text-white/80 group-hover:translate-x-1.5 transition-transform">→</span>
                </div>
              </div>

              {/* Box 3: Survival Tips */}
              <div 
                onClick={() => setActiveTab("survival")}
                className="bg-white p-8 flex flex-col justify-between group cursor-pointer hover:bg-slate-50/50 transition-all"
              >
                <div className={`font-mono text-xs font-bold tracking-widest uppercase ${theme.accentText}`}>03 — 跨城通用平台</div>
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-900">数字化生存红宝书</h2>
                  <ul className="text-xs text-slate-600 space-y-2">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className={`h-3.5 w-3.5 ${theme.accentText} shrink-0`} />
                      <span>支付宝外卡绑定步骤</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className={`h-3.5 w-3.5 ${theme.accentText} shrink-0`} />
                      <span>高精度苹果地图替代指南</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className={`h-3.5 w-3.5 ${theme.accentText} shrink-0`} />
                      <span>免屏蔽漫游eSIM配置</span>
                    </li>
                  </ul>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <span className={`text-xs font-bold uppercase tracking-wider group-hover:underline ${theme.accentText}`}>配置通用配置</span>
                  <ArrowRight className={`h-4 w-4 ${theme.accentText} group-hover:translate-x-1 transition-transform`} />
                </div>
              </div>

              {/* Box 4: Custom Recommendation Entry Point */}
              <div 
                onClick={() => {
                  setActiveTab("itineraries");
                  setCustomizeTab("ai");
                }}
                className="bg-slate-50 p-8 flex flex-col justify-between group cursor-pointer hover:bg-slate-100/50 transition-all border-l border-slate-200/50"
              >
                <div className="text-indigo-600 font-mono text-xs font-bold tracking-widest uppercase flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  <span>04 — AI 专属即时定制</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-indigo-950 mb-1">量身定制内容推荐</h2>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    输入您计划逗留的天数、出行预算以及偏好兴趣，一键调取大模型算力，为您专属避雷和规划。
                  </p>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <span className="text-indigo-700 text-xs font-bold uppercase tracking-wider">立即AI一键定制</span>
                  <div className="h-9 w-9 bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-800 group-hover:scale-110 transition-transform">
                    <Sparkles className="h-4.5 w-4.5 text-indigo-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Tab Contents */}
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
              data-testid="dashboard-overview"
            >
              {/* Row 1 — 快捷入口：一眼看到整备进度和四大板块 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("survival")}
                  className="bg-white border border-slate-200 rounded-3xl p-5 text-left shadow-xs hover:border-slate-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 ${theme.accentBg} ${theme.accentText} rounded-xl flex items-center justify-center`}>
                      <KeyRound className="h-4.5 w-4.5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900">旅行整备度</h3>
                  <div className="mt-2">
                    <TravelReadinessCheck
                      completedSteps={completedSteps}
                      onToggle={toggleStep}
                      compact
                      theme={{
                        accentBg: theme.accentBg,
                        accentText: theme.accentText,
                        accentColor: theme.accentColor,
                      }}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("scams")}
                  className="bg-white border border-slate-200 rounded-3xl p-5 text-left shadow-xs hover:border-slate-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                      <ShieldAlert className="h-4.5 w-4.5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900">防坑指南</h3>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {theme.name}共收录 <strong className="text-rose-600">{cityScams.length}</strong> 条套路，其中{" "}
                    <strong className="text-rose-600">{highDangerCount}</strong> 条高危
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("phrases")}
                  className="bg-white border border-slate-200 rounded-3xl p-5 text-left shadow-xs hover:border-slate-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <Volume2 className="h-4.5 w-4.5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900">应急口语</h3>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {PHRASES.length} 句救命中文，全部可点击跟读真人发音
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className="bg-white border border-slate-200 rounded-3xl p-5 text-left shadow-xs hover:border-slate-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                      <MessageSquare className="h-4.5 w-4.5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900">问向导汉斯</h3>
                  <p className="text-[11px] text-slate-500 mt-2">
                    AI 本地向导 24 小时在线，行程、防坑、换乘随便问
                  </p>
                </button>
              </div>

              {/* Row 2 — 紧急电话 / 落地速查 / 当季贴士：外国游客落地最高频的三类信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 紧急求助卡：深色高对比，慌乱时也能一眼找到 */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-lg flex items-center justify-center">
                      <Siren className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold">紧急求助电话</h3>
                      <p className="text-[10px] text-slate-400 font-mono">全国通用 · 免费拨打 · 无需 SIM 卡余额</p>
                    </div>
                  </div>
                  <ul className="space-y-2.5">
                    {EMERGENCY_NUMBERS.map((e) => (
                      <li key={e.number} className="flex items-start gap-3">
                        <span className="font-mono font-extrabold text-base text-rose-300 w-14 shrink-0 tracking-wider">
                          {e.number}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block">{e.label}</span>
                          <span className="text-[10px] text-slate-400 leading-snug block">{e.desc}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
                    <span>建议现在就把 110 和酒店地址（中文）存进手机备忘录，紧急时直接出示。</span>
                  </div>
                </div>

                {/* 落地速查：电压 / 饮水 / 小费 / 汇率 */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                      <Plug className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">落地速查</h3>
                      <p className="text-[10px] text-slate-400 font-mono">到了才想起来查的高频问题</p>
                    </div>
                  </div>
                  <ul className="space-y-3.5">
                    {QUICK_FACTS.map((f) => (
                      <li key={f.title} className="flex items-start gap-2.5">
                        <f.icon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{f.title}</span>
                          <span className="text-[10px] text-slate-500 leading-snug block mt-0.5">{f.desc}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 当季出行贴士：跟随所选城市与真实日期 */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-8 h-8 ${theme.accentBg} ${theme.accentText} rounded-lg flex items-center justify-center`}>
                      <CloudSun className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">当季出行贴士 · {theme.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono">{SEASON_LABEL[season]}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed flex-1">{seasonalTip}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("itineraries");
                      setCustomizeTab("ai");
                    }}
                    className={`mt-4 self-start text-[11px] font-bold ${theme.accentText} inline-flex items-center gap-1 hover:underline`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    让 AI 按当季情况定制行程
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Row 3 — 本城高危套路 TOP + 救命三句 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 高危套路速览：点击直达防坑指南对应详情 */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="h-4.5 w-4.5" />
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900">{theme.name}高危套路 TOP {topDangerScams.length}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("scams")}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
                    >
                      全部 {cityScams.length} 条
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {topDangerScams.map((scam, idx) => (
                      <button
                        key={scam.id}
                        type="button"
                        onClick={() => {
                          setActiveScamId(scam.id);
                          setActiveTab("scams");
                        }}
                        className="w-full flex items-start gap-3 text-left p-3 rounded-2xl border border-slate-100 hover:border-rose-200 hover:bg-rose-50/30 transition-all group"
                      >
                        <span className="h-6 w-6 rounded-full bg-rose-50 text-rose-600 font-mono font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 group-hover:text-rose-900 leading-snug">
                              {scam.title}
                            </h4>
                            {scam.dangerLevel === "High" && (
                              <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded shrink-0">
                                高危
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-snug">
                            {scam.scenario}
                          </p>
                        </div>
                      </button>
                    ))}
                    {topDangerScams.length === 0 && (
                      <div className="text-center text-xs text-slate-400 py-6">该城市暂无套路记录。</div>
                    )}
                  </div>
                </div>

                {/* 救命三句：控制面板直接可跟读，不必先进口语页 */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <BookOpen className="h-4.5 w-4.5" />
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900">救命三句 · 先背下来</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("phrases")}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
                    >
                      全部口语
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-2.5 flex-1">
                    {rescuePhrases.map((phrase) => {
                      const isPlaying = playingPhrase === phrase.pinyin;
                      return (
                        <div
                          key={phrase.pinyin}
                          className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-extrabold text-slate-950">
                              {phrase.chinese}
                              <span className={`ml-2 text-[11px] ${theme.accentText} font-mono font-medium`}>
                                {phrase.pinyin}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{phrase.purpose}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => speakPhrase(phrase.chinese, phrase.pinyin)}
                            className={`p-2 rounded-lg shrink-0 transition-all ${
                              isPlaying
                                ? "bg-slate-900 text-white"
                                : `${theme.accentBg} ${theme.accentText} hover:bg-slate-100`
                            }`}
                            aria-label={`播放 ${phrase.chinese}`}
                          >
                            <Volume2 className={`h-4 w-4 ${isPlaying ? "animate-bounce" : ""}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
                    💡 「不喝茶，谢谢！」是防茶托第一金句——在西湖 / 南京东路 / 碑林遇到主动搭讪练英语的“热心人”，说完立刻走开。
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "itineraries" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Tab Selector inside Itineraries Page */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className={`text-[10px] font-mono tracking-widest ${theme.accentText} uppercase font-bold`}>
                    路线推荐平台
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                    {customizeTab === "curated" ? "精选官方推荐路线" : customizeTab === "ai" ? "AI 实时量身定制行程" : "定制行程历史档案"}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    {customizeTab === "curated" 
                      ? "由本地生活专家深度规划并排雷，确保公共交通全线衔接，完美阻断各种茶托与黑车套路。"
                      : customizeTab === "ai"
                      ? "调用最新的 MiniMax AI，输入您的天数、预算和兴趣，为您即时排雷并度身定制数字化生存攻略！"
                      : "查看您之前生成过的专属定制路线，支持直接删除与导出下载为 Markdown 离线备忘文档。"}
                  </p>
                </div>

                {/* Sub toggle switcher */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0 self-start md:self-auto gap-1">
                  <button
                    onClick={() => setCustomizeTab("curated")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      customizeTab === "curated"
                        ? `${theme.accentColor} text-white shadow-sm`
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    官方精选路线
                  </button>
                  <button
                    onClick={() => setCustomizeTab("ai")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      customizeTab === "ai"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI 专属定制
                  </button>
                  <button
                    onClick={() => setCustomizeTab("history")}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 relative ${
                      customizeTab === "history"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <History className="h-3.5 w-3.5" />
                    定制历史
                    {itineraryHistory.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                        {itineraryHistory.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsAdminModalOpen(true);
                      fetchPaymentData();
                      loadAdminConfig();
                    }}
                    className="px-2.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-all flex items-center gap-1 border border-slate-200 bg-white"
                    title="管理收款账户、价格与VIP免费码"
                  >
                    <Settings className="h-3.5 w-3.5 animate-spin-hover" />
                    <span>收款配置</span>
                  </button>
                </div>
              </div>

              {/* Render Curated Itineraries */}
              {customizeTab === "curated" && (
                <ItineraryCard itineraries={itinerariesData} activeCity={activeCity} />
              )}

              {/* Render AI Dynamic Customizer Form and Results */}
              {customizeTab === "ai" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Left parameter selection panel */}
                  <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col gap-5 shadow-xs">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm mb-1">定制您的专属行程</h3>
                      <p className="text-[11px] text-slate-400">我们将调用大语言模型为您度身量制内容推荐。</p>
                    </div>

                    {/* Param: Cities (Multi-select) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 block">游玩城市 (支持多选)</label>
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100/30 px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                          ✨ 随天数智能匹配
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "hangzhou", name: "杭州", badge: "茶香西湖" },
                          { id: "shanghai", name: "上海", badge: "魔都繁华" },
                          { id: "xian", name: "西安", badge: "大唐秦俑" }
                        ].map((c) => {
                          const isSelected = customCities.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => handleToggleCity(c.id)}
                              className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                                isSelected
                                  ? "bg-slate-900 border-slate-950 text-white shadow-md shadow-slate-900/15"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                              }`}
                            >
                              <MapPin className={`h-3.5 w-3.5 ${isSelected ? "text-indigo-400" : "text-slate-400"}`} />
                              <div className="text-xs font-extrabold">{c.name}</div>
                              <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${isSelected ? "bg-white/15 text-white/95" : "bg-slate-100 text-slate-500"}`}>
                                {c.badge}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Param: Duration */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">游玩天数</label>
                      <div className="grid grid-cols-4 gap-2">
                        {["1天", "3天", "5天", "7天"].map((days) => (
                          <button
                            key={days}
                            onClick={() => handleSelectDays(days)}
                            className={`py-2 text-xs font-bold rounded-xl border text-center transition-all ${
                              customDays === days
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {days}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Param: Budget */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">预算级别</label>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: "budget", label: "背包客 / 极简高性价比", desc: "主打公交、地铁、青旅和街头地道小吃" },
                          { id: "moderate", label: "舒适中等 / 深度自由行", desc: "正规快捷酒店、舒适特色餐饮与网约车" },
                          { id: "premium", label: "奢华体验 / 精致度假", desc: "五星级老洋房酒店、私家配导、高空观光及外卡全消费" }
                        ].map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setCustomBudget(b.id)}
                            className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                              customBudget === b.id
                                ? "bg-indigo-50 border-indigo-500 text-indigo-950 shadow-xs"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <span className="text-xs font-bold">{b.label}</span>
                            <span className="text-[10px] text-slate-400 font-normal leading-tight">{b.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Param: Interests */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">我的主要偏好 (多选)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "历史古迹", "现代高空", "自然徒步", "茶艺茶园", "特色美食", "艺术美术馆", "市井骑行", "江南水乡"
                        ].map((interest) => {
                          const isSelected = customInterests.includes(interest);
                          return (
                            <button
                              key={interest}
                              onClick={() => handleToggleInterest(interest)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                isSelected
                                  ? "bg-indigo-600 border-indigo-600 text-white shadow-3xs"
                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {interest}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={handleGenerateCustomItinerary}
                      disabled={isCustomizing || customInterests.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs py-3 rounded-2xl shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition-all mt-2"
                    >
                      {isCustomizing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>正在算力定制中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 animate-pulse" />
                          <span>生成我的 AI 专属排雷攻略</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right Custom Recommendation Display */}
                  <div className="lg:col-span-8">
                    {isCustomizing && (
                      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px] shadow-xs gap-4">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center animate-spin">
                          <Loader2 className="h-6 w-6" />
                        </div>
                        <div className="max-w-md">
                          <h4 className="font-bold text-slate-900 text-base">正在为您精算专属路线...</h4>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            汉斯正在分析 {customCities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join("、")} 的地理路况，融合最新的防坑黑名单与高铁/跨城换乘指南，规避强制消费陷阱，并针对您的“{customInterests.join("、")}”偏好生成数字化生存图谱。
                          </p>
                        </div>
                      </div>
                    )}

                    {customError && (
                      <div className="bg-white border border-rose-200 rounded-3xl p-8 text-center flex flex-col items-center justify-center h-full min-h-[400px] shadow-xs gap-4">
                        <XCircle className="h-10 w-10 text-rose-500" />
                        <div className="max-w-md">
                          <h4 className="font-bold text-rose-950 text-sm">行程定制遇到了一点小插曲</h4>
                          <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                            {customError}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isCustomizing && !customResult && !customError && (
                      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px] shadow-xs gap-4">
                        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                          <Sparkles className="h-7 w-7 text-indigo-600" />
                        </div>
                        <div className="max-w-md">
                          <h4 className="font-extrabold text-slate-900 text-base">开启大模型定制行程推荐</h4>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                            在左边选择您的旅行倾向。AI 引擎会避开低品质跟团购物陷阱，定制完全基于地铁/高精地图/外卡支付/高铁联运的现代独立多城行程方案。
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Custom Result Render */}
                    {!isCustomizing && customResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        {/* Overall assessment summary */}
                        <div className="bg-indigo-950 text-white p-6 md:p-8 rounded-3xl space-y-4 shadow-md relative overflow-hidden">
                          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-indigo-800/20 rounded-full" />
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-200">
                            <Sparkles className="h-4 w-4 animate-pulse" />
                            <span>AI 专家评估报告</span>
                          </div>
                          <h3 className="text-lg md:text-xl font-extrabold tracking-tight">
                            定制方案已完成：{customCities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ")} {customDays} {customBudget === "budget" ? "高性价比" : customBudget === "moderate" ? "舒适型" : "奢华版"}之旅
                          </h3>
                          <p className="text-xs md:text-sm text-indigo-100 leading-relaxed opacity-90 font-medium">
                            {customResult.summary}
                          </p>
                        </div>

                        {/* Digital Prep Checklist */}
                        {customResult.checklist && (
                          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                              <span>本次定制行程的特制整备清单：</span>
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {customResult.checklist.map((item: string, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs font-medium text-slate-700">
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                                  <span>{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Detailed Timeline stops */}
                        {customResult.customItinerary && (
                          <div className="space-y-6">
                            {customResult.customItinerary.map((dayItem: any, dayIdx: number) => (
                              <div key={dayIdx} className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
                                <div className="border-b border-slate-100 pb-4 mb-2 flex items-center justify-between">
                                  <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2 flex-wrap">
                                    <span className="h-6 w-1.5 bg-indigo-600 rounded-full" />
                                    <span>{dayItem.day}</span>
                                    {dayItem.city && (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg ml-2">
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>{dayItem.city}</span>
                                      </span>
                                    )}
                                  </h3>
                                  <span className="text-[10px] bg-indigo-50 text-indigo-800 font-mono font-bold px-2.5 py-0.5 rounded-full border border-indigo-100/40 shrink-0">
                                    AI 推算路线
                                  </span>
                                </div>

                                <div className="relative border-l border-slate-200 ml-4 pl-6 md:pl-8 space-y-6">
                                  {dayItem.activities && dayItem.activities.map((act: any, actIdx: number) => (
                                    <div key={actIdx} className="relative group">
                                      {/* Icon Dot */}
                                      <div className="absolute -left-[32px] md:-left-[40px] top-1 bg-white border border-indigo-500 text-indigo-600 h-6 w-6 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold group-hover:scale-105 transition-transform">
                                        {actIdx + 1}
                                      </div>

                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                          <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                            {act.time}
                                          </span>
                                          <span className="text-[11px] text-slate-400 font-medium font-mono">
                                            预估花费: {act.cost}
                                          </span>
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-950">
                                          {act.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                          {act.description}
                                        </p>

                                        {/* Dynamic Scam Warn */}
                                        {act.scamWarning && act.scamWarning !== "无" && act.scamWarning !== "建议使用正规官方服务，拒绝任何人搭讪" && (
                                          <div className="flex gap-2 bg-rose-50 border border-rose-100 text-rose-900 rounded-xl p-3 text-[11px] mt-2 leading-relaxed">
                                            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div>
                                              <strong className="font-bold block text-rose-950 mb-0.5">防坑避雷红警：</strong>
                                              {act.scamWarning}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {/* Render Custom History Tab */}
              {customizeTab === "history" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
                  {/* Left panel: history records list */}
                  <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col gap-4 shadow-xs">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
                        <History className="h-4 w-4 text-indigo-600" />
                        <span>定制历史档案</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium">本地存储的您专属定制的每一次大模型出行路线。</p>
                    </div>

                    {itineraryHistory.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-3">
                        <Clock className="h-8 w-8 text-slate-300" />
                        <div className="text-xs font-bold text-slate-400">暂无历史定制记录</div>
                        <p className="text-[10px] text-slate-400 max-w-[180px] leading-relaxed mx-auto">
                          现在就去【AI 专属定制】生成您的第一份专属多城联玩方案吧！
                        </p>
                        <button
                          onClick={() => setCustomizeTab("ai")}
                          className="mt-2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
                        >
                          去定制
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                        {itineraryHistory.map((item) => {
                          const isSelected = selectedHistoryId === item.id || (!selectedHistoryId && itineraryHistory[0].id === item.id);
                          const citiesText = item.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ");
                          const budgetText = item.budget === "budget" ? "高性价比" : item.budget === "moderate" ? "舒适型" : "奢华版";
                          return (
                            <div
                              key={item.id}
                              onClick={() => setSelectedHistoryId(item.id)}
                              className={`p-4 rounded-2xl border text-left cursor-pointer transition-all relative group flex flex-col justify-between gap-3 ${
                                isSelected
                                  ? "bg-indigo-50/50 border-indigo-200 shadow-xs"
                                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/20"
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-medium text-slate-400 font-mono flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {item.timestamp}
                                  </span>
                                  <button
                                    onClick={(e) => handleDeleteHistory(item.id, e)}
                                    title="删除此记录"
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                                  {citiesText} {item.duration} 之旅
                                </h4>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/40">
                                    {budgetText}
                                  </span>
                                  {item.interests.slice(0, 2).map((interest, idx) => (
                                    <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                      {interest}
                                    </span>
                                  ))}
                                  {item.interests.length > 2 && (
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                                      +{item.interests.length - 2}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-bold text-indigo-600 mt-1">
                                <span>查看详细行程</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadMarkdown(item);
                                  }}
                                  className="flex items-center gap-1 text-slate-500 hover:text-indigo-600 bg-slate-50 border border-slate-200 hover:border-indigo-100 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-all font-medium text-[10px]"
                                >
                                  <FileDown className="h-3 w-3" />
                                  <span>.MD</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right panel: record detail display */}
                  <div className="lg:col-span-8 space-y-6">
                    {(() => {
                      const selectedItem = itineraryHistory.find(i => i.id === selectedHistoryId) || itineraryHistory[0];

                      if (!selectedItem) {
                        return (
                          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px] shadow-xs gap-4">
                            <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                              <BookOpen className="h-7 w-7" />
                            </div>
                            <div className="max-w-md">
                              <h4 className="font-extrabold text-slate-900 text-base">选择一条定制记录查看</h4>
                              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                                您在左侧可以查看并管理曾经由大模型为您定制出的专属路线。选中后，详细的每日行程、防坑提示和预算指南会在此完整呈现。
                              </p>
                            </div>
                          </div>
                        );
                      }

                      const citiesFormatted = selectedItem.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ");
                      const budgetFormatted = selectedItem.budget === "budget" ? "高性价比" : selectedItem.budget === "moderate" ? "舒适型" : "奢华版";

                      return (
                        <motion.div
                          key={selectedItem.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-6"
                        >
                          {/* Title banner */}
                          <div className="bg-indigo-950 text-white p-6 md:p-8 rounded-3xl space-y-4 shadow-md relative overflow-hidden">
                            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-indigo-800/20 rounded-full" />
                            <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
                              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-200">
                                <History className="h-4 w-4" />
                                <span>定制于 {selectedItem.timestamp}</span>
                              </div>
                              <button
                                onClick={() => handleDownloadMarkdown(selectedItem)}
                                className="flex items-center gap-1.5 text-xs font-extrabold bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/40 px-3.5 py-1.5 rounded-xl transition-all shadow-sm"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>下载为 Markdown 文档</span>
                              </button>
                            </div>
                            <h3 className="text-lg md:text-xl font-extrabold tracking-tight relative z-10">
                              历史定制方案：{citiesFormatted} {selectedItem.duration} {budgetFormatted}之旅
                            </h3>
                            <p className="text-xs md:text-sm text-indigo-100 leading-relaxed opacity-90 font-medium relative z-10">
                              {selectedItem.result.summary}
                            </p>
                          </div>

                          {/* Digital Prep Checklist */}
                          {selectedItem.result.checklist && (
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
                              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                                <span>本次定制行程的特制整备清单：</span>
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {selectedItem.result.checklist.map((item: string, idx: number) => (
                                  <div key={idx} className="flex items-start gap-2 bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl text-xs text-slate-700">
                                    <span className="font-mono text-[10px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100/50 h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="leading-normal">{item}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Days itinerary details */}
                          <div className="space-y-6">
                            {selectedItem.result.customItinerary.map((dayItem: any, dayIdx: number) => (
                              <div key={dayIdx} className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
                                <div className="border-b border-slate-100 pb-4 mb-2 flex items-center justify-between">
                                  <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2 flex-wrap">
                                    <span className="h-6 w-1.5 bg-indigo-600 rounded-full" />
                                    <span>{dayItem.day}</span>
                                    {dayItem.city && (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg ml-2">
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span>{dayItem.city}</span>
                                      </span>
                                    )}
                                  </h3>
                                  <span className="text-[10px] bg-indigo-50 text-indigo-800 font-mono font-bold px-2.5 py-0.5 rounded-full border border-indigo-100/40 shrink-0">
                                    已存档路线
                                  </span>
                                </div>

                                <div className="relative border-l border-slate-200 ml-4 pl-6 md:pl-8 space-y-6">
                                  {dayItem.activities && dayItem.activities.map((act: any, actIdx: number) => (
                                    <div key={actIdx} className="relative group">
                                      {/* Icon Dot */}
                                      <div className="absolute -left-[32px] md:-left-[40px] top-1 bg-white border border-indigo-500 text-indigo-600 h-6 w-6 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold group-hover:scale-105 transition-transform">
                                        {actIdx + 1}
                                      </div>

                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                          <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                            {act.time}
                                          </span>
                                          <span className="text-[11px] text-slate-400 font-medium font-mono">
                                            预估花费: {act.cost}
                                          </span>
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-950">
                                          {act.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                          {act.description}
                                        </p>

                                        {/* Dynamic Scam Warn */}
                                        {act.scamWarning && act.scamWarning !== "无" && act.scamWarning !== "建议使用正规官方服务，拒绝任何人搭讪" && (
                                          <div className="flex gap-2 bg-rose-50 border border-rose-100 text-rose-900 rounded-xl p-3 text-[11px] mt-2 leading-relaxed">
                                            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div>
                                              <strong className="font-bold block text-rose-950 mb-0.5">防坑避雷红警：</strong>
                                              {act.scamWarning}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "scams" && (
            <ScamTab
              theme={theme}
              cityName={theme.name}
              cityScams={cityScams}
              highDangerCount={highDangerCount}
              examQuestions={SCAM_QUIZ[activeCity as keyof typeof SCAM_QUIZ] || SCAM_QUIZ.hangzhou}
            />
          )}

          {activeTab === "survival" && (
            <SurvivalTab
              theme={theme}
              cityName={theme.name}
              completedSteps={completedSteps}
              onToggleStep={toggleStep}
            />
          )}

          {activeTab === "phrases" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <span className={`text-[10px] font-mono tracking-widest ${theme.accentText} uppercase font-bold`}>
                    无障碍口语求生卡
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">必备应急口语</h2>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-xl leading-relaxed">
                    在购买本地特产、乘坐正规出租车、或者遇到搭讪茶托时，随时出示或点击跟读。点击扬声器图标可播放标准的标准真人普通话发音。
                  </p>
                </div>

                {/* Filter Search */}
                <div className="relative w-full md:w-72">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="输入中文、拼音或英文搜索短语..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-slate-50 font-medium"
                  />
                </div>
              </div>

              {/* Grid of Phrases */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPhrases.length > 0 ? (
                  filteredPhrases.map((phrase, index) => {
                    const isCritical = phrase.chinese.includes("茶") || phrase.chinese.includes("表");
                    const isPlaying = playingPhrase === phrase.pinyin;
                    
                    return (
                      <div 
                        key={index} 
                        className={`bg-white border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-3xs transition-all hover:shadow-xs ${
                          isCritical ? "border-amber-200 bg-amber-50/10" : "border-slate-200"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-[9px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                              {phrase.category === "Essentials" ? "核心基础" : phrase.category === "Transit" ? "交通出行" : phrase.category === "Ordering" ? "餐饮点单" : "紧急状况"}
                            </span>
                            {isCritical && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-widest">
                                避雷核心句
                              </span>
                            )}
                          </div>

                          {/* Pinyin & Chinese characters */}
                          <div className="space-y-1.5">
                            <div className="text-xl font-extrabold text-slate-950 flex items-baseline gap-2">
                              <span>{phrase.chinese}</span>
                              <span className={`text-xs ${theme.accentText} font-mono font-medium`}>({phrase.pinyin})</span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-500">
                              英语对应: {phrase.english}
                            </h4>
                          </div>
                        </div>

                        <div className="border-t border-slate-100/50 pt-3 flex items-center justify-between gap-4">
                          <span className="text-[10px] text-slate-500 italic max-w-[180px]">
                            {phrase.purpose}
                          </span>

                          <button
                            onClick={() => speakPhrase(phrase.chinese, phrase.pinyin)}
                            className={`p-2 rounded-lg transition-all ${
                              isPlaying 
                                ? "bg-slate-900 text-white" 
                                : `${theme.accentBg} ${theme.accentText} hover:bg-slate-100`
                            }`}
                          >
                            <Volume2 className={`h-4.5 w-4.5 ${isPlaying ? "animate-bounce" : ""}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-12 text-slate-400 bg-white border border-slate-200 rounded-3xl">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-semibold">未找到匹配口语短语。请尝试输入其他关键词。</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-md flex flex-col h-[550px]"
            >
              {/* Chat companion header */}
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${theme.accentColor} rounded-full flex items-center justify-center text-white font-extrabold shadow-md`}>
                    H
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">向导汉斯 - {theme.name}专家</h3>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-[10px] text-slate-400 font-mono font-medium">MiniMax AI 智能向导</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {/* 内站/外站开关已挪到"账户"页（H5 only），这里只保留"清空历史"按钮。 */}
                  <button
                    onClick={() => setChatMessages(prev => ({
                      ...prev,
                      [activeCity]: [
                        {
                          role: "model",
                          content: `对${theme.name}的对话历史已清空。让我们重新开始！您可以向我询问定制线路、特产防宰客、或者地铁换乘指南。`,
                          timestamp: new Date()
                        }
                      ]
                    }))}
                    className="text-slate-400 hover:text-white text-xs font-mono transition-colors bg-white/5 px-2.5 py-1 rounded-md"
                  >
                    清空历史
                  </button>
                </div>
              </div>

              {/* Chat list area */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
                {(chatMessages[activeCity] || []).map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div 
                      key={index} 
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div 
                        className={`max-w-[85%] rounded-2xl p-4 text-xs md:text-sm leading-relaxed shadow-3xs ${
                          isUser 
                            ? "bg-slate-900 text-white rounded-br-none" 
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <ChatMarkdown content={msg.content} sourceMode={sourceMode} />
                        </div>
                        <span className={`text-[9px] mt-1.5 block text-right text-slate-400`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 shadow-3xs flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className={`h-2 w-2 ${theme.accentColor} rounded-full animate-bounce`} style={{ animationDelay: "0ms" }} />
                        <span className={`h-2 w-2 ${theme.accentColor} rounded-full animate-bounce`} style={{ animationDelay: "150ms" }} />
                        <span className={`h-2 w-2 ${theme.accentColor} rounded-full animate-bounce`} style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono font-medium">汉斯正在为您搜寻{theme.name}出行锦囊...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat action bar */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex gap-3">
                <input
                  type="text"
                  placeholder={`提问关于${theme.badge}上网、144小时过境签、本地地铁、经典美食推荐...`}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-xs md:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-400 bg-slate-50 font-medium"
                  disabled={isChatLoading}
                />
                <button
                  type="submit"
                  className="bg-slate-900 text-white hover:bg-slate-850 px-4 py-2 rounded-xl transition-all flex items-center justify-center shrink-0"
                  disabled={isChatLoading || !userInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          )}

          {activeTab === "account" && (
            <motion.div
              key="account"
              className="md:hidden"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AccountPanel
                user={authUser}
                sourceMode={sourceMode}
                setSourceMode={setSourceMode}
                accentBg={theme.accentColor}
                onLogout={async () => {
                  // 复用 HeaderAuth 里的登出逻辑（清 token + 通知后端）
                  const refresh = localStorage.getItem("auth_refresh_token");
                  try {
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
                    localStorage.removeItem("auth_access_token");
                    localStorage.removeItem("auth_refresh_token");
                    setAuthUser(null);
                  }
                }}
                onRequireLogin={() => setOpenAuthSignal((s) => s + 1)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Payment Backend Configuration Admin Panel Modal */}
        {isAdminModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="bg-indigo-600 p-2 rounded-xl text-white">
                    <Settings className="h-5 w-5 animate-spin-slow" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm tracking-tight">避雷手册后台管理 & 收款对账系统</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Real-time payment configurations and transaction log gateway</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAdminModalOpen(false)}
                  className="text-slate-400 hover:text-white text-xs font-mono bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
                >
                  关闭配置
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Section 1: Config Form */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Wallet className="h-4 w-4 text-indigo-600" />
                    <span>收款账户与产品定价配置 (支付宝、微信及 PayPal)</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">支付宝 (Alipay) 收款账号</label>
                      <input
                        type="text"
                        value={payConfig.alipayAccount}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, alipayAccount: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium"
                        placeholder="例如: alipay-merchant@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">微信支付 (WeChat) 商户收款号</label>
                      <input
                        type="text"
                        value={payConfig.wechatMerchantId}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, wechatMerchantId: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium"
                        placeholder="例如: wx_merchant_100234"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">PayPal Client ID / 商户邮箱</label>
                      <input
                        type="text"
                        value={payConfig.paypalClientId}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, paypalClientId: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium"
                        placeholder="PayPal Client ID"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">VIP 免费兑换校验码</label>
                      <input
                        type="text"
                        value={payConfig.vipCode}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, vipCode: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono font-bold text-amber-600"
                        placeholder="VIP888"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">人民币单价 (CNY)</label>
                      <input
                        type="text"
                        value={payConfig.priceCny}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, priceCny: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono font-bold"
                        placeholder="9.9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-slate-600 block">美元单价 (USD)</label>
                      <input
                        type="text"
                        value={payConfig.priceUsd}
                        onChange={(e) => setPayConfig(prev => ({ ...prev, priceUsd: e.target.value }))}
                        className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono font-bold"
                        placeholder="1.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={async () => {
                        const ok = await handleUpdatePayConfig(payConfig);
                        if (ok) {
                          alert("收款配置保存成功，且全套API缓存已同步！");
                        } else {
                          alert("收款配置保存失败，请检查网络！");
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition-all"
                    >
                      保存收款参数配置
                    </button>
                  </div>
                </div>

                {/* Section 2: Transaction History Log */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <Clock className="h-4 w-4 text-emerald-600" />
                      <span>订单交易流水数据库 (真实付款对账流水)</span>
                    </h4>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-mono border border-emerald-100 font-bold">
                      实时账本联机
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider font-mono">
                          <th className="px-4 py-3 font-bold">流水对账单号</th>
                          <th className="px-4 py-3 font-bold">专属定制行程</th>
                          <th className="px-4 py-3 font-bold">付款人真实账号</th>
                          <th className="px-4 py-3 font-bold">支付渠道</th>
                          <th className="px-4 py-3 font-bold">实付金额</th>
                          <th className="px-4 py-3 font-bold">支付时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                              暂无成功充值支付订单流水。
                            </td>
                          </tr>
                        ) : (
                          transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors font-medium text-slate-700">
                              <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{tx.id}</td>
                              <td className="px-4 py-3 text-slate-900 font-bold">{tx.itineraryTitle}</td>
                              <td className="px-4 py-3 font-mono text-indigo-600">{tx.payerAccount}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  tx.paymentMethod === "Alipay" 
                                    ? "bg-sky-50 text-sky-800 border border-sky-100" 
                                    : tx.paymentMethod === "WeChat"
                                    ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                                    : tx.paymentMethod === "PayPal"
                                    ? "bg-indigo-50 text-indigo-800 border border-indigo-100"
                                    : "bg-amber-50 text-amber-800 border border-amber-100"
                                }`}>
                                  {tx.paymentMethod}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900">{tx.amount}</td>
                              <td className="px-4 py-3 text-[11px] text-slate-400 font-mono">{tx.timestamp}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 避坑数据导入卡片 */}
                <div className="border border-indigo-200 rounded-2xl overflow-hidden bg-indigo-50/30 shadow-3xs">
                  <div className="px-5 py-3 border-b border-indigo-100 bg-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    <h3 className="font-extrabold text-sm text-slate-800">避坑数据导入（scenarios.json / md 解析）</h3>
                    <span className="text-[10px] text-slate-400 ml-2">会从 D:/AI_project/旅游专题/data/final/ 读取约定文件</span>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button
                        type="button"
                        disabled={importBusy}
                        onClick={() => handleAdminImport("json")}
                        className="px-4 py-3 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-50 text-left"
                      >
                        <div className="text-[12px] font-extrabold text-slate-800">📥 导入 scenarios.json</div>
                        <div className="text-[10px] text-slate-500 mt-1">读 data/final/scenarios.json，upsert 到 scams 表</div>
                      </button>
                      <button
                        type="button"
                        disabled={importBusy}
                        onClick={() => handleAdminImport("md")}
                        className="px-4 py-3 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-50 text-left"
                      >
                        <div className="text-[12px] font-extrabold text-slate-800">📥 导入 套路避坑指南.md</div>
                        <div className="text-[10px] text-slate-500 mt-1">解析 H2/H3 章节，upsert 到 scams 表</div>
                      </button>
                      <button
                        type="button"
                        disabled={importBusy}
                        onClick={() => handleAdminImport("seed")}
                        className="px-4 py-3 rounded-xl border border-amber-200 bg-white hover:bg-amber-50 disabled:opacity-50 text-left"
                      >
                        <div className="text-[12px] font-extrabold text-slate-800">🌱 重新 Seed 数据</div>
                        <div className="text-[10px] text-slate-500 mt-1">清空表后从 src/data.ts 重新写入（慎用）</div>
                      </button>
                    </div>
                    {importMessage && (
                      <div className="text-[11px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700">
                        {importMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Pay-to-Unlock Checkout Modal */}
        {isCheckoutModalOpen && itineraryToCheckout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              {/* Modal header */}
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-indigo-400 animate-pulse" />
                  <span className="font-extrabold text-sm tracking-tight">极速对账付费下载</span>
                </div>
                <button
                  onClick={() => setIsCheckoutModalOpen(false)}
                  className="text-slate-400 hover:text-white text-xs font-mono bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md"
                >
                  取消
                </button>
              </div>

              {/* Success state display */}
              {paySuccess ? (
                <div className="p-8 text-center space-y-4 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">对账验证通过！</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      已成功为您的付款账号 <strong className="text-indigo-600 font-mono">{alipayPayerInput || wechatPayerInput || payerEmail}</strong> 解锁此行程。<br />
                      正在为您自动打包并下载《数字化生存防坑避雷手册》Markdown 备忘录...
                    </p>
                  </div>
                  <div className="w-full max-w-[200px] h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full animate-progress" />
                  </div>
                </div>
              ) : checkIsUnlocked(itineraryToCheckout.id) ? (
                <div className="p-6 space-y-5">
                  {/* Selected Itinerary details card */}
                  <div className="bg-emerald-950 text-white p-4.5 rounded-2xl space-y-1.5 relative overflow-hidden">
                    <div className="absolute right-3 bottom-3 opacity-15">
                      <CheckCircle2 className="h-16 w-16 text-emerald-400" />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-300 tracking-wider block">订单对账已完成 / VIP 专享通过</span>
                    <h4 className="font-extrabold text-sm leading-snug">
                      中国独立行数字化排雷指南：{itineraryToCheckout.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ")} {itineraryToCheckout.duration} 之旅
                    </h4>
                    <div className="flex justify-between items-baseline pt-2 border-t border-emerald-800 mt-2">
                      <span className="text-[10px] text-emerald-200">下载授权账号</span>
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {payerEmail}
                      </span>
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                    <h5 className="font-extrabold text-xs text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>已成功获取终身下载授权</span>
                    </h5>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      检测到您的对账账号 <strong className="text-indigo-600 font-mono">{payerEmail}</strong> 已经购买或验证过该行程。
                      我们已在后台加载了该行程对应的付费/VIP下载通道信息。您可随时免费重复下载本指南！
                    </p>
                  </div>

                  {/* Multi-device seamless cloud account input */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1.5">
                    <label className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-indigo-600" />
                      <span>我的专属对账账号 (可输入您的常用邮箱/手机)</span>
                    </label>
                    <input
                      type="text"
                      value={payerEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPayerEmail(val);
                        setAlipayPayerInput(val);
                        setWechatPayerInput(val);
                        setPaypalPayerInput(val);
                      }}
                      className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-indigo-600"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <button
                      onClick={() => {
                        executeActualDownload(itineraryToCheckout);
                        setTimeout(() => {
                          setIsCheckoutModalOpen(false);
                        }, 1000);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Download className="h-4 w-4" />
                      <span>立即打包并下载 Markdown 备忘录</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setPayerEmail("");
                        setAlipayPayerInput("");
                        setWechatPayerInput("");
                        setPaypalPayerInput("");
                      }}
                      className="w-full text-[11px] text-slate-500 hover:text-slate-800 text-center py-1 transition-all"
                    >
                      切换其他账号 / 重新输入支付或 VIP 信息
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-5">
                  {/* Selected Itinerary details card */}
                  <div className="bg-indigo-950 text-white p-4.5 rounded-2xl space-y-1.5 relative overflow-hidden">
                    <div className="absolute right-3 bottom-3 opacity-10">
                      <FileDown className="h-16 w-16" />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-indigo-300 tracking-wider block">即将解锁下载产品</span>
                    <h4 className="font-extrabold text-sm leading-snug">
                      中国独立行数字化排雷指南：{itineraryToCheckout.cities.map(c => c === "hangzhou" ? "杭州" : c === "shanghai" ? "上海" : "西安").join(" + ")} {itineraryToCheckout.duration} 之旅
                    </h4>
                    <div className="flex justify-between items-baseline pt-2 border-t border-white/10 mt-2">
                      <span className="text-[10px] text-indigo-200">下载定价 (一次购买永久下载)</span>
                      <span className="text-lg font-mono font-extrabold text-amber-300">
                        {checkoutMethod === "PayPal" ? `$${payConfig.priceUsd}` : `¥${payConfig.priceCny}`}
                      </span>
                    </div>
                  </div>

                  {/* Multi-device seamless cloud account input */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1.5">
                    <label className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-indigo-600" />
                      <span>我的专属对账账号 (可输入您的常用邮箱/手机)</span>
                    </label>
                    <input
                      type="text"
                      value={payerEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPayerEmail(val);
                        setAlipayPayerInput(val);
                        setWechatPayerInput(val);
                        setPaypalPayerInput(val);
                      }}
                      className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-indigo-600"
                      placeholder="woshihulimao@gmail.com"
                    />
                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                      💡 <strong>免重复付费说明：</strong>本系统采用“付款人账号”对账。如果您曾经用此邮箱在其他设备付过费，在此直接输入该邮箱即可瞬间识别，免单重下！
                    </p>
                  </div>

                  {/* Checkout Selector tabs */}
                  <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setCheckoutMethod("Alipay")}
                      className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all ${
                        checkoutMethod === "Alipay"
                          ? "bg-white text-sky-600 shadow-3xs border border-sky-200/50"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      支付宝
                    </button>
                    <button
                      onClick={() => setCheckoutMethod("WeChat")}
                      className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all ${
                        checkoutMethod === "WeChat"
                          ? "bg-white text-emerald-600 shadow-3xs border border-emerald-200/50"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      微信支付
                    </button>
                    <button
                      onClick={() => setCheckoutMethod("PayPal")}
                      className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all ${
                        checkoutMethod === "PayPal"
                          ? "bg-white text-indigo-600 shadow-3xs border border-indigo-200/50"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      PayPal
                    </button>
                    <button
                      onClick={() => setCheckoutMethod("VIP")}
                      className={`py-2 rounded-lg text-[10px] font-bold text-center transition-all ${
                        checkoutMethod === "VIP"
                          ? "bg-white text-amber-600 shadow-3xs border border-amber-200/50"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      VIP码免费
                    </button>
                  </div>

                  {/* Payment form block */}
                  <form onSubmit={(e) => handleVerifyPayment(e)} className="space-y-4">
                    {/* Alipay rendering */}
                    {checkoutMethod === "Alipay" && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border border-slate-100 p-4 rounded-2xl bg-slate-50/30">
                          {/* QR Code vector styling */}
                          <div className="w-36 h-36 bg-white p-2 border border-sky-100 rounded-2xl mx-auto flex flex-col items-center justify-center relative shadow-xs shrink-0">
                            <div className="w-32 h-32 bg-sky-50 border border-indigo-400 rounded-lg flex flex-col items-center justify-center relative overflow-hidden">
                              <QrCode className="h-14 w-14 text-indigo-600 animate-pulse" />
                              <span className="text-[8px] font-mono font-bold text-indigo-700 mt-1">支付宝扫一扫</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 flex-1 text-center md:text-left">
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded border border-sky-200 uppercase tracking-wide">支付宝独立收款网关</span>
                            <div className="text-xs font-bold text-slate-800">
                              收款方账号 (后台已配置)：
                            </div>
                            <div className="text-xs font-mono bg-white border border-slate-200 px-2.5 py-1 rounded-md text-slate-600 font-extrabold select-all truncate max-w-[200px] mx-auto md:mx-0">
                              {payConfig.alipayAccount}
                            </div>
                            <div className="text-[10px] text-slate-400 leading-normal">
                              请使用支付宝 App 扫描左侧二维码，支付 ¥{payConfig.priceCny} 进行购买解锁。
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-extrabold text-slate-600 block">
                            付款支付宝账号验证 (输入您付款的真实支付宝手机或邮箱)：
                          </label>
                          <input
                            type="text"
                            value={alipayPayerInput}
                            onChange={(e) => {
                              setAlipayPayerInput(e.target.value);
                              setPayerEmail(e.target.value);
                            }}
                            className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-sky-500"
                            placeholder="请输入付款绑定的邮箱或手机"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* WeChat rendering */}
                    {checkoutMethod === "WeChat" && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border border-slate-100 p-4 rounded-2xl bg-slate-50/30">
                          {/* QR Code vector styling */}
                          <div className="w-36 h-36 bg-white p-2 border border-emerald-100 rounded-2xl mx-auto flex flex-col items-center justify-center relative shadow-xs shrink-0">
                            <div className="w-32 h-32 bg-emerald-50/50 border border-emerald-500 rounded-lg flex flex-col items-center justify-center relative overflow-hidden">
                              <QrCode className="h-14 w-14 text-emerald-600 animate-pulse" />
                              <span className="text-[8px] font-mono font-bold text-emerald-800 mt-1">微信扫一扫</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 flex-1 text-center md:text-left">
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase tracking-wide">微信商户免对账网关</span>
                            <div className="text-xs font-bold text-slate-800">
                              收款微信商户号 (后台已配置)：
                            </div>
                            <div className="text-xs font-mono bg-white border border-slate-200 px-2.5 py-1 rounded-md text-slate-600 font-extrabold select-all truncate max-w-[200px] mx-auto md:mx-0">
                              {payConfig.wechatMerchantId}
                            </div>
                            <div className="text-[10px] text-slate-400 leading-normal">
                              请使用微信 App 扫描二维码，直接向商户支付 ¥{payConfig.priceCny} 进行激活。
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-extrabold text-slate-600 block">
                            付款微信账号（微信号或绑定的手机，作订单绑定）：
                          </label>
                          <input
                            type="text"
                            value={wechatPayerInput}
                            onChange={(e) => {
                              setWechatPayerInput(e.target.value);
                              setPayerEmail(e.target.value);
                            }}
                            className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                            placeholder="请输入您的微信绑定的账号"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* PayPal rendering with Simulated official button */}
                    {checkoutMethod === "PayPal" && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3.5 text-center">
                          <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 uppercase tracking-wider">PayPal Express checkout</span>
                          <div className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                            Click below to open the secure PayPal Express payment wizard in the Sandbox network.
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setIsPaypalPopupOpen(true);
                              setPaypalEmailInput(payerEmail);
                            }}
                            className="w-full max-w-xs mx-auto bg-amber-400 hover:bg-amber-500 text-slate-900 font-black py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 border border-amber-500/50 text-xs tracking-tight"
                          >
                            <span className="font-sans italic">Pay with </span>
                            <span className="font-sans text-indigo-900 font-extrabold">Pay</span>
                            <span className="font-sans text-sky-600 font-extrabold">Pal</span>
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-extrabold text-slate-600 block">
                            PayPal Email Address for download confirmation:
                          </label>
                          <input
                            type="text"
                            value={paypalPayerInput}
                            onChange={(e) => {
                              setPaypalPayerInput(e.target.value);
                              setPayerEmail(e.target.value);
                            }}
                            className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium"
                            placeholder="your_paypal_buyer@example.com"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* VIP Code Bypass Form */}
                    {checkoutMethod === "VIP" && (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="bg-slate-950 text-amber-100 border border-amber-900 p-4 rounded-2xl text-center space-y-1.5 relative overflow-hidden">
                          <div className="absolute right-3 top-3 text-amber-500/10">
                            <Sparkles className="h-10 w-10 animate-bounce" />
                          </div>
                          <span className="text-[10px] text-amber-400 font-extrabold tracking-widest uppercase">VIP Free Download Bypass</span>
                          <p className="text-[11px] text-slate-300 max-w-xs mx-auto leading-relaxed">
                            请输入由合作组织或活动方发放的 VIP 免费专享通道兑换码。可以直接输入内置测试码：<strong className="text-amber-400 font-mono animate-pulse">VIP888</strong> 极速通过！
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-extrabold text-slate-600 block">
                            VIP 专享验证码:
                          </label>
                          <input
                            type="text"
                            value={vipInput}
                            onChange={(e) => setVipInput(e.target.value)}
                            className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-mono font-extrabold tracking-widest text-center text-amber-600 focus:ring-1 focus:ring-amber-500"
                            placeholder="请输入 VIP 兑换码 (如 VIP888)"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {payError && (
                      <div className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-start gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{payError}</span>
                      </div>
                    )}

                    {checkoutMethod !== "PayPal" && (
                      <button
                        type="submit"
                        disabled={isPaying}
                        className={`w-full text-white font-extrabold text-xs py-3 rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all ${
                          checkoutMethod === "VIP"
                            ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100"
                            : "bg-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        {isPaying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>正在联机网络对账中，请稍候...</span>
                          </>
                        ) : (
                          <>
                            <span>
                              {checkoutMethod === "VIP" ? "验证 VIP 免单码并下载" : `我已完成支付，核对账单并解锁`}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </form>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Real Simulated PayPal Interactive Checkout Overlay */}
        {isPaypalPopupOpen && (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#fcfcfa] rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-slate-800 font-sans"
            >
              {/* Top Banner with official colors */}
              <div className="bg-[#003087] p-5 flex items-center justify-between text-white border-[#003087] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base italic tracking-tight">Pay<span className="text-sky-300">Pal</span></span>
                  <span className="text-[10px] bg-white/10 text-slate-200 px-2 py-0.5 rounded uppercase font-bold font-mono tracking-wider">Sandbox Express</span>
                </div>
                <button
                  onClick={() => setIsPaypalPopupOpen(false)}
                  className="text-slate-300 hover:text-white text-xs font-mono font-bold bg-white/10 px-2 py-1 rounded"
                >
                  Close
                </button>
              </div>

              <div className="p-6 space-y-5 flex-1">
                <div className="border-b border-slate-200 pb-4 text-center">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Secure Transaction Gate</span>
                  <h4 className="text-sm font-bold text-slate-700">
                    Payment request from <strong className="text-slate-900">independent_handbook</strong>
                  </h4>
                  <div className="text-2xl font-mono font-black text-slate-900 mt-2">
                    ${payConfig.priceUsd} USD
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-extrabold text-slate-500 block">PayPal Sandbox Email</label>
                    <input
                      type="email"
                      value={paypalEmailInput}
                      onChange={(e) => setPaypalEmailInput(e.target.value)}
                      className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-xs font-semibold focus:border-[#003087] focus:ring-1 focus:ring-[#003087] focus:outline-hidden"
                      placeholder="sb-buyer@business.example.com"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-extrabold text-slate-500 block">Sandbox Password</label>
                    <input
                      type="password"
                      value={paypalPasswordInput}
                      onChange={(e) => setPaypalPasswordInput(e.target.value)}
                      className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-xs font-semibold focus:border-[#003087] focus:ring-1 focus:ring-[#003087] focus:outline-hidden"
                      placeholder="••••••••"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 leading-normal">
                    💡 This sandbox simulation verifies credentials locally. You can enter any mock login email and click pay to test the checkout loop without real funds.
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    onClick={() => {
                      setIsPaypalPopupOpen(false);
                      setPaypalPayerInput(paypalEmailInput);
                      setPayerEmail(paypalEmailInput);
                      // Trigger backend transaction registration automatically
                      handleVerifyPayment(undefined, "PayPal", paypalEmailInput, "Simulated PayPal Token SUCCESS");
                    }}
                    className="w-full bg-[#0079C1] hover:bg-[#00457C] text-white font-extrabold text-xs py-3 rounded-2xl shadow-sm transition-all text-center"
                  >
                    Agree & Pay Now
                  </button>
                  <button
                    onClick={() => setIsPaypalPopupOpen(false)}
                    className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 font-extrabold text-xs py-2.5 rounded-2xl transition-all text-center"
                  >
                    Cancel and return to Merchant
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

      </main>

      {/* Bottom Bar Info aligning with the design theme's uppercase letter-spacing */}
      <footer className="h-14 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between px-6 sm:px-8 text-[9px] font-mono font-bold text-slate-400 shrink-0 uppercase tracking-widest py-3 mt-12 gap-2 text-center sm:text-left">
        <div className="flex flex-wrap justify-center sm:justify-start gap-4">
          <span>紧急求助: 110 (报警) / 120 (急救)</span>
          <span>监督投诉: 12328 (出租车监督电话)</span>
        </div>
        <div>专为独立旅行者设计 • 全国避坑生存红宝书 2026</div>
      </footer>
    </div>
  );
}
