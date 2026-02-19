# Draft: Embedded Browser + Credential Storage for O.G.R.E Desktop

## Requirements (confirmed)
- User wants the browser page to load INSIDE the app (not open a separate window)
- User wants to save usernames/passwords for grading sites with autofill + auto-login
- BIGGER VISION: Eventually roll the Chrome extension entirely into the desktop app, eliminating the need for the extension
- Auto-login: AUTOFILL ONLY (fill fields, user clicks login) — confirmed
- Primary sites: MyOpenMath + Canvas LMS — confirmed
- Scope: Browser + Credentials ONLY (extension consolidation is a separate future plan) — confirmed
- Layout: Browser fills content area AND sidebar collapses for maximum screen space. Small toggle/button to restore sidebar. Session persists when switching pages.
- Credential management UI: Lives on the Browser page (alongside URL bar and quick launch)
- Sidebar collapse: Auto-collapses when on Browser page, toggle to restore

## Current Architecture (discovered)
- **Desktop App**: Tauri v2 + Svelte 5 + Rust backend
- **Current Browser**: Opens a SEPARATE Tauri WebviewWindow (`open_browser_window` in lib.rs line 179) — NOT embedded in the main app
- **Database**: SQLite via tauri-plugin-sql with tables: provider_configs, grading_sessions, app_settings, oauth_tokens
- **Existing browser.ts**: Wraps Tauri invoke calls for open/navigate/close browser
- **Browser.svelte page**: URL bar + quick launch presets + saved URLs — but content loads in external window
- **Credentials**: API keys stored in SQLite (provider_configs.api_key), OAuth tokens in oauth_tokens table. NO website login credentials stored.
- **Rust Backend**: Uses `WebviewWindowBuilder` with `WebviewUrl::External(url)` for browser windows

## Technical Decisions
- Embedded webview: Tauri v2 multi-webview (WebviewBuilder + add_child) — iframes won't work because Canvas/MyOpenMath set X-Frame-Options headers that block embedding
- Credential encryption: Rust-side encryption (aes-gcm or DPAPI on Windows) with encrypted blobs stored in SQLite
- Auto-login: Autofill only (fill fields, user clicks login) — CONFIRMED
- Per-site login selectors: Need site-specific selector configs for MyOpenMath and Canvas login forms
- Sidebar: Auto-collapse when Browser page active, with a small icon/button to toggle back

## Research Findings
- Tauri v2 supports multi-webview in a single window
- Current Cargo.toml does NOT include tauri-plugin-store or any keychain plugin
- Browser.svelte has presets for: MyOpenMath, Canvas, Blackboard, Moodle

## Open Questions
- Which grading sites are primary targets for auto-login?
- Embedded browser: side-by-side with grading panel, or full-width with toolbar?
- Auto-login: just fill fields or also click submit?
- Is extension consolidation part of this plan or a future phase?
- Security requirements for stored passwords?

## Scope Boundaries
- INCLUDE: Embedded browser in main window, sidebar collapse, credential storage + autofill, MyOpenMath + Canvas login form support, saved logins UI on Browser page
- EXCLUDE: Extension consolidation (future plan), full auto-login (no auto-submit), Blackboard/Moodle login support (can be added later), mobile support
