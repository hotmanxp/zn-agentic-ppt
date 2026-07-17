/**
 * SettingsView LLM tab — open platform login switch + protected fields.
 *
 * Strategy: render via react-dom/server and assert on the static
 * markup. Stub the settings store and PromptSettings so the test only
 * exercises the LLM form rendering logic. This avoids pulling in the
 * full antd DOM runtime.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Settings } from "../../../src/shared/types.js";
import { OPEN_PLATFORM_BASE_URL } from "../../../src/shared/types.js";

const store = vi.hoisted(() => ({
  settings: null as Settings | null,
  loaded: true,
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../../src/renderer/stores/settings.js", () => ({
  useSettingsStore: () => store,
}));
vi.mock("../../../src/renderer/components/PromptSettings.js", () => ({
  PromptSettings: () => null,
}));

import { SettingsView } from "../../../src/renderer/workbench/SettingsView.js";

function settings(useOpenPlatform: boolean): Settings {
  return {
    llm: {
      provider: "custom",
      baseUrl: "https://manual.example.com",
      apiKey: "manual-key",
      model: "model-a",
      useOpenPlatform,
    },
    ui: { theme: "light" },
    paths: { projectsDir: "/tmp/projects" },
  };
}

function control(markup: string, label: string): string {
  const match = markup.match(new RegExp(`<[^>]+aria-label="${label}"[^>]*>`));
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

describe("SettingsView LLM authentication mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps manual fields editable when open platform login is disabled", () => {
    store.settings = settings(false);
    const markup = renderToStaticMarkup(<SettingsView />);

    expect(control(markup, "API Base URL")).toContain('value="https://manual.example.com"');
    expect(control(markup, "API Base URL")).not.toContain("disabled");
    expect(control(markup, "API Key")).toContain('value="manual-key"');
    expect(control(markup, "API Key")).not.toContain("disabled");
  });

  it("shows fixed connection information without exposing manual or open tokens", () => {
    store.settings = settings(true);
    const markup = renderToStaticMarkup(<SettingsView />);

    expect(control(markup, "使用开放平台登录")).toContain('aria-checked="true"');
    expect(control(markup, "API Base URL")).toContain(`value="${OPEN_PLATFORM_BASE_URL}"`);
    expect(control(markup, "API Base URL")).toContain("disabled");
    expect(control(markup, "API Key")).toContain("disabled");
    expect(markup).toContain("读取自 ~/.nova/openAuth2.json");
    expect(markup).not.toContain("manual-key");
  });
});