import { app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createMainWindow } from './windows/main-window.js'
import { registerAllIPC } from './ipc/index.js'

const DATA_ROOT = join(homedir(), '.zn-agentic-ppt')
app.setPath('userData', DATA_ROOT)

app.whenReady().then(async () => {
  await mkdir(DATA_ROOT, { recursive: true })
  await mkdir(join(DATA_ROOT, 'projects'), { recursive: true })
  await mkdir(join(DATA_ROOT, 'logs'), { recursive: true })
  await mkdir(join(DATA_ROOT, 'cache'), { recursive: true })
  registerAllIPC()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
