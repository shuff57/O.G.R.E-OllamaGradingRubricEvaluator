use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri::webview::WebviewBuilder;
use tauri::WebviewUrl;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::sync::oneshot;

/// Holds the sidecar child process handle so we can kill it on exit.
struct SidecarState {
    child: Option<tauri_plugin_shell::process::CommandChild>,
    status_item: Option<MenuItem<tauri::Wry>>,
}

/// Holds the embedded browser webview state so we can manage it.
struct WebviewState {
    label: Option<String>,
}

/// Registry for pending webview eval callbacks.
/// Maps eval_id -> oneshot sender for returning results.
type EvalRegistry = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

/// Maximum number of automatic restart attempts after a crash.
const MAX_RESTART_ATTEMPTS: u32 = 3;

/// Spawn the grading-server sidecar, wire up log forwarding and crash recovery.
fn spawn_sidecar(app_handle: &tauri::AppHandle, restart_count: Arc<Mutex<u32>>) {
    let handle = app_handle.clone();

    // Pass the Tauri app data dir so the server reads/writes ogre-server.json there
    let config_dir = handle.path().app_data_dir()
        .expect("failed to resolve app data dir");

    let sidecar_command = handle
        .shell()
        .sidecar("grading-server")
        .expect("failed to create sidecar command")
        .env("OGRE_CONFIG_DIR", config_dir.to_string_lossy().to_string());

    let (mut rx, child) = sidecar_command
        .spawn()
        .expect("failed to spawn grading-server sidecar");

    // Store child handle in managed state for cleanup
    {
        let state = handle.state::<Mutex<SidecarState>>();
        let mut guard = state.lock().unwrap();
        guard.child = Some(child);
    }

    let _ = handle.emit("server-status", "running");
    {
        let state = handle.state::<Mutex<SidecarState>>();
        let guard = state.lock().unwrap();
        if let Some(item) = &guard.status_item {
            let _ = item.set_text("Server: Running ✓");
        }
    }

    // Reset restart counter on successful spawn
    {
        let mut count = restart_count.lock().unwrap();
        *count = 0;
    }

    let restart_count_clone = restart_count.clone();
    let handle_clone = handle.clone();

    // Async task to read stdout/stderr and detect termination
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let _ = handle_clone.emit("server-log", &line);

                    // Detect session_complete JSON to record history
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                         if json.get("type").and_then(|t| t.as_str()) == Some("session_complete") {
                            // Emit event for frontend - frontend handles DB persistence via TypeScript
                            let _ = handle_clone.emit("session-complete", &json);
                         } else if json.get("type").and_then(|t| t.as_str()) == Some("provider_changed") {
                            // Detect provider_changed JSON from extension write-back
                            let provider_id = json["provider_id"].as_str().unwrap_or("").to_string();
                            let model = json["model"].as_str().unwrap_or("").to_string();
                            
                            // Emit event for frontend to persist active provider change
                            let payload = serde_json::json!({
                                "provider_id": provider_id,
                                "model": model
                            });
                            let _ = handle_clone.emit("provider-changed", &payload);
                         }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let _ = handle_clone.emit("server-log", format!("[stderr] {}", line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "grading-server terminated: code={:?} signal={:?}",
                        payload.code, payload.signal
                    );

                    // Clear the stored child handle
                    {
                        let state = handle_clone.state::<Mutex<SidecarState>>();
                        let mut guard = state.lock().unwrap();
                        guard.child = None;
                    }

                    // Exit code 0 = intentional shutdown (we killed it), don't restart
                    if payload.code == Some(0) {
                        let _ = handle_clone.emit("server-status", "stopped");
                        {
                            let state = handle_clone.state::<Mutex<SidecarState>>();
                            let guard = state.lock().unwrap();
                            if let Some(item) = &guard.status_item {
                                let _ = item.set_text("Server: Stopped ✗");
                            }
                        }
                        break;
                    }

                    let _ = handle_clone.emit("server-status", "crashed");
                    {
                        let state = handle_clone.state::<Mutex<SidecarState>>();
                        let guard = state.lock().unwrap();
                        if let Some(item) = &guard.status_item {
                            let _ = item.set_text("Server: Stopped ✗");
                        }
                    }

                    // Auto-restart with exponential backoff
                    let current_count = {
                        let mut count = restart_count_clone.lock().unwrap();
                        *count += 1;
                        *count
                    };

                    if current_count <= MAX_RESTART_ATTEMPTS {
                        let delay_secs = 1u64 << (current_count - 1); // 1s, 2s, 4s
                        let _ = handle_clone.emit(
                            "server-log",
                            format!(
                                "Restarting grading-server (attempt {}/{}) in {}s...",
                                current_count, MAX_RESTART_ATTEMPTS, delay_secs
                            ),
                        );

                        tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                        spawn_sidecar(&handle_clone, restart_count_clone.clone());
                    } else {
                        let _ = handle_clone.emit("server-status", "failed");
                        {
                            let state = handle_clone.state::<Mutex<SidecarState>>();
                            let guard = state.lock().unwrap();
                            if let Some(item) = &guard.status_item {
                                let _ = item.set_text("Server: Stopped ✗");
                            }
                        }
                        let _ = handle_clone.emit(
                            "server-log",
                            format!(
                                "Grading server failed after {} restart attempts. Manual restart required.",
                                MAX_RESTART_ATTEMPTS
                            ),
                        );
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = handle_clone.emit("server-log", format!("[error] {}", err));
                }
                _ => {}
            }
        }
    });
}

// ── Embedded Browser Commands ────────────────────────────────────────────

#[tauri::command]
async fn create_embedded_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

    // If embedded browser already exists, just navigate it
    if let Some(wv) = app.get_webview("embedded-browser") {
        wv.navigate(parsed).map_err(|e| format!("Navigate failed: {}", e))?;
        return Ok(());
    }

    // Create in spawned task to avoid Windows deadlock
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let emit_nav = app_clone.clone();
        let emit_load = app_clone.clone();
        let emit_newwin = app_clone.clone();

        let builder = WebviewBuilder::new(
            "embedded-browser",
            WebviewUrl::External(parsed),
        )
        // Note: don't call auto_resize() — we want manual bounds management
        .on_navigation(move |url| {
            let _ = emit_nav.emit("browser-url-changed", url.as_str());
            true
        })
        .on_page_load(move |wv, _payload| {
            if let Ok(url) = wv.url() {
                let _ = emit_load.emit("browser-page-loaded", url.to_string());
            }
        })
        .on_new_window(move |url, _features| {
            let h = emit_newwin.clone();
            let u = url.to_string();
            tauri::async_runtime::spawn(async move {
                if let Some(wv) = h.get_webview("embedded-browser") {
                    if let Ok(parsed) = u.parse::<url::Url>() {
                        let _ = wv.navigate(parsed);
                    }
                }
            });
            tauri::webview::NewWindowResponse::Deny
        });

        if let Some(window) = app_clone.get_window("main") {
            match window.add_child(
                builder,
                tauri::LogicalPosition::new(0.0, 60.0),
                tauri::LogicalSize::new(800.0, 600.0),
            ) {
                Ok(_) => {
                    {
                        let state = app_clone.state::<Mutex<WebviewState>>();
                        let mut guard = state.lock().unwrap();
                        guard.label = Some("embedded-browser".to_string());
                    }
                    let _ = app_clone.emit("browser-status", "embedded-open");
                }
                Err(e) => {
                    eprintln!("Failed to create embedded browser: {}", e);
                    let _ = app_clone.emit("browser-status", "error");
                }
            }
        } else {
            eprintln!("Main window not found for embedded browser");
            let _ = app_clone.emit("browser-status", "error");
        }
    });

    Ok(())
}

#[tauri::command]
async fn navigate_embedded(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    let parsed: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    wv.navigate(parsed).map_err(|e| format!("Navigation failed: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn go_back(app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.eval("history.back()")
        .map_err(|e| format!("Failed to go back: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn go_forward(app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.eval("history.forward()")
        .map_err(|e| format!("Failed to go forward: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn reload_browser(app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.eval("location.reload()")
        .map_err(|e| format!("Failed to reload: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn set_webview_bounds(
    app: tauri::AppHandle,
    x: f64, y: f64, width: f64, height: f64,
) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;
    wv.set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn hide_webview(app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.hide().map_err(|e| format!("Failed to hide: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn show_webview(app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.show().map_err(|e| format!("Failed to show: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_embedded_url(app: tauri::AppHandle) -> Result<String, String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    let url = wv.url().map_err(|e| format!("Failed to get URL: {}", e))?;
    Ok(url.to_string())
}

#[tauri::command]
async fn destroy_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview("embedded-browser") {
        wv.close().map_err(|e| format!("Failed to close: {}", e))?;
    }
    let state = app.state::<Mutex<WebviewState>>();
    let mut guard = state.lock().unwrap();
    guard.label = None;
    Ok(())
}

#[tauri::command]
async fn inject_autofill(app: tauri::AppHandle, script: String) -> Result<(), String> {
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    wv.eval(&script)
        .map_err(|e| format!("Failed to inject autofill script: {}", e))?;
    Ok(())
}

/// Execute JavaScript in the embedded browser and return the result.
/// 
/// Uses message passing: injects wrapper script that executes code and calls back with result.
/// Timeout: 10 seconds. Returns JSON-serialized result.
#[tauri::command]
async fn eval_webview_script(
    app: tauri::AppHandle,
    script: String,
) -> Result<String, String> {
    let eval_id = uuid::Uuid::new_v4().to_string();
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    
    // Create channel for result
    let (tx, rx) = oneshot::channel::<String>();
    
    // Store callback in registry
    let registry = app.state::<EvalRegistry>();
    {
        let mut guard = registry.lock().unwrap();
        guard.insert(eval_id.clone(), tx);
    }
    
    // Inject wrapper script that executes code and calls back with result
    // Escapes the script content to prevent injection issues
    let escaped_script = script.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${");
    let wrapper = format!(r#"
        (async () => {{
            try {{
                const __result = await (async () => {{ return ({}) }})();
                await window.__TAURI_INTERNALS__.invoke('_eval_callback', {{
                    id: '{}',
                    success: true,
                    result: JSON.stringify(__result)
                }});
            }} catch (__error) {{
                await window.__TAURI_INTERNALS__.invoke('_eval_callback', {{
                    id: '{}',
                    success: false,
                    error: String(__error)
                }});
            }}
        }})();
    "#, escaped_script, eval_id, eval_id);
    
    wv.eval(&wrapper)
        .map_err(|e| format!("Failed to inject eval script: {}", e))?;
    
    // Wait for callback with 10s timeout
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(10),
        rx
    ).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => {
            // Cleanup orphaned entry
            let mut guard = registry.lock().unwrap();
            guard.remove(&eval_id);
            Err("Callback channel closed unexpectedly".to_string())
        },
        Err(_) => {
            // Cleanup on timeout
            let mut guard = registry.lock().unwrap();
            guard.remove(&eval_id);
            Err("Timeout waiting for eval result (10s)".to_string())
        },
    }
}

/// Internal callback handler for eval results.
/// Called by injected JavaScript wrapper via invoke().
#[tauri::command]
async fn _eval_callback(
    app: tauri::AppHandle,
    id: String,
    success: bool,
    result: Option<String>,
    error: Option<String>,
) -> Result<(), String> {
    let registry = app.state::<EvalRegistry>();
    let tx = {
        let mut guard = registry.lock().unwrap();
        guard.remove(&id)
    };
    
    if let Some(tx) = tx {
        let response = if success {
            result.unwrap_or_else(|| "null".to_string())
        } else {
            // Return error as JSON object for consistent parsing
            format!(r#"{{"__error": "{}"}}"#, error.unwrap_or_else(|| "Unknown error".to_string()))
        };
        let _ = tx.send(response);
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        // Migration 1: provider_configs table + WAL mode
        Migration {
            version: 1,
            description: "create_provider_configs_and_enable_wal",
            sql: "PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY NOT NULL,
    api_url TEXT,
    api_key TEXT,
    model TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);",
            kind: MigrationKind::Up,
        },
        // Migration 2: grading_sessions table
        Migration {
            version: 2,
            description: "create_grading_sessions",
            sql: "CREATE TABLE IF NOT EXISTS grading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT,
    model TEXT,
    student_count INTEGER,
    mean_score REAL,
    min_score REAL,
    max_score REAL,
    median_score REAL,
    max_possible_score REAL,
    page_url TEXT,
    question_id TEXT,
    custom_instructions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);",
            kind: MigrationKind::Up,
        },
        // Migration 3: app_settings table with defaults
        Migration {
            version: 3,
            description: "create_app_settings_with_defaults",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('setup_complete', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('history_visible_columns', '[\"timestamp\",\"provider\",\"model\",\"studentCount\",\"meanScore\",\"pageUrl\"]');",
            kind: MigrationKind::Up,
        },
        // Migration 4: oauth_tokens table
        Migration {
            version: 4,
            description: "create_oauth_tokens",
            sql: "CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT,
    expires_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);",
            kind: MigrationKind::Up,
        },
        // Migration 5: site_credentials table
        Migration {
            version: 5,
            description: "create_site_credentials",
            sql: "CREATE TABLE IF NOT EXISTS site_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    url_pattern TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            create_embedded_browser,
            navigate_embedded,
            go_back,
            go_forward,
            reload_browser,
            set_webview_bounds,
            hide_webview,
            show_webview,
            get_embedded_url,
            destroy_webview,
            inject_autofill,
            eval_webview_script,
            _eval_callback,
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ogre.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When second instance is launched, focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(Mutex::new(SidecarState { child: None, status_item: None }))
        .manage(Mutex::new(WebviewState { label: None }))
        .manage(EvalRegistry::new(Mutex::new(HashMap::new())))
        .setup(|app| {
            let handle = app.handle().clone();

            // Tray Setup
            // Menu structure: 
            // - Open Dashboard (restores window)
            // - Separator
            // - Server Status (dynamic: Running ✓ / Stopped ✗)
            // - Settings (navigates to settings)
            // - View Logs (navigates to logs)
            // - Separator
            // - Quit (kills sidecar and exits)
            // Behavior:
            // - Left-click tray icon: Restore window
            // - Window close (X): Minimize to tray (prevent exit)
            let status_item = MenuItemBuilder::new("Server: Stopped ✗")
                .id("server-status")
                .enabled(false)
                .build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&MenuItemBuilder::new("Open Dashboard").id("open-dashboard").build(app)?)
                .separator()
                .item(&status_item)
                .item(&MenuItemBuilder::new("Settings").id("settings").build(app)?)
                .item(&MenuItemBuilder::new("View Logs").id("logs").build(app)?)
                .separator()
                .item(&MenuItemBuilder::new("Quit").id("quit").build(app)?)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("O.G.R.E Desktop")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open-dashboard" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate-to-settings", ());
                            }
                        }
                        "logs" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate-to-logs", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                         if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                         }
                    }
                })
                .build(app)?;

            // Store status item in state
            {
                let state = app.state::<Mutex<SidecarState>>();
                let mut guard = state.lock().unwrap();
                guard.status_item = Some(status_item);
            }

            // Override window close behavior (minimize to tray)
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
             }

             let restart_count = Arc::new(Mutex::new(0u32));
            spawn_sidecar(&handle, restart_count);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill sidecar when the app exits
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<Mutex<SidecarState>>();
                let mut guard = state.lock().unwrap();
                if let Some(child) = guard.child.take() {
                    let _ = child.kill();
                }
            }
        });
}
