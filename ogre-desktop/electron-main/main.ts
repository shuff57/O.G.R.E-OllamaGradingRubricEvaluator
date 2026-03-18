import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc-handlers'

if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'O.G.R.E - Grading Server Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(process.cwd(), 'dist-electron', 'preload.mjs'),
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (isDev) {
    void win.loadURL('http://localhost:5173')
  } else {
    void win.loadFile(path.join(process.cwd(), 'dist', 'index.html'))
  }

  return win
}

process.on('message', (msg) => {
  if (msg === 'electron-vite&type=hot-reload') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload()
    }
  }
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
