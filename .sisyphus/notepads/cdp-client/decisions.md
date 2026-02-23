# CDP Client Plan — Decisions

## 2026-02-23 Session ses_37427ec41ffeOFenLFcpP0pPB6

### Architecture Decisions
- CDPClient as class with singleton export: `export const cdp = new CDPClient()`
- cdp-actions.ts imports the singleton `cdp` from `./cdp-client`
- Zero npm dependencies — browser-native WebSocket only
- 30s timeout for `send()` calls
- Sequential port-try 9222-9242 in Rust (not random, not port 0)
- html2canvas kept as fallback — CDP screenshot is enhancement only

### What NOT to do
- No auto-reconnect
- No accessibility tree changes (separate follow-up)
- No new agent actions beyond existing 5 + screenshot
- No changes to batch-grader.ts
- No changes to evalScript/evalScriptJSON
- No changes to agent-types.ts
