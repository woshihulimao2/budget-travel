import { useCallback, useEffect, useRef, useState } from "react";
import { ITINERARIES, SCAMS } from "./data";
import type { Itinerary, ScamInfo } from "./types";

// ---------------------------------------------------------------------------
// Token storage + authed fetch wrapper
// ---------------------------------------------------------------------------
const TOKEN_KEY = "auth_access_token";
const REFRESH_KEY = "auth_refresh_token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string) {
  try {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* ignore */
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refresh = getRefreshToken();
  if (!refresh) return false;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function authedFetch(
  input: string,
  init: RequestInit = {},
  opts: { retryOn401?: boolean } = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res = await fetch(input, { ...init, headers });
  if (res.status === 401 && opts.retryOn401 !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const headers2 = new Headers(init.headers || {});
      if (!headers2.has("Content-Type") && init.body) {
        headers2.set("Content-Type", "application/json");
      }
      headers2.set("Authorization", `Bearer ${getAccessToken()}`);
      res = await fetch(input, { ...init, headers: headers2 });
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Curated content hooks (DB first, fall back to src/data.ts)
// ---------------------------------------------------------------------------
const itineraryCache = new Map<string, { ts: number; data: Itinerary[] }>();
const scamCache = new Map<string, { ts: number; data: ScamInfo[] }>();
const HOOK_CACHE_TTL = 60_000;

export function useItineraries(city: string | undefined): {
  data: Itinerary[];
  loading: boolean;
  source: "db" | "static";
} {
  const [data, setData] = useState<Itinerary[]>(() =>
    city ? ITINERARIES.filter((it) => it.city === city) : ITINERARIES
  );
  const [source, setSource] = useState<"db" | "static">("static");
  const [loading, setLoading] = useState(false);
  const cityRef = useRef(city);
  cityRef.current = city;

  const fetchData = useCallback(async () => {
    const c = cityRef.current || "";
    const cached = itineraryCache.get(c);
    if (cached && Date.now() - cached.ts < HOOK_CACHE_TTL) {
      setData(cached.data);
      setSource("db");
      return;
    }
    setLoading(true);
    try {
      const url = c ? `/api/itineraries?city=${encodeURIComponent(c)}` : "/api/itineraries";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const list: Itinerary[] = (payload.itineraries || []).map((it: any) => ({
        id: it.id,
        city: it.city,
        title: it.title,
        duration: it.duration,
        pace: it.pace || "Moderate",
        description: it.description,
        tags: it.tags || [],
        stops: (it.stops || []).map((s: any) => ({
          time: s.time || "",
          title: s.title || "",
          description: s.description || "",
          cost: s.cost || "",
          tip: s.tip || "",
          location: s.location || "",
        })),
      }));
      if (list.length > 0) {
        itineraryCache.set(c, { ts: Date.now(), data: list });
        setData(list);
        setSource("db");
      } else {
        // DB has no entries for this city — keep static fallback
        setData(c ? ITINERARIES.filter((it) => it.city === c) : ITINERARIES);
        setSource("static");
      }
    } catch {
      setData(c ? ITINERARIES.filter((it) => it.city === c) : ITINERARIES);
      setSource("static");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [city, fetchData]);

  return { data, loading, source };
}

export function useScams(city: string | undefined): {
  data: ScamInfo[];
  loading: boolean;
  source: "db" | "static";
} {
  const [data, setData] = useState<ScamInfo[]>(() =>
    city ? SCAMS.filter((s) => s.city === city) : SCAMS
  );
  const [source, setSource] = useState<"db" | "static">("static");
  const [loading, setLoading] = useState(false);
  const cityRef = useRef(city);
  cityRef.current = city;

  const fetchData = useCallback(async () => {
    const c = cityRef.current || "";
    const cached = scamCache.get(c);
    if (cached && Date.now() - cached.ts < HOOK_CACHE_TTL) {
      setData(cached.data);
      setSource("db");
      return;
    }
    setLoading(true);
    try {
      const url = c ? `/api/scams?city=${encodeURIComponent(c)}` : "/api/scams";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const list: ScamInfo[] = (payload.scams || []).map((s: any) => ({
        id: s.id,
        city: s.city,
        title: s.title,
        scamType: s.scamType,
        dangerLevel: s.dangerLevel,
        scenario: s.scenario,
        howItWorks: s.howItWorks,
        prevention: s.prevention,
        localProTip: s.localProTip,
        scenes: Array.isArray(s.scenes)
          ? s.scenes.filter((t: unknown) => typeof t === "string")
          : [],
      }));
      if (list.length > 0) {
        scamCache.set(c, { ts: Date.now(), data: list });
        setData(list);
        setSource("db");
      } else {
        setData(c ? SCAMS.filter((s) => s.city === c) : SCAMS);
        setSource("static");
      }
    } catch {
      setData(c ? SCAMS.filter((s) => s.city === c) : SCAMS);
      setSource("static");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [city, fetchData]);

  return { data, loading, source };
}

export function clearCuratedCache() {
  itineraryCache.clear();
  scamCache.clear();
}