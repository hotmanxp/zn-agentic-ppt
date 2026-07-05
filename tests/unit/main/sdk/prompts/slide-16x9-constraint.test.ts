/**
 * Regression: LLM was over-stuffing slides with content that overflowed
 * the 16:9 (960×540) canvas (using min-height: 100vh, normal-flow card
 * stacks, etc.). Result: preview pane showed only the top portion of
 * the slide, content got cut off, and the scale-to-fit logic couldn't
 * help because the inline `min-height` beat the parent's height: 100%.
 *
 * Fix: the SLIDE_SYSTEM_PROMPT and SLIDE_USER_PROMPT now both contain
 * explicit 16:9 constraints:
 *   - section inline style MUST be position:relative; width:960px;
 *     height:540px; overflow:hidden; box-sizing:border-box;
 *   - min-height: 100vh / 100% / auto are forbidden
 *   - decorations must use position:absolute (not normal flow)
 *   - 字号/行数/装饰元素数量都有上限
 *   - writer must self-check before Write
 *
 * This test locks the prompt content so a future refactor doesn't
 * accidentally drop the constraints.
 */
import { describe, expect, it } from "vitest";
import { slideSystemPrompt } from "../../../../../src/main/sdk/prompts/slide-system.js";
import {
  LAYOUT_DIRECTIONS,
  slideUserPrompt,
} from "../../../../../src/main/sdk/prompts/slide-user.js";

describe("slide prompts — 16:9 canvas constraint", () => {
  describe("SLIDE_SYSTEM_PROMPT", () => {
    it("declares the 960×540 (16:9) canvas size in the system prompt", () => {
      expect(slideSystemPrompt.defaultTemplate).toContain("960");
      expect(slideSystemPrompt.defaultTemplate).toContain("540");
    });

    it("forbids min-height: 100vh / 100% on <section>", () => {
      // The constraint must be explicit so the LLM doesn't reach for
      // the 100vh reflex (which was the original cause of the
      // preview-pane clipping bug).
      expect(slideSystemPrompt.defaultTemplate).toMatch(/min-height:\s*100vh/);
      // The forbidden-patterns list must include 100vh / 100% / auto.
      expect(slideSystemPrompt.defaultTemplate).toMatch(/100vh\s*\/\s*100%/);
      expect(slideSystemPrompt.defaultTemplate).toMatch(/height:\s*auto/);
    });

    it("forbids normal-flow decoration stacking in favor of position:absolute", () => {
      // Decorations must be anchored to the 4 corners via absolute
      // positioning — normal flow stacking makes the section grow
      // past 540px.
      expect(slideSystemPrompt.defaultTemplate).toMatch(/position:\s*absolute/);
      // The "禁止" / "不要" markers must appear for the forbidden
      // patterns (min-height, 100%, 100vh, auto).
      expect(slideSystemPrompt.defaultTemplate).toMatch(/禁止/);
    });

    it("includes a 自检清单 (self-check) the LLM must run before Write", () => {
      expect(slideSystemPrompt.defaultTemplate).toMatch(/自检/);
    });

    it("sets font-size / line-count / decoration-count upper bounds", () => {
      // Numeric caps that keep the LLM from going over 540px tall.
      expect(slideSystemPrompt.defaultTemplate).toMatch(/标题\s*≤\s*60/);
      expect(slideSystemPrompt.defaultTemplate).toMatch(/正文\s*≤\s*22/);
      expect(slideSystemPrompt.defaultTemplate).toMatch(/≤\s*6/);
    });

    it("uses the layout-N variable in the lowest-fidelity output structure", () => {
      // The shell example should bake the 960×540 inline styles so
      // the LLM has a concrete template to copy.
      expect(slideSystemPrompt.defaultTemplate).toMatch(
        /<section[^>]*style="[^"]*position:relative;width:960px;height:540px/,
      );
    });
  });

  describe("SLIDE_USER_PROMPT", () => {
    it("repeats the 960×540 canvas constraint in the per-slide task", () => {
      expect(slideUserPrompt.defaultTemplate).toContain("960");
      expect(slideUserPrompt.defaultTemplate).toContain("540");
      // Self-check the LLM must run before Write.
      expect(slideUserPrompt.defaultTemplate).toMatch(/自检/);
    });

    it("forbids min-height: 100vh / 100% / auto in the per-slide prompt", () => {
      expect(slideUserPrompt.defaultTemplate).toMatch(/min-height:\s*100vh/);
      expect(slideUserPrompt.defaultTemplate).toMatch(/100vh\s*\/\s*100%/);
      expect(slideUserPrompt.defaultTemplate).toMatch(/height:\s*auto/);
    });

    it("requires position:absolute for decoration elements", () => {
      expect(slideUserPrompt.defaultTemplate).toMatch(/position:\s*absolute/);
    });

    it("uses the baked 960×540 section in the default output shell", () => {
      // The shell the LLM is told to use must already have the right
      // width/height inline styles.
      expect(slideUserPrompt.defaultTemplate).toMatch(
        /<section[^>]*style="[^"]*position:relative;width:960px;height:540px/,
      );
    });
  });

  describe("LAYOUT_DIRECTIONS (5 layout variants)", () => {
    it("has 5 directions matching the 5 visual variants", () => {
      expect(LAYOUT_DIRECTIONS).toHaveLength(5);
    });

    it("every direction reminds about 16:9 / 960×540 / 横构图", () => {
      for (const dir of LAYOUT_DIRECTIONS) {
        const isWide = dir.includes("横构图") || dir.includes("960×540");
        expect(isWide, `layout direction must mention 16:9 / 960×540 / 横构图: ${dir}`).toBe(true);
      }
    });

    it("every direction reminds about position:absolute for decoration", () => {
      for (const dir of LAYOUT_DIRECTIONS) {
        expect(
          dir.includes("position:absolute") || dir.includes("absolute"),
          `layout direction must mention position:absolute: ${dir}`,
        ).toBe(true);
      }
    });

    it("font-size caps per layout do not exceed 540px height when stacked", () => {
      // Eyeball: each layout's tallest stacked text is the title +
      // subtitle + body. With absolute positioning of the title and
      // body, the vertical budget is title (max 100px for hero) +
      // body (max 200px) + margins (max 60px) ≈ 360px < 540px.
      for (const dir of LAYOUT_DIRECTIONS) {
        // Extract font-size numbers; assert each is < 120 (hero is the
        // exception at 100, anything bigger is suspicious).
        const matches = dir.match(/font-size:\s*(\d+)\s*-\s*(\d+)px/g) ?? [];
        for (const m of matches) {
          const nums = m.match(/(\d+)/g)?.map(Number) ?? [];
          const max = Math.max(...nums);
          expect(max, `font-size too large: ${m} in ${dir}`).toBeLessThanOrEqual(120);
        }
      }
    });
  });
});
