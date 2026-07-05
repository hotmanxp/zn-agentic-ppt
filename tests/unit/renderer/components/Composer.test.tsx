/**
 * Composer regression test — Bug UI-C.
 *
 * The "重新生成大纲" button in the outline-decision card used to be a
 * fake: its onClick was `() => setToast("已重新生成一版大纲")` and never
 * actually triggered an outline regeneration. After the fix it calls
 * the `onRegenerateOutline` prop, which Workbench.tsx wires to
 * `useWorkbenchStore.getState().approveSources(id)`.
 *
 * Strategy: drive the Composer with a stub store and stub antd, render
 * via react-dom/server, then read the rendered HTML to find the
 * "重新生成大纲" button. We then assert the source code's wiring
 * (via a small grep) so that this test catches future regressions
 * where someone re-introduces the setToast hack.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ---- Store stub ------------------------------------------------------------
const storeState: any = {
  phase: "outline",
  prompt: "",
  setPrompt: vi.fn(),
  submitPrompt: vi.fn(async () => undefined),
  sourceMenuOpen: false,
  setSourceMenuOpen: vi.fn(),
  selectedSources: [],
  toggleSource: vi.fn(),
  uploadMaterials: vi.fn(),
  setToast: vi.fn(),
  uploadedSources: [],
};

vi.mock("../../../../src/renderer/stores/workbench.js", () => ({
  useWorkbenchStore: (selector: any) => selector(storeState),
}));

vi.mock("antd", () => ({
  Button: ({ children, onClick, disabled, ...rest }: any) =>
    createElement(
      "button",
      { onClick, disabled, "data-testid": rest["aria-label"] ?? "btn" },
      children,
    ),
  Checkbox: { Group: () => null },
  Radio: { Group: () => null },
  Modal: () => null,
}));

vi.mock("../../../../src/renderer/stores/pptGeneration.js", () => ({
  usePptGenerationStore: { getState: () => ({ cancel: vi.fn() }) },
}));
vi.mock("../../../../src/renderer/stores/stageStream.js", () => ({
  useStageStreamStore: { getState: () => ({ cancel: vi.fn() }) },
}));
vi.mock("../../../../src/renderer/workbench/data/sources.js", () => ({
  KNOWN_SOURCES: [],
}));

import { Composer } from "../../../../src/renderer/workbench/Composer.js";

beforeEach(() => {
  storeState.phase = "outline";
  storeState.prompt = "";
  storeState.setToast.mockClear();
});

describe("Composer — outline-decision card (Bug UI-C regression)", () => {
  it("renders the 重新生成大纲 button when phase=outline", () => {
    const html = renderToStaticMarkup(
      <Composer
        onApproveSources={vi.fn()}
        onApproveOutline={vi.fn()}
        onRegenerateOutline={vi.fn()}
      />,
    );
    expect(html).toContain("重新生成大纲");
    expect(html).toContain("确认大纲，开始生成");
  });

  it("does NOT render the 重新生成大纲 button in other phases", () => {
    storeState.phase = "complete";
    const html = renderToStaticMarkup(
      <Composer
        onApproveSources={vi.fn()}
        onApproveOutline={vi.fn()}
        onRegenerateOutline={vi.fn()}
      />,
    );
    expect(html).not.toContain("重新生成大纲");
  });

  it("renders a 按修改要求重生成 button only when prompt is non-empty", () => {
    storeState.prompt = "";
    let html = renderToStaticMarkup(
      <Composer
        onApproveSources={vi.fn()}
        onApproveOutline={vi.fn()}
        onRegenerateOutline={vi.fn()}
      />,
    );
    expect(html).not.toContain("按修改要求重生成");

    storeState.prompt = "请增加一页总结";
    html = renderToStaticMarkup(
      <Composer
        onApproveSources={vi.fn()}
        onApproveOutline={vi.fn()}
        onRegenerateOutline={vi.fn()}
      />,
    );
    expect(html).toContain("按修改要求重生成");
  });
});

describe("Composer — source-level regression (catches the setToast hack)", () => {
  // Read the source once. If the file is ever restructured, the
  // assertions below will fail loudly and we'll know to update them.
  const composerPath = resolve(
    process.cwd(),
    "src/renderer/workbench/Composer.tsx",
  );
  const src = readFileSync(composerPath, "utf8");

  it("the 重新生成大纲 button onClick is wired to onRegenerateOutline (not setToast)", () => {
    // The buggy line used to look like:
    //   <button className="secondary-action" onClick={() => setToast("已重新生成一版大纲")}>
    //     重新生成大纲
    //   </button>
    // The fix wires it to the onRegenerateOutline prop. We assert the
    // exact line is gone and the new wiring is in place.
    expect(src).not.toMatch(
      /onClick=\{\(\)\s*=>\s*setToast\(\s*["']已重新生成一版大纲["']\s*\)\}/,
    );
    // The new wiring must exist somewhere in the file.
    expect(src).toMatch(/onClick=\{onRegenerateOutline\}/);
    // And the prop must be destructured at the function signature.
    // (Multi-line destructure with type annotations, so use a permissive
    // pattern that just looks for the name within the function signature.)
    const sigMatch = /function Composer\([\s\S]*?\)/.exec(src);
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![0]).toMatch(/onRegenerateOutline/);
  });

  it("ComposerProps declares onRegenerateOutline as a required prop", () => {
    // The type definition must include onRegenerateOutline; otherwise
    // a future refactor that drops the prop will silently break the
    // outline-decision card.
    expect(src).toMatch(/onRegenerateOutline:\s*\(\)\s*=>\s*void/);
  });
});
