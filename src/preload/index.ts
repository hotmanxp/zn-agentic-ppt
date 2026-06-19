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
    detail: (id: string) => ipcRenderer.invoke(IPC.PROJECT_DETAIL, { id }),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (settings: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, { settings }),
    testConnection: () => ipcRenderer.invoke(IPC.SETTINGS_TEST_CONNECTION),
    prompts: {
      get: (id: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_GET, { id }),
      set: (id: string, template: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_SET, { id, template }),
      reset: (id: string) => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_RESET, { id }),
      list: () => ipcRenderer.invoke(IPC.SETTINGS_PROMPT_LIST),
    },
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
  stage: {
    collectSave: (id: string, topic: string, source: string) =>
      ipcRenderer.invoke(IPC.STAGE_COLLECT_SAVE, { id, topic, source }),
    outlineGenerate: (id: string) =>
      ipcRenderer.invoke(IPC.STAGE_OUTLINE_GENERATE, { id }),
    outlineRead: (id: string) =>
      ipcRenderer.invoke(IPC.STAGE_OUTLINE_READ, { id }),
    outlineUpdate: (id: string, slideId: string, patch: any) =>
      ipcRenderer.invoke(IPC.STAGE_OUTLINE_UPDATE, { id, slideId, patch }),
    slideAdd: (id: string) => ipcRenderer.invoke(IPC.STAGE_SLIDE_ADD, { id }),
    slideDelete: (id: string, slideId: string) =>
      ipcRenderer.invoke(IPC.STAGE_SLIDE_DELETE, { id, slideId }),
    slideRegenerate: (id: string, slideId: string) =>
      ipcRenderer.invoke(IPC.STAGE_SLIDE_REGENERATE, { id, slideId }),
    htmlGenerate: (id: string) => ipcRenderer.invoke(IPC.STAGE_HTML_GENERATE, { id }),
    styleSave: (id: string, style: any) =>
      ipcRenderer.invoke(IPC.STAGE_STYLE_SAVE, { id, style }),
    onSlideUpdated: (cb: (e: any) => void) => subscribe(IPC.HTML_SLIDE_UPDATED, cb),
    onOutlineStream: (cb: (e: any) => void) => subscribe(IPC.STAGE_OUTLINE_STREAM, cb),
    onSlideRegenStream: (cb: (e: any) => void) => subscribe(IPC.STAGE_SLIDE_REGENERATE_STREAM, cb),
    onHtmlSlideReady: (cb: (e: any) => void) => subscribe(IPC.STAGE_HTML_SLIDE_READY, cb),
    onHtmlGenerateDone: (cb: (e: any) => void) => subscribe(IPC.STAGE_HTML_GENERATE_DONE, cb),
    outlineCancel: (id: string) => ipcRenderer.invoke(IPC.STAGE_OUTLINE_CANCEL, { id }),
    slideCancel: (id: string, slideId: string) => ipcRenderer.invoke(IPC.STAGE_SLIDE_CANCEL, { id, slideId }),
    htmlCancel: (id: string) => ipcRenderer.invoke(IPC.STAGE_HTML_CANCEL, { id }),
  },
}

function subscribe(channel: string, cb: (e: any) => void): () => void {
  const listener = (_: unknown, payload: any) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
