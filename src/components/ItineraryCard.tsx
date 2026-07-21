import React, { useState, useEffect } from "react";
import { Itinerary, ItineraryStop } from "../types";
import { Clock, Banknote, MapPin, Compass, HelpCircle, Flame, ShieldAlert, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

interface ItineraryCardProps {
  itineraries: Itinerary[];
  activeCity: string;
}

const CITY_CLASSES: Record<string, {
  primary: string;
  primaryBg: string;
  primaryBorder: string;
  lightBg: string;
  lightBgSemi: string;
  lightBgAlt: string;
  lightBgAlt2: string;
  lightBorder: string;
  lightBorderSemi: string;
  lightBorderAlt: string;
  lightBorderAlt2: string;
  textColor: string;
  textColorDark: string;
  textColorMid: string;
  textColorLight: string;
  textColorSuperLight: string;
  shadowColor: string;
  shadowColorDark: string;
  hoverBorder: string;
  hoverBg: string;
  borderMedium: string;
  borderHoverMedium: string;
}> = {
  hangzhou: {
    primary: "teal-600",
    primaryBg: "bg-teal-600",
    primaryBorder: "border-teal-600",
    lightBg: "bg-teal-50",
    lightBgSemi: "bg-teal-50/50",
    lightBgAlt: "bg-teal-50/30",
    lightBgAlt2: "bg-teal-50/40",
    lightBorder: "border-teal-100",
    lightBorderSemi: "border-teal-100/40",
    lightBorderAlt: "border-teal-100/80",
    lightBorderAlt2: "border-teal-100/30",
    textColor: "text-teal-800",
    textColorDark: "text-teal-900",
    textColorMid: "text-teal-700",
    textColorLight: "text-teal-600",
    textColorSuperLight: "text-teal-100",
    shadowColor: "shadow-teal-100",
    shadowColorDark: "shadow-teal-200",
    hoverBorder: "hover:border-teal-200",
    hoverBg: "hover:bg-teal-50/20",
    borderMedium: "border-teal-200",
    borderHoverMedium: "hover:border-teal-500"
  },
  shanghai: {
    primary: "fuchsia-600",
    primaryBg: "bg-fuchsia-600",
    primaryBorder: "border-fuchsia-600",
    lightBg: "bg-fuchsia-50",
    lightBgSemi: "bg-fuchsia-50/50",
    lightBgAlt: "bg-fuchsia-50/30",
    lightBgAlt2: "bg-fuchsia-50/40",
    lightBorder: "border-fuchsia-100",
    lightBorderSemi: "border-fuchsia-100/40",
    lightBorderAlt: "border-fuchsia-100/80",
    lightBorderAlt2: "border-fuchsia-100/30",
    textColor: "text-fuchsia-800",
    textColorDark: "text-fuchsia-900",
    textColorMid: "text-fuchsia-700",
    textColorLight: "text-fuchsia-600",
    textColorSuperLight: "text-fuchsia-100",
    shadowColor: "shadow-fuchsia-100",
    shadowColorDark: "shadow-fuchsia-200",
    hoverBorder: "hover:border-fuchsia-200",
    hoverBg: "hover:bg-fuchsia-50/20",
    borderMedium: "border-fuchsia-200",
    borderHoverMedium: "hover:border-fuchsia-500"
  },
  xian: {
    primary: "orange-600",
    primaryBg: "bg-orange-600",
    primaryBorder: "border-orange-600",
    lightBg: "bg-orange-50",
    lightBgSemi: "bg-orange-50/50",
    lightBgAlt: "bg-orange-50/30",
    lightBgAlt2: "bg-orange-50/40",
    lightBorder: "border-orange-100",
    lightBorderSemi: "border-orange-100/40",
    lightBorderAlt: "border-orange-100/80",
    lightBorderAlt2: "border-orange-100/30",
    textColor: "text-orange-800",
    textColorDark: "text-orange-900",
    textColorMid: "text-orange-700",
    textColorLight: "text-orange-600",
    textColorSuperLight: "text-orange-100",
    shadowColor: "shadow-orange-100",
    shadowColorDark: "shadow-orange-200",
    hoverBorder: "hover:border-orange-200",
    hoverBg: "hover:bg-orange-50/20",
    borderMedium: "border-orange-200",
    borderHoverMedium: "hover:border-orange-500"
  }
};

export default function ItineraryCard({ itineraries, activeCity }: ItineraryCardProps) {
  const c = CITY_CLASSES[activeCity] || CITY_CLASSES.hangzhou;
  const currentItineraries = itineraries.filter(it => it.city === activeCity) || [];
  const defaultItineraryId = currentItineraries[0]?.id || "";

  const [selectedItinerary, setSelectedItinerary] = useState<string>(defaultItineraryId);
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(0);

  // Auto-switch selected itinerary when active city changes
  useEffect(() => {
    if (currentItineraries.length > 0) {
      setSelectedItinerary(currentItineraries[0].id);
      setActiveStopIndex(0);
    }
  }, [activeCity]);

  const currentItinerary = currentItineraries.find((it) => it.id === selectedItinerary) || currentItineraries[0];

  if (!currentItinerary) {
    return (
      <div className="text-center py-12 text-gray-500">
        没有找到该城市的路线推荐。
      </div>
    );
  }

  // Helper to parse numerical costs from stops to show a dynamic total estimate
  const calculateTotalCostEstimate = (stops: ItineraryStop[]) => {
    let total = 0;
    stops.forEach((stop) => {
      const match = stop.cost.match(/\d+/);
      if (match) {
        total += parseInt(match[0], 10);
      }
    });
    return total;
  };

  const totalCost = calculateTotalCostEstimate(currentItinerary.stops);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Route Selector sidebar */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        <h3 className={`text-xs font-mono tracking-wider ${c.textColor} uppercase font-bold`}>
          选择您的旅行路线
        </h3>
        <div className="flex flex-col gap-3">
          {currentItineraries.map((it) => {
            const isSelected = it.id === selectedItinerary;
            return (
              <button
                key={it.id}
                onClick={() => {
                  setSelectedItinerary(it.id);
                  setActiveStopIndex(0); // Reset to first stop
                }}
                className={`text-left p-5 rounded-2xl border transition-all duration-300 ${
                  isSelected
                    ? `${c.primaryBg} ${c.primaryBorder} text-white shadow-lg ${c.shadowColor}`
                    : `bg-white border-gray-100 ${c.hoverBorder} text-gray-700 ${c.hoverBg}`
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
                      isSelected ? "bg-white/20 text-white" : `${c.lightBg} ${c.textColor}`
                    }`}
                  >
                    {it.duration}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[10px] font-medium ${
                      isSelected ? c.textColorSuperLight : "text-gray-400"
                    }`}
                  >
                    <Flame className="h-3 w-3" />
                    旅行节奏: {it.pace === "Moderate" ? "中等" : it.pace === "Leisurely" ? "悠闲" : "紧凑"}
                  </span>
                </div>
                <h4 className="font-bold text-base mb-1.5 leading-snug">{it.title}</h4>
                <p className={`text-xs line-clamp-2 ${isSelected ? c.textColorSuperLight : "text-gray-500"}`}>
                  {it.description}
                </p>
                
                <div className="flex flex-wrap gap-1 mt-3">
                  {it.tags.map((tag, i) => (
                    <span
                      key={i}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${
                        isSelected ? "bg-white/10 text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Dynamic Budget Calculator Tool */}
        <div className={`${c.lightBgSemi} rounded-2xl p-5 border ${c.lightBorderSemi}`}>
          <div className="flex items-center gap-2 mb-3">
            <Banknote className={`h-4.5 w-4.5 ${c.textColorMid}`} />
            <h4 className={`font-bold text-sm ${c.textColorDark}`}>预计花费预算</h4>
          </div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-xs text-gray-600">游玩景点门票/往返估算:</span>
            <span className={`text-lg font-extrabold ${c.textColor}`}>
              约 {totalCost} 元人民币
            </span>
          </div>
          <p className={`text-[11px] leading-relaxed ${c.textColorMid}`}>
            *不含国际/国内大交通机票、酒店（约200-500元/晚）和餐饮（约50-100元/天）。所有费用均可在{activeCity === "hangzhou" ? "杭州" : activeCity === "shanghai" ? "上海" : "西安"}本地使用支付宝绑定境外信用卡轻松支付。
          </p>
        </div>
      </div>

      {/* Main Timeline details */}
      <div className="lg:col-span-8 bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="border-b border-gray-100 pb-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                {currentItinerary.title}
              </h3>
              <p className="text-xs text-gray-500 mt-1">{currentItinerary.description}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full text-xs font-mono text-gray-600">
              <Clock className={`h-3.5 w-3.5 ${c.textColorLight}`} />
              <span>{currentItinerary.duration}</span>
            </div>
          </div>
        </div>

        {/* Timeline stops list */}
        <div className={`relative border-l-2 ${c.lightBorder} ml-4 md:ml-6 pl-6 md:pl-8 space-y-8`}>
          {currentItinerary.stops.map((stop, index) => {
            const isActive = activeStopIndex === index;
            return (
              <div key={index} className="relative group">
                {/* Visual marker dot */}
                <button
                  onClick={() => setActiveStopIndex(index)}
                  className={`absolute -left-[35px] md:-left-[43px] top-1 flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isActive
                      ? `${c.primaryBg} ${c.primaryBorder} text-white scale-110 shadow-md ${c.shadowColorDark}`
                      : `bg-white ${c.borderMedium} ${c.textColorMid} ${c.borderHoverMedium} group-hover:scale-105`
                  }`}
                >
                  <span className="text-xs font-bold font-mono">{index + 1}</span>
                </button>

                {/* Stop content */}
                <div 
                  onClick={() => setActiveStopIndex(index)}
                  className={`cursor-pointer p-4 md:p-5 rounded-2xl border transition-all duration-200 ${
                    isActive
                      ? `${c.lightBgAlt} ${c.lightBorderAlt} shadow-xs`
                      : "border-transparent hover:bg-gray-50/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
                    <span className={`text-xs font-mono font-bold ${c.textColorMid} ${c.lightBg} px-2.5 py-0.5 rounded-full`}>
                      {stop.time}
                    </span>
                    <span className="text-xs font-mono text-gray-400 font-medium">
                      预估开销: {stop.cost}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-gray-950 flex items-center gap-1.5">
                    {stop.title}
                  </h4>

                  {/* Expandable details */}
                  <motion.div
                    initial={false}
                    animate={{ height: isActive ? "auto" : 0, opacity: isActive ? 1 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 text-sm text-gray-600 leading-relaxed space-y-3">
                      <p>{stop.description}</p>
                      
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin className={`h-3.5 w-3.5 ${c.textColorLight}`} />
                        <span><strong>精确位置:</strong> {stop.location}</span>
                      </div>

                      {/* Warning or tip section */}
                      {stop.tip.toLowerCase().includes("critical") || stop.tip.toLowerCase().includes("avoid") || stop.tip.includes("重要提示") || stop.tip.includes("避免") || stop.tip.includes("防坑") || stop.tip.includes("避雷") ? (
                        <div className="flex gap-2 bg-amber-50 border border-amber-100 text-amber-900 rounded-xl p-3.5 mt-2 text-xs">
                          <ShieldAlert className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold block text-amber-950 mb-0.5">防坑避雷提示：</strong>
                            {stop.tip}
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 ${c.lightBgAlt2} ${c.lightBorderAlt2} ${c.textColorDark} rounded-xl p-3.5 mt-2 text-xs bg-slate-50 border border-slate-100">
                          <Compass className={`h-4.5 w-4.5 ${c.textColorLight} shrink-0 mt-0.5`} />
                          <div>
                            <strong className="font-bold block text-gray-900 mb-0.5">向导专家建议：</strong>
                            {stop.tip}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {!isActive && (
                    <div className={`flex items-center gap-1 text-[11px] text-gray-400 mt-1 font-medium hover:${c.textColorMid}`}>
                      <span>查看路线详情与专家建议</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
