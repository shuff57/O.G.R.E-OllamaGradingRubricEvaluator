import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc-handlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { initDatabase } from './database'
import { spawnServer, stopServer } from './server-manager'
import { setCdpPort } from './cdp-bridge'
import { initAutoUpdater } from './updater'

if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')

  if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) {
    app.commandLine.appendSwitch('ozone-platform', 'wayland')
  }
}

app.commandLine.appendSwitch('remote-debugging-port', '9223')
app.commandLine.appendSwitch('remote-allow-origins', '*')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'O.G.R.E - Grading Server Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (isDev) {
    void win.loadURL('http://localhost:5173')
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
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
  initDatabase()
  registerIpcHandlers()
  setCdpPort(9223)
  spawnServer()
  const mainWindow = createWindow()

  if (app.isPackaged) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = createWindow()
      if (app.isPackaged) {
        initAutoUpdater(nextWindow)
      }
    }
  })
})

app.on('before-quit', () => {
  stopServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
