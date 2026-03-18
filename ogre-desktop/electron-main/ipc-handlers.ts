import { ipcMain } from 'electron'

export function registerIpcHandlers(): void {
  const stub = (channel: string) => {
    ipcMain.handle(channel, async () => {
      throw new Error(`IPC handler '${channel}' not yet implemented`)
    })
  }

  stub('create_embedded_browser')
  stub('navigate_embedded')
  stub('go_back')
  stub('go_forward')
  stub('reload_browser')
  stub('set_webview_bounds')
  stub('hide_webview')
  stub('show_webview')
  stub('get_embedded_url')
  stub('destroy_webview')
  stub('inject_autofill')
  stub('eval_webview_script')
  stub('inject_webview_script')

  stub('get_cdp_port')
  stub('discover_cdp_target')

  stub('db_query')
  stub('db_execute')

  stub('scan_local_skills')

  stub('start_oauth_callback_server')
  stub('stop_oauth_callback_server')
}
