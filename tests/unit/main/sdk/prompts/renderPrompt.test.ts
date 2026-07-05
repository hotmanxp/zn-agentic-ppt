import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../src/main/fs/settings.js", () => ({
  getPromptOverride: vi.fn(),
}));

import { getPromptOverride } from "../../../../../src/main/fs/settings.js";
import { briefOptimizePrompt } from "../../../../../src/main/sdk/prompts/brief-optimize.js";
import { PROMPT_SPECS, getSpec, renderPrompt } from "../../../../../src/main/sdk/prompts/index.js";

const mockGetPromptOverride = getPromptOverride as unknown as ReturnType<typeof vi.fn>;

describe("renderPrompt", () => {
  beforeEach(() => mockGetPromptOverride.mockReset());

  it("uses default template when no override set", async () => {
    mockGetPromptOverride.mockResolvedValue(null);
    const out = await renderPrompt("OUTLINE_PROMPT", {
      briefMarkdown: "# X\n\n## 演讲对象和场景\nY",
    });
    expect(out).toContain("X");
    expect(out).toContain("Y");
  });

  it("uses override template when set", async () => {
    mockGetPromptOverride.mockResolvedValue("CUSTOM {{briefMarkdown}}");
    const out = await renderPrompt("OUTLINE_PROMPT", {
      briefMarkdown: "# Z",
    });
    expect(out).toBe("CUSTOM # Z");
  });

  it("throws on unknown prompt id", async () => {
    await expect(renderPrompt("nonexistent", {})).rejects.toThrowError(/未知 prompt/);
  });

  it("throws when caller omits a variable", async () => {
    mockGetPromptOverride.mockResolvedValue(null);
    await expect(renderPrompt("OUTLINE_PROMPT", {})).rejects.toThrowError(/缺值/);
  });

  it("getSpec returns registered spec", () => {
    expect(getSpec("OUTLINE_PROMPT")).not.toBeNull();
    expect(PROMPT_SPECS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("brief-optimize prompt", () => {
  it("declares source and hintJson variables only", () => {
    const names = briefOptimizePrompt.variables.map((v) => v.name);
    expect(names).toEqual(["source", "hintJson"]);
  });
  it("instructs agent to output a bare JSON object for asking (no XML wrapper)", () => {
    const t = briefOptimizePrompt.defaultTemplate;
    // must reference bare {"questions": ...} JSON shape
    expect(t).toMatch(/\{\s*"questions"/);
    // must NOT demonstrate <briefaskuser>...</briefaskuser> as the output
    // shape (only allowed to mention it as a "don't do this" warning).
    expect(t).not.toMatch(/<briefaskuser>[\s\S]*?<\/briefaskuser>/);
  });
  it("lists 5 output fields as markdown sections", () => {
    const t = briefOptimizePrompt.defaultTemplate;
    expect(t).toMatch(/\bname\b/);
    expect(t).toMatch(/\baudience\b/);
    expect(t).toMatch(/\bdurationMinutes\b/);
    expect(t).toMatch(/\bcontent\b/);
    expect(t).toMatch(/\bstyle\b/);
  });
  it("specifies markdown output (h1 for name, h2 for fields)", () => {
    const t = briefOptimizePrompt.defaultTemplate;
    // prompt must reference `#` and `##` markdown headings
    expect(t).toMatch(/#\s/);
    expect(t).toMatch(/##\s/);
    // prompt caps rounds
    expect(t).toMatch(/2 轮/);
  });
});
