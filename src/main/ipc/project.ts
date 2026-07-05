import { ipcMain, shell } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import { getProjectDir } from "../fs/paths.js";
import * as fs from "../fs/projects.js";

export function registerProjectIPC(): void {
  ipcMain.handle(IPC.PROJECT_LIST, () => fs.listProjects());
  ipcMain.handle(IPC.PROJECT_GET, (_, { id }: { id: string }) => fs.getProject(id));
  ipcMain.handle(IPC.PROJECT_DETAIL, (_, { id }: { id: string }) => fs.getProject(id));
  ipcMain.handle(IPC.PROJECT_CREATE, (_, { topic }: { topic: string }) => fs.createProject(topic));
  ipcMain.handle(IPC.PROJECT_UPDATE, (_, { id, patch }: { id: string; patch: any }) =>
    fs.updateProject(id, patch),
  );
  ipcMain.handle(IPC.PROJECT_DELETE, async (_, { id }: { id: string }) => {
    await fs.deleteProject(id);
  });
  ipcMain.handle(IPC.PROJECT_DUPLICATE, async (_, { id }: { id: string }) => {
    const src = await fs.getProject(id);
    if (!src) throw new Error("not found");
    const copy = await fs.createProject(src.topic);
    await fs.updateProject(copy.id, { title: src.title + " (copy)", outline: src.outline });
    return fs.getProject(copy.id);
  });
  ipcMain.handle(IPC.PROJECT_RENAME, async (_, { id, title }: { id: string; title: string }) => {
    await fs.updateProject(id, { title });
  });
  ipcMain.handle(IPC.PROJECT_REVEAL, async (_, { id }: { id: string }) => {
    shell.openPath(getProjectDir(id));
  });
}
