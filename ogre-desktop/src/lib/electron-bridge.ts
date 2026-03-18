type UnlistenFn = () => void

const eAPI = () => (window as unknown as {
  electronAPI: {
    invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>
    on: (event: string, callback: (payload: unknown) => void) => UnlistenFn
  }
}).electronAPI

export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return eAPI().invoke(cmd, args) as Promise<T>
}

export function listen<T = unknown>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const unlisten = eAPI().on(event, (payload) => handler({ payload: payload as T }))
  return Promise.resolve(unlisten)
}
