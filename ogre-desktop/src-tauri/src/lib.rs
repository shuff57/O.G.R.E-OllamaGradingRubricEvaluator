use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Holds the sidecar child process handle so we can kill it on exit.
struct SidecarState {
    child: Option<tauri_plugin_shell::process::CommandChild>,
    status_item: Option<MenuItem<tauri::Wry>>,
}

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
                            let provider_id = json["provider_id"].as_str().unwrap_or("unknown").to_string();
                            let model = json["model"].as_str().unwrap_or("unknown").to_string();
                            let student_count = json["student_count"].as_i64().unwrap_or(0);
                            let mean_score = json["mean_score"].as_f64().unwrap_or(0.0);
                            let min_score = json["min_score"].as_f64().unwrap_or(0.0);
                            let max_score = json["max_score"].as_f64().unwrap_or(0.0);
                            let median_score = json["median_score"].as_f64().unwrap_or(0.0);
                            let max_possible_score = json["max_possible_score"].as_f64().unwrap_or(10.0);
                            let page_url = json["page_url"].as_str().unwrap_or("").to_string();
                            let question_id = json["question_id"].as_str().unwrap_or("").to_string();
                            let custom_instructions = json["custom_instructions"].as_str().unwrap_or("").to_string();
                            
                            // Emit event for frontend
                            let _ = handle_clone.emit("session-complete", &json);

                            // Emit event to frontend - frontend will handle DB persistence via TypeScript
                            // This avoids database locking conflicts between Rust and TypeScript SQL plugin usage
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
    ];

    tauri::Builder::default()
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
