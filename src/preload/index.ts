import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels.js'

const api = {
  project: {
    list: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC.PROJECT_GET, { id }),
    create: (topic: string) => ipcRenderer.invoke(IPC.PROJECT_CREATE, { topic }),
    update: (id: string, patch: any) => ipcRenderer.invoke(IPC.PROJECT_UPDATE, { id, patch }),
    delete: (id: string) => ipcRenderer.invoke(IPC.PROJECT_DELETE, { id }),
    duplicate: (id: string) => ipcRenderer.invoke(IPC.PROJECT_DUPLICATE, { id }),
    rename: (id: string, title: string) => ipcRenderer.invoke(IPC.PROJECT_RENAME, { id, title }),
    reveal: (id: string) => ipcRenderer.invoke(IPC.PROJECT_REVEAL, { id }),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (settings: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, { settings }),
    testConnection: () => ipcRenderer.invoke(IPC.SETTINGS_TEST_CONNECTION),
  },
  system: {
    userDataPath: () => ipcRenderer.invoke(IPC.SYSTEM_USER_DATA_PATH),
  },
  generation: {
    start: (id: string, opts?: any) => ipcRenderer.invoke(IPC.GENERATION_START, { id, opts }),
    cancel: (runId: string) => ipcRenderer.invoke(IPC.GENERATION_CANCEL, { runId }),
    onEvent: (cb: (e: any) => void) => subscribe(IPC.SDK_EVENT, cb),
    onProgress: (cb: (e: any) => void) => subscribe(IPC.GENERATION_PROGRESS, cb),
    onDone: (cb: (e: any) => void) => subscribe(IPC.GENERATION_DONE, cb),
    onError: (cb: (e: any) => void) => subscribe(IPC.GENERATION_ERROR, cb),
  },
}

function subscribe(channel: string, cb: (e: any) => void): () => void {
  const listener = (_: unknown, payload: any) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
