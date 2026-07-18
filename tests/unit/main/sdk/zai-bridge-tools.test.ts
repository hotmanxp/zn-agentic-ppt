import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

import { SUB_AGENT_TOOLS, PARENT_AGENT_TOOLS } from "../../../../src/main/sdk/zai-bridge.js";

function toolNames(tools: { name: string }[]): string[] {
  return tools.map((t) => t.name).sort();
}

describe("zai-bridge tool sets", () => {
  it("SUB_AGENT_TOOLS contains read/write/edit/glob/grep but no Agent", () => {
    expect(toolNames(SUB_AGENT_TOOLS)).toEqual(
      ["Edit", "Glob", "Grep", "Read", "Write"].sort(),
    );
  });

  it("PARENT_AGENT_TOOLS contains read/glob/grep/agent but no write/edit", () => {
    expect(toolNames(PARENT_AGENT_TOOLS)).toEqual(
      ["Agent", "Glob", "Grep", "Read"].sort(),
    );
  });
});
