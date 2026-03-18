import { ipcMain } from 'electron'
import net from 'node:net'

interface OAuthCallbackResult {
  code: string | null
  state: string | null
  error: string | null
  port: number
}

let cancelFn: (() => void) | null = null

function parseHttpRequest(data: string): Record<string, string> {
  const params: Record<string, string> = {}
  const match = data.match(/^GET ([^\s]+)/)
  if (!match) return params
  const queryStart = match[1].indexOf('?')
  if (queryStart === -1) return params
  const query = match[1].slice(queryStart + 1)
  for (const part of query.split('&')) {
    const [k, v] = part.split('=')
    if (k) params[decodeURIComponent(k)] = v ? decodeURIComponent(v.replace(/\+/g, ' ')) : ''
  }
  return params
}

function sendHtmlResponse(socket: net.Socket, title: string, body: string): void {
  const html = `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p><script>window.close();</script></body></html>`
  const response = [
    'HTTP/1.1 200 OK',
    'Content-Type: text/html; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(html)}`,
    'Connection: close',
    '',
    html,
  ].join('\r\n')
  socket.write(response)
  socket.end()
}

export function registerOAuthHandlers(): void {
  ipcMain.handle('start_oauth_callback_server', async (_e, { port }: { port: number }): Promise<OAuthCallbackResult> => {
    return new Promise((resolve) => {
      const server = net.createServer()

      let resolved = false
      function finish(result: OAuthCallbackResult): void {
        if (resolved) return
        resolved = true
        cancelFn = null
        server.close()
        resolve(result)
      }

      cancelFn = () => finish({ code: null, state: null, error: 'OAuth cancelled', port })

      const TIMEOUT_MS = 300_000
      const timer = setTimeout(() => finish({ code: null, state: null, error: 'OAuth timeout (5 minutes)', port }), TIMEOUT_MS)

      server.on('connection', (socket) => {
        let raw = ''
        socket.on('data', (chunk) => {
          raw += chunk.toString()
          if (raw.includes('\r\n\r\n') || raw.includes('\n\n')) {
            clearTimeout(timer)
            const params = parseHttpRequest(raw)
            if (params.error) {
              sendHtmlResponse(socket, 'Authorization Failed', `Error: ${params.error}`)
              finish({ code: null, state: null, error: params.error, port })
            } else {
              sendHtmlResponse(socket, 'Authorization Complete', 'You may close this window and return to O.G.R.E.')
              finish({ code: params.code ?? null, state: params.state ?? null, error: null, port })
            }
          }
        })
        socket.on('error', () => {})
      })

      server.on('error', (e) => {
        clearTimeout(timer)
        finish({ code: null, state: null, error: e.message, port })
      })

      let tryPort = port
      const tryListen = (): void => {
        server.listen(tryPort, '127.0.0.1', () => {
          const addr = server.address() as net.AddressInfo
          finish({ ...finish as unknown as OAuthCallbackResult, port: addr.port })
        })
      }

      server.once('error', (e: NodeJS.ErrnoException) => {
        if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && tryPort < port + 20) {
          tryPort++
          server.close(() => tryListen())
        }
      })

      tryListen()
    })
  })

  ipcMain.handle('stop_oauth_callback_server', () => {
    cancelFn?.()
  })
}
