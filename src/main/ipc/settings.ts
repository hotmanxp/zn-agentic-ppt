import { ipcMain, app } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import * as fs from '../fs/settings.js'
import { testLLMConnection } from '../sdk/connection.js'

export function registerSettingsIPC(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => fs.getSettings())
  ipcMain.handle(IPC.SETTINGS_SET, async (_, { settings }: { settings: any }) => {
    await fs.setSettings(settings)
  })
  ipcMain.handle(IPC.SETTINGS_TEST_CONNECTION, async () => {
    const s = await fs.getSettings()
    return testLLMConnection(s)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_GET, async (_, { id }: { id: string }) => fs.getPromptOverride(id))
  ipcMain.handle(IPC.SETTINGS_PROMPT_SET, async (_, { id, template }: { id: string; template: string }) => {
    await fs.setPromptOverride(id, template)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_RESET, async (_, { id }: { id: string }) => {
    await fs.resetPromptOverride(id)
  })
  ipcMain.handle(IPC.SETTINGS_PROMPT_LIST, async () => fs.listPromptOverrides())
  ipcMain.handle(IPC.SYSTEM_USER_DATA_PATH, () => app.getPath('userData'))
}
