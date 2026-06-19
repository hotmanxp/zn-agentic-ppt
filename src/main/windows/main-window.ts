import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'ZN Agentic PPT',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('console-message', (_e, level, message, _line, _src) => {
    console.log(`[renderer L${level}] ${message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.log(`[render-process-gone]`, details)
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'))
    if (process.env.OPEN_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' })
  }
  return win
}
