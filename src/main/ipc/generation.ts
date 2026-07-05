import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import { getProjectDir } from "../fs/paths.js";
import * as fs from "../fs/projects.js";
import * as settingsFs from "../fs/settings.js";
import { GenerationRunner } from "../sdk/runner.js";

const activeRunners = new Map<string, GenerationRunner>();

export function registerGenerationIPC(): void {
  ipcMain.handle(IPC.GENERATION_START, async (_, { id, opts }: { id: string; opts?: any }) => {
    const project = await fs.getProject(id);
    if (!project) throw new Error("project not found");
    const settings = await settingsFs.getSettings();
    const runId = randomUUID();
    const runner = new GenerationRunner({
      cwd: getProjectDir(id),
      topic: project.topic,
      outline: project.outline,
      settings,
      runId,
      onEvent: (msg) => broadcast(IPC.SDK_EVENT, { runId, message: msg }),
      onProgress: (info) => broadcast(IPC.GENERATION_PROGRESS, { runId, ...info }),
      onDone: async ({ html, durationMs }) => {
        await fs.writeProjectHtml(id, html);
        await fs.setProjectStatus(id, "generated");
        broadcast(IPC.GENERATION_DONE, { runId, html, durationMs });
        activeRunners.delete(runId);
      },
      onError: async ({ error }) => {
        await fs.setProjectStatus(id, "failed", error.message);
        broadcast(IPC.GENERATION_ERROR, { runId, error });
        activeRunners.delete(runId);
      },
    });
    activeRunners.set(runId, runner);
    await fs.setProjectStatus(id, "draft");
    runner.run(); // fire-and-forget
    return { runId };
  });

  ipcMain.handle(IPC.GENERATION_CANCEL, (_, { runId }: { runId: string }) => {
    const r = activeRunners.get(runId);
    r?.interrupt();
    activeRunners.delete(runId);
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}
