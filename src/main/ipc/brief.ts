import { BrowserWindow, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type { AppError, ProjectBrief } from "../../shared/types.js";
import * as outlineFs from "../fs/outline.js";
import { getProjectDir } from "../fs/paths.js";
import * as projectFs from "../fs/projects.js";
import * as settingsFs from "../fs/settings.js";
import { type AskAnswer, type AskUserRequest, BriefAgent } from "../sdk/agents/briefAgent.js";

let activeAgent: BriefAgent | null = null;

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

export function registerBriefIPC(): void {
  ipcMain.handle(
    IPC.STAGE_BRIEF_OPTIMIZE_START,
    async (_, { id, hint }: { id: string; hint: ProjectBrief | null }) => {
      if (activeAgent) throw new Error("已有优化任务在跑,请先取消或等待完成");
      const settings = await settingsFs.getSettings();
      const source = await outlineFs.readSource(id);
      const cwd = getProjectDir(id);
      activeAgent = new BriefAgent({
        cwd,
        settings,
        source,
        hint,
        onQuestion: (q: AskUserRequest) =>
          broadcast(IPC.STAGE_ASK_USER_QUESTION, { projectId: id, ...q }),
        onDone: (brief: ProjectBrief) => {
          broadcast(IPC.STAGE_BRIEF_OPTIMIZE_DONE, { projectId: id, brief });
          activeAgent = null;
        },
        onError: (e: AppError) => {
          broadcast(IPC.STAGE_BRIEF_OPTIMIZE_ERROR, { projectId: id, error: e });
          activeAgent = null;
        },
      });
      await activeAgent.run();
      return { ok: true };
    },
  );

  ipcMain.handle(IPC.STAGE_BRIEF_OPTIMIZE_CANCEL, async () => {
    if (activeAgent) {
      activeAgent.cancel();
      activeAgent = null;
    }
    return { ok: true };
  });

  ipcMain.handle(
    IPC.STAGE_BRIEF_OPTIMIZE_ANSWER,
    async (_, { qid, value }: { qid: string; value: AskAnswer }) => {
      activeAgent?.answer(qid, value);
      return { ok: true };
    },
  );
}
