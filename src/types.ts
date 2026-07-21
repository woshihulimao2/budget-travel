export interface ItineraryStop {
  time: string;
  title: string;
  description: string;
  cost: string;
  tip: string;
  location: string;
}

export interface Itinerary {
  id: string;
  city?: string;
  title: string;
  duration: string;
  pace: "Leisurely" | "Moderate" | "Active";
  description: string;
  tags: string[];
  stops: ItineraryStop[];
}

/**
 * Scene tags — orthogonal to scamType/category.
 * Used to filter the 防坑指南 list by user context (买东西/吃饭/住宿/出行).
 * Database column `scams.scenes` is a JSON array of these.
 */
export type SceneTag = "Apparel" | "Food" | "Lodging" | "Transport";

export const SCENE_TAGS: SceneTag[] = ["Apparel", "Food", "Lodging", "Transport"];

export function isSceneTag(s: unknown): s is SceneTag {
  return typeof s === "string" && (SCENE_TAGS as string[]).includes(s);
}

export interface ScamInfo {
  id: string;
  city?: string;
  title: string;
  scamType: "Tea House" | "Fake Goods" | "Transport" | "Overcharging" | "Crowd Warning";
  dangerLevel: "High" | "Medium" | "Low";
  scenario: string;
  howItWorks: string;
  prevention: string;
  localProTip: string;
  /** Scene tags this scam applies to. Optional in older data; safe default = []. */
  scenes?: SceneTag[];
}

export interface SurvivalTip {
  category: "Payment" | "Internet" | "Transit" | "Apps" | "Visa";
  title: string;
  essential: boolean;
  steps: string[];
  tips: string;
}

export interface Phrase {
  category: "Essentials" | "Transit" | "Ordering" | "Emergency";
  english: string;
  chinese: string;
  pinyin: string;
  purpose: string;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamp: Date;
}

export interface CustomItineraryHistoryItem {
  id: string;
  timestamp: string;
  cities: string[];
  duration: string;
  budget: string;
  interests: string[];
  result: {
    summary: string;
    checklist: string[];
    customItinerary: Array<{
      day: string;
      city?: string;
      activities: Array<{
        time: string;
        title: string;
        description: string;
        cost: string;
        scamWarning?: string;
      }>;
    }>;
  };
}

