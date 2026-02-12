use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Holds the sidecar child process handle so we can kill it on exit.
struct SidecarState {
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

/// Maximum number of automatic restart attempts after a crash.
const MAX_RESTART_ATTEMPTS: u32 = 3;

/// Spawn the grading-server sidecar, wire up log forwarding and crash recovery.
fn spawn_sidecar(app_handle: &tauri::AppHandle, restart_count: Arc<Mutex<u32>>) {
    let handle = app_handle.clone();
    let sidecar_command = handle
        .shell()
        .sidecar("grading-server")
        .expect("failed to create sidecar command");

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
                        break;
                    }

                    let _ = handle_clone.emit("server-status", "crashed");

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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ogre.db", migrations)
                .build(),
        )
        .manage(Mutex::new(SidecarState { child: None }))
        .setup(|app| {
            let handle = app.handle().clone();
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
