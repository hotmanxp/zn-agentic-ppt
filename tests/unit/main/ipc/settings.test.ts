import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../../../src/shared/types.js";
import { IPC } from "../../../../src/shared/ipc-channels.js";

const handlers = new Map<string, Function>();
const fsMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getPromptOverride: vi.fn(),
  setPromptOverride: vi.fn(),
  resetPromptOverride: vi.fn(),
  listPromptOverrides: vi.fn(),
}));
const connectionMock = vi.hoisted(() => vi.fn());
const setOpenPlatformEnabledMock = vi.hoisted(() => vi.fn());
const withOpenPlatformModeMock = vi.hoisted(() =>
  vi.fn(async (_enabled: boolean, run: () => Promise<unknown>) => run()),
);

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
  ipcMain: { handle: (channel: string, handler: Function) => handlers.set(channel, handler) },
}));
vi.mock("../../../../src/main/fs/settings.js", () => fsMocks);
vi.mock("../../../../src/main/sdk/connection.js", () => ({
  testLLMConnection: connectionMock,
}));
vi.mock("../../../../src/main/sdk/zai-bridge.js", () => ({
  setOpenPlatformEnabled: setOpenPlatformEnabledMock,
  withOpenPlatformMode: withOpenPlatformModeMock,
}));

import { registerSettingsIPC } from "../../../../src/main/ipc/settings.js";

const candidate: Settings = {
  llm: {
    provider: "custom",
    baseUrl: "https://manual.example.com",
    apiKey: "manual-key",
    model: "model-a",
    useOpenPlatform: true,
  },
  ui: { theme: "light" },
  paths: { projectsDir: "/tmp/projects" },
};

describe("settings IPC", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    fsMocks.setSettings.mockResolvedValue(undefined);
    connectionMock.mockResolvedValue({ ok: true });
    registerSettingsIPC();
  });

  it("updates the process mode only after persisting settings", async () => {
    const handler = handlers.get(IPC.SETTINGS_SET);
    expect(handler).toBeDefined();

    await handler?.({}, { settings: candidate });

    expect(fsMocks.setSettings).toHaveBeenCalledWith(candidate);
    expect(setOpenPlatformEnabledMock).toHaveBeenCalledWith(true);
    expect(fsMocks.setSettings.mock.invocationCallOrder[0]).toBeLessThan(
      setOpenPlatformEnabledMock.mock.invocationCallOrder[0],
    );
  });

  it("tests the current form in an isolated open platform mode", async () => {
    const handler = handlers.get(IPC.SETTINGS_TEST_CONNECTION);
    expect(handler).toBeDefined();

    await handler?.({}, { settings: candidate });

    expect(withOpenPlatformModeMock).toHaveBeenCalledWith(true, expect.any(Function));
    expect(connectionMock).toHaveBeenCalledWith(candidate);
    expect(fsMocks.getSettings).not.toHaveBeenCalled();
  });
});
