/**
 * Regression: the "重新生成此页" button in slide-navigation was
 * invisible when not hovered because `.slide-navigation button` set
 * `width: 28px; height: 28px; padding: 0; background: white;` —
 * sizing/colors for the small icon arrow buttons — and that rule
 * applied to ALL buttons in slide-navigation, including the
 * primary-action "重新生成此页" button which has its own bigger
 * dimensions and dark fill.
 *
 * The fix: scope the small-icon selector to
 * `.slide-navigation button:not(.primary-action)` so the
 * primary-action button is exempt.
 *
 * We assert the source file uses the :not() selector so a future
 * refactor doesn't reintroduce the bug.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("slide-navigation CSS — primary-action exemption", () => {
  it("`.slide-navigation button` selector excludes .primary-action", () => {
    const cssPath = resolve(
      __dirname,
      "../../../../src/renderer/styles/workbench.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/\.slide-navigation\s+button:not\(\.primary-action\)\s*\{/);
    // Negative: the broad `.slide-navigation button {` (without :not)
    // should NOT be present, as that was the original bug.
    expect(css).not.toMatch(/^\.slide-navigation\s+button\s*\{/m);
  });
});
