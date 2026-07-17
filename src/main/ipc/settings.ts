import { app, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type { Settings } from "../../shared/types.js";
import * as fs from "../fs/settings.js";
import { testLLMConnection } from "../sdk/connection.js";
import { PROMPT_SPECS } from "../sdk/prompts/index.js";
import {
  setOpenPlatformEnabled,
  withOpenPlatformMode,
} from "../sdk/zai-bridge.js";

export function registerSettingsIPC(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => fs.getSettings());
  ipcMain.handle(
    IPC.SETTINGS_SET,
    async (_, { settings }: { settings: Settings }) => {
      await fs.setSettings(settings);
      setOpenPlatformEnabled(settings.llm.useOpenPlatform);
    },
  );
  ipcMain.handle(
    IPC.SETTINGS_TEST_CONNECTION,
    async (_, { settings }: { settings: Settings }) =>
      withOpenPlatformMode(settings.llm.useOpenPlatform, () =>
        testLLMConnection(settings),
      ),
  );
  ipcMain.handle(IPC.SETTINGS_PROMPT_GET, async (_, { id }: { id: string }) =>
    fs.getPromptOverride(id),
  );
  ipcMain.handle(
    IPC.SETTINGS_PROMPT_SET,
    async (_, { id, template }: { id: string; template: string }) => {
      await fs.setPromptOverride(id, template);
    },
  );
  ipcMain.handle(IPC.SETTINGS_PROMPT_RESET, async (_, { id }: { id: string }) => {
    await fs.resetPromptOverride(id);
  });
  ipcMain.handle(IPC.SETTINGS_PROMPT_LIST, async () => fs.listPromptOverrides());
  ipcMain.handle(IPC.SETTINGS_PROMPT_LIST_SPECS, () => PROMPT_SPECS);
  ipcMain.handle(IPC.SYSTEM_USER_DATA_PATH, () => app.getPath("userData"));
}
