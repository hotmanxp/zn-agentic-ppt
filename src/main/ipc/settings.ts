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
  ipcMain.handle(IPC.SYSTEM_USER_DATA_PATH, () => app.getPath('userData'))
}
