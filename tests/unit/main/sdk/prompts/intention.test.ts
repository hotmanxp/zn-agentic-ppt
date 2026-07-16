import { describe, expect, test } from "vitest";
import { intentSchema } from "../../../../../src/shared/intent.js";

describe("INTENTION_PROMPT example output", () => {
  test("sample matches schema", () => {
    const sample = {
      audience: { profile: "区域银行负责人", expertise: "熟手", concerns: ["ROI", "合规"] },
      goal_decomposition: { primary: "推进试点合作", secondary: ["建立信任"] },
      tone: "professional",
      constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
      must_cover_points: ["价值主张", "落地路径"],
      forbidden: ["竞品对比"],
      narrative_arc: "背景→痛点→方案→证据→行动",
    };
    expect(() => intentSchema.parse(sample)).not.toThrow();
  });

  test("invalid tone rejected", () => {
    const bad = {
      audience: { profile: "x", expertise: "新手", concerns: [] },
      goal_decomposition: { primary: "x", secondary: [] },
      tone: "aggressive",
      constraints: { duration: "10 min", pages: 5, language: "zh-CN" },
      must_cover_points: [],
      forbidden: [],
      narrative_arc: "x",
    };
    expect(() => intentSchema.parse(bad)).toThrow();
  });

  test("negative pages rejected", () => {
    const bad = {
      audience: { profile: "x", expertise: "新手", concerns: [] },
      goal_decomposition: { primary: "x", secondary: [] },
      tone: "professional",
      constraints: { duration: "10 min", pages: -1, language: "zh-CN" },
      must_cover_points: [],
      forbidden: [],
      narrative_arc: "x",
    };
    expect(() => intentSchema.parse(bad)).toThrow();
  });
});
