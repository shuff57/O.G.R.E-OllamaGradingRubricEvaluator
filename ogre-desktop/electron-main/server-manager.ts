import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAX_RESTART_ATTEMPTS = 3
const SERVER_PORT = 3456

let serverProcess: ChildProcess | null = null
let restartCount = 0
let isShuttingDown = false

function getServerBundlePath(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'server-bundle', 'server.js'),
    path.join(__dirname, '..', '..', 'src-tauri', 'binaries', 'server-bundle', 'server.js'),
    path.join(__dirname, '..', '..', 'grading-server', 'server.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.dirname(candidate)
  }
  throw new Error(`server.js not found. Tried: ${candidates.join(', ')}`)
}

function getBunExecutable(): string {
  const candidates = [
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
    'bun',
  ]
  for (const candidate of candidates) {
    if (candidate === 'bun') return 'bun'
    if (fs.existsSync(candidate)) return candidate
  }
  return 'bun'
}

function emitToRenderer(event: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, payload)
    }
  }
}

function parseServerEvent(line: string): { type: string; data: unknown } | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (parsed.type === 'session_complete') return { type: 'session-complete', data: parsed }
    if (parsed.type === 'provider_changed') {
      return {
        type: 'provider-changed',
        data: { provider_id: parsed.provider_id, model: parsed.model },
      }
    }
  } catch {
    // Not JSON — ignore
  }
  return null
}

export function spawnServer(): void {
  if (isShuttingDown) return

  let serverDir: string
  try {
    serverDir = getServerBundlePath()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    emitToRenderer('server-log', `[error] ${msg}`)
    emitToRenderer('server-status', 'failed')
    return
  }

  const bunExe = getBunExecutable()
  const configDir = app.getPath('userData')

  const bunDirs = [
    path.join(os.homedir(), '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const augmentedPath = [...bunDirs, process.env.PATH ?? ''].join(path.delimiter)

  serverProcess = spawn(bunExe, ['run', path.join(serverDir, 'server.js')], {
    cwd: serverDir,
    env: { ...process.env, PATH: augmentedPath, OGRE_CONFIG_DIR: configDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  emitToRenderer('server-status', 'running')
  restartCount = 0

  const stdout = createInterface({ input: serverProcess.stdout! })
  stdout.on('line', (line) => {
    emitToRenderer('server-log', line)
    const event = parseServerEvent(line)
    if (event) emitToRenderer(event.type, event.data)
  })

  const stderr = createInterface({ input: serverProcess.stderr! })
  stderr.on('line', (line) => {
    emitToRenderer('server-log', `[stderr] ${line}`)
  })

  serverProcess.on('exit', (code) => {
    serverProcess = null

    if (isShuttingDown || code === 0) {
      emitToRenderer('server-status', 'stopped')
      return
    }

    emitToRenderer('server-status', 'crashed')
    restartCount++

    if (restartCount <= MAX_RESTART_ATTEMPTS) {
      const delaySecs = Math.pow(2, restartCount - 1)
      emitToRenderer(
        'server-log',
        `Restarting grading-server (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS}) in ${delaySecs}s...`,
      )
      setTimeout(() => spawnServer(), delaySecs * 1000)
    } else {
      emitToRenderer('server-status', 'failed')
      emitToRenderer(
        'server-log',
        `grading-server failed after ${MAX_RESTART_ATTEMPTS} restart attempts`,
      )
    }
  })
}

export function stopServer(): void {
  isShuttingDown = true
  if (!serverProcess) return

  serverProcess.kill('SIGTERM')

  const killTimer = setTimeout(() => {
    if (serverProcess) serverProcess.kill('SIGKILL')
  }, 5000)

  serverProcess.once('exit', () => clearTimeout(killTimer))
}

export async function waitForServerReady(timeoutMs = 10000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${SERVER_PORT}/health`)
      if (res.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, 500))
  }
  return false
}
