# CDP Client Plan — Issues

## 2026-02-23 Session ses_37427ec41ffeOFenLFcpP0pPB6

### Known Gotchas
- Use `127.0.0.1` NOT `localhost` for CDP — WebView2 may bind IPv4 only
- `--remote-debugging-port=0` NOT supported by WebView2 — must use sequential port-try
- CDP env var MUST be set before `tauri::Builder::default().build()` in lib.rs
- lib.rs already has CDP code at lines 608-631 — Task 2 REPLACES it, doesn't add from scratch
- Tauri frontend runs in browser context — use browser-native WebSocket, NOT Node.js `ws`
- `Page.enable` must be called after connecting to receive navigation events
