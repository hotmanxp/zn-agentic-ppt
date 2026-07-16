import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../src/main/fs/settings.js", () => ({
  getPromptOverride: vi.fn(),
}));

import { getPromptOverride } from "../../../../../src/main/fs/settings.js";
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
    expect(PROMPT_SPECS.length).toBe(5);
  });
});
