import { describe, it, expect } from "vitest";
import {
  deriveScenes,
  SCAM_TYPE_TO_SCENES,
  isSceneTag,
} from "../../safety/sceneDerivation";

describe("deriveScenes — explicit scenes take priority", () => {
  it("uses explicitScenes when non-empty", () => {
    const out = deriveScenes({
      scamType: "Transport",
      category: "黑车",
      explicitScenes: ["Lodging", "Transport"],
    });
    // Both tags honored, dedup not strictly required
    expect(out).toEqual(expect.arrayContaining(["Lodging", "Transport"]));
    expect(out.length).toBe(2);
  });

  it("accepts Chinese labels in explicitScenes", () => {
    const out = deriveScenes({ explicitScenes: ["美食", "衣服"] });
    expect(out).toEqual(expect.arrayContaining(["Food", "Apparel"]));
  });

  it("ignores unknown tags in explicitScenes", () => {
    const out = deriveScenes({ explicitScenes: ["Banana", "Food"] });
    expect(out).toEqual(["Food"]);
  });

  it("dedups repeated tags", () => {
    const out = deriveScenes({ explicitScenes: ["Food", "美食", "Food"] });
    expect(out).toEqual(["Food"]);
  });

  it("returns [] if explicit list empty AND no scamType / category", () => {
    expect(deriveScenes({})).toEqual([]);
    expect(deriveScenes({ explicitScenes: [] })).toEqual([]);
    expect(deriveScenes({ explicitScenes: ["Banana"] })).toEqual([]);
  });
});

describe("deriveScenes — scamType heuristic", () => {
  it("Tea House → Food", () => {
    expect(deriveScenes({ scamType: "Tea House" })).toEqual(["Food"]);
  });

  it("Fake Goods → Apparel", () => {
    expect(deriveScenes({ scamType: "Fake Goods" })).toEqual(["Apparel"]);
  });

  it("Transport → Transport", () => {
    expect(deriveScenes({ scamType: "Transport" })).toEqual(["Transport"]);
  });

  it("Overcharging → Food + Lodging", () => {
    const out = deriveScenes({ scamType: "Overcharging" });
    expect(out).toEqual(expect.arrayContaining(["Food", "Lodging"]));
    expect(out.length).toBe(2);
  });

  it("Crowd Warning → Transport", () => {
    expect(deriveScenes({ scamType: "Crowd Warning" })).toEqual(["Transport"]);
  });

  it("unknown scamType falls through to category layer", () => {
    const out = deriveScenes({ scamType: "MadeUp", category: "黑车拉客" });
    expect(out).toEqual(["Transport"]);
  });
});

describe("deriveScenes — category text fallback", () => {
  it("matches 丝绸 → Apparel", () => {
    expect(deriveScenes({ category: "假冒丝绸" })).toEqual(["Apparel"]);
  });

  it("matches 黑车 → Transport", () => {
    expect(deriveScenes({ category: "交通黑车" })).toEqual(["Transport"]);
  });

  it("matches 茶托 → Food", () => {
    expect(deriveScenes({ category: "茶托/酒托" })).toEqual(["Food"]);
  });

  it("matches 民宿 → Lodging", () => {
    expect(deriveScenes({ category: "民宿照骗" })).toEqual(["Lodging"]);
  });

  it("returns [] when nothing matches", () => {
    expect(deriveScenes({ category: "完全无关" })).toEqual([]);
  });
});

describe("deriveScenes — precedence rules", () => {
  it("explicit > scamType > category", () => {
    // explicit wins over scamType and category text
    const out = deriveScenes({
      scamType: "Fake Goods",
      category: "黑车",
      explicitScenes: ["Lodging"],
    });
    expect(out).toEqual(["Lodging"]);
  });

  it("scamType > category when no explicit", () => {
    const out = deriveScenes({
      scamType: "Fake Goods",
      category: "黑车", // would otherwise yield Transport
    });
    expect(out).toEqual(["Apparel"]);
  });
});

describe("SCAM_TYPE_TO_SCENES — sanity check", () => {
  it("covers every known scamType", () => {
    const expected = ["Tea House", "Fake Goods", "Transport", "Overcharging", "Crowd Warning"];
    for (const t of expected) {
      expect(SCAM_TYPE_TO_SCENES[t]).toBeDefined();
      expect(SCAM_TYPE_TO_SCENES[t].length).toBeGreaterThan(0);
    }
  });
});

describe("isSceneTag", () => {
  it("accepts enum names", () => {
    expect(isSceneTag("Food")).toBe(true);
    expect(isSceneTag("Apparel")).toBe(true);
    expect(isSceneTag("Lodging")).toBe(true);
    expect(isSceneTag("Transport")).toBe(true);
  });
  it("rejects unknown strings", () => {
    expect(isSceneTag("Banana")).toBe(false);
    expect(isSceneTag("")).toBe(false);
    expect(isSceneTag(null)).toBe(false);
    expect(isSceneTag(undefined)).toBe(false);
    expect(isSceneTag(42)).toBe(false);
  });
});