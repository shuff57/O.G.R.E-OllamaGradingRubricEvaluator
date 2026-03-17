use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
#[cfg(not(target_os = "linux"))]
use tauri::webview::WebviewBuilder;
#[cfg(not(target_os = "linux"))]
use tauri::WebviewUrl;
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::oneshot;
use command_group::AsyncCommandGroup;

#[cfg(target_os = "linux")]
use gtk::prelude::*;
#[cfg(target_os = "linux")]
use wry::WebViewBuilderExtUnix;
#[cfg(target_os = "linux")]
use wry::WebViewExtUnix;

/// Linux-only: thread-local storage for wry WebView handles and GTK state.
/// These must be on the main thread (GTK widgets are !Send).
#[cfg(target_os = "linux")]
use std::cell::RefCell;

#[cfg(target_os = "linux")]
thread_local! {
    /// Maps webview label → wry WebView handle (main thread only)
    static LINUX_WEBVIEWS: RefCell<HashMap<String, wry::WebView>> = RefCell::new(HashMap::new());
    /// The single shared GtkFixed container for all embedded webviews
    static GTK_FIXED: RefCell<Option<gtk::Fixed>> = const { RefCell::new(None) };
    /// Maps webview label → current URL (since wry has no url() getter)
    static WEBVIEW_URLS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[cfg(target_os = "linux")]
#[allow(dead_code)]
fn linux_gdk_input_spike_probe() -> Result<(), String> {
    GTK_FIXED.with(|fixed_cell| {
        let fixed_ref = fixed_cell.borrow();
        let fixed = fixed_ref
            .as_ref()
            .ok_or_else(|| "GTK_FIXED is not initialized".to_string())?;

        let children = fixed.children();

        let webview_widget_found = LINUX_WEBVIEWS.with(|webviews| {
            let webviews = webviews.borrow();
            webviews.values().any(|webview| {
                let webview_widget: gtk::Widget = webview.webview().upcast();
                children
                    .iter()
                    .any(|child| child.as_ptr() == webview_widget.as_ptr())
            })
        });

        let mut target_window = children.iter().find_map(|child| child.window());

        if target_window.is_none() && webview_widget_found {
            target_window = LINUX_WEBVIEWS.with(|webviews| {
                webviews
                    .borrow()
                    .values()
                    .find_map(|webview| webview.webview().upcast::<gtk::Widget>().window())
            });
        }

        let window = target_window
            .ok_or_else(|| "No child widget yielded a GdkWindow (widget may be unrealized)".to_string())?;

        let _button_ok = gtk::gdk::test_simulate_button(
            &window,
            1,
            1,
            1,
            gtk::gdk::ModifierType::empty(),
            gtk::gdk::EventType::ButtonPress,
        );

        let _key_ok = gtk::gdk::test_simulate_key(
            &window,
            1,
            1,
            *gtk::gdk::keys::constants::A,
            gtk::gdk::ModifierType::empty(),
            gtk::gdk::EventType::KeyPress,
        );

        Ok(())
    })
}

struct ServerState {
    child: Option<command_group::AsyncGroupChild>,
    status_item: Option<MenuItem<tauri::Wry>>,
}

/// Holds the embedded browser webview state so we can manage it.
struct WebviewState {
    tabs: HashMap<String, String>,
}

/// Registry for pending webview eval callbacks.
/// Maps eval_id -> oneshot sender for returning results.
type EvalRegistry = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

/// Maximum number of automatic restart attempts after a crash.
const MAX_RESTART_ATTEMPTS: u32 = 3;

#[derive(serde::Serialize)]
struct OAuthCallbackResult {
    code: String,
    state: String,
    port: u16,
}

struct OAuthCallbackState {
    cancel_tx: Option<oneshot::Sender<()>>,
}

struct CdpPortState {
    port: Option<u16>,
}

pub enum ServerEvent {
    SessionComplete(serde_json::Value),
    ProviderChanged { provider_id: String, model: String },
}

pub fn parse_server_event(line: &str) -> Option<ServerEvent> {
    let json = serde_json::from_str::<serde_json::Value>(line).ok()?;
    match json.get("type").and_then(|t| t.as_str()) {
        Some("session_complete") => Some(ServerEvent::SessionComplete(json)),
        Some("provider_changed") => {
            let provider_id = json["provider_id"].as_str().unwrap_or("").to_string();
            let model = json["model"].as_str().unwrap_or("").to_string();
            Some(ServerEvent::ProviderChanged { provider_id, model })
        }
        _ => None,
    }
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct CdpTarget {
    id: String,
    #[serde(rename = "type")]
    target_type: String,
    title: String,
    url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    ws_debugger_url: Option<String>,
}

fn spawn_server(app_handle: &tauri::AppHandle, restart_count: Arc<Mutex<u32>>) {
    let handle = app_handle.clone();

    // Pass the Tauri app data dir so the server reads/writes ogre-server.json there
    let config_dir = handle.path().app_data_dir()
        .expect("failed to resolve app data dir");

    // Resolve server-bundle path. In production Tauri copies resources to resource_dir,
    // but in dev mode the files stay at their original location (src-tauri/binaries/).
    let server_bundle_dir = {
        let resource_path = handle
            .path()
            .resource_dir()
            .expect("failed to resolve resource dir")
            .join("server-bundle");
        if resource_path.join("server.js").exists() {
            resource_path
        } else {
            // Dev fallback: resources declared as "binaries/server-bundle" live
            // directly under the src-tauri directory during development.
            let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join("server-bundle");
            if dev_path.join("server.js").exists() {
                dev_path
            } else {
                panic!(
                    "server-bundle not found at {:?} or {:?}",
                    resource_path, dev_path
                );
            }
        }
    };
    let server_js = server_bundle_dir.join("server.js");

    let mut cmd = TokioCommand::new("bun");
    cmd.arg("run")
        .arg(&server_js)
        .current_dir(&server_bundle_dir)
        .env("OGRE_CONFIG_DIR", config_dir.to_string_lossy().to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    #[cfg(not(windows))]
    {
        let bun_paths = [
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
            format!("{}/.bun/bin", std::env::var("HOME").unwrap_or_default()),
        ];
        let path = std::env::var("PATH").unwrap_or_default();
        let augmented_path = format!("{}:{}", bun_paths.join(":"), path);
        cmd.env("PATH", augmented_path);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .group_spawn()
        .expect("failed to spawn grading-server process");

    let stdout = child
        .inner()
        .stdout
        .take()
        .expect("failed to capture stdout");
    let stderr = child
        .inner()
        .stderr
        .take()
        .expect("failed to capture stderr");

    // Store child handle in managed state for cleanup
    {
        let state = handle.state::<Mutex<ServerState>>();
        let mut guard = state.lock().unwrap();
        guard.child = Some(child);
    }

    let _ = handle.emit("server-status", "running");
    {
        let state = handle.state::<Mutex<ServerState>>();
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
    let handle_stdout = handle.clone();
    let handle_stderr = handle.clone();
    let handle_monitor = handle.clone();

    tauri::async_runtime::spawn(async move {
        let mut stdout_lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = stdout_lines.next_line().await {
            let _ = handle_stdout.emit("server-log", &line);

            match parse_server_event(&line) {
                Some(ServerEvent::SessionComplete(json)) => {
                    // Emit event for frontend - frontend handles DB persistence via TypeScript
                    let _ = handle_stdout.emit("session-complete", &json);
                }
                Some(ServerEvent::ProviderChanged { provider_id, model }) => {
                    // Emit event for frontend to persist active provider change
                    let payload = serde_json::json!({
                        "provider_id": provider_id,
                        "model": model
                    });
                    let _ = handle_stdout.emit("provider-changed", &payload);
                }
                None => {}
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        let mut stderr_lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = stderr_lines.next_line().await {
            let _ = handle_stderr.emit("server-log", format!("[stderr] {}", line));
        }
    });

    tauri::async_runtime::spawn(async move {
        loop {
            let mut exit_status: Option<std::process::ExitStatus> = None;
            let mut check_error = None;
            {
                let state = handle_monitor.state::<Mutex<ServerState>>();
                let mut guard = state.lock().unwrap();
                if let Some(child) = guard.child.as_mut() {
                    match child.inner().try_wait() {
                        Ok(status) => exit_status = status,
                        Err(err) => check_error = Some(err),
                    }
                } else {
                    break;
                }

                if exit_status.is_some() {
                    guard.child = None;
                }
            }

            if let Some(err) = check_error {
                let _ = handle_monitor.emit("server-log", format!("[error] {}", err));
            }

            if let Some(status) = exit_status {
                eprintln!(
                    "grading-server terminated: code={:?}",
                    status.code()
                );

                // Exit code 0 = intentional shutdown (we killed it), don't restart
                if status.code() == Some(0) {
                    let _ = handle_monitor.emit("server-status", "stopped");
                    {
                        let state = handle_monitor.state::<Mutex<ServerState>>();
                        let guard = state.lock().unwrap();
                        if let Some(item) = &guard.status_item {
                            let _ = item.set_text("Server: Stopped ✗");
                        }
                    }
                    break;
                }

                let _ = handle_monitor.emit("server-status", "crashed");
                {
                    let state = handle_monitor.state::<Mutex<ServerState>>();
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
                    let _ = handle_monitor.emit(
                        "server-log",
                        format!(
                            "Restarting grading-server (attempt {}/{}) in {}s...",
                            current_count, MAX_RESTART_ATTEMPTS, delay_secs
                        ),
                    );

                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    spawn_server(&handle_monitor, restart_count_clone.clone());
                } else {
                    let _ = handle_monitor.emit("server-status", "failed");
                    {
                        let state = handle_monitor.state::<Mutex<ServerState>>();
                        let guard = state.lock().unwrap();
                        if let Some(item) = &guard.status_item {
                            let _ = item.set_text("Server: Stopped ✗");
                        }
                    }
                    let _ = handle_monitor.emit(
                        "server-log",
                        format!(
                            "Grading server failed after {} restart attempts. Manual restart required.",
                            MAX_RESTART_ATTEMPTS
                        ),
                    );
                }
                break;
            }

            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
    });
}

// ── Embedded Browser Commands ────────────────────────────────────────────

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn create_embedded_browser(app: tauri::AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

    // Create in spawned task to avoid Windows deadlock
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let label = format!("embedded-browser-{}", tab_id);
        let emit_nav = app_clone.clone();
        let emit_load = app_clone.clone();
        let emit_newwin = app_clone.clone();
        let tab_id_nav = tab_id.clone();
        let tab_id_load = tab_id.clone();
        let tab_id_newwin = tab_id.clone();

        let builder = WebviewBuilder::new(
            label.clone(),
            WebviewUrl::External(parsed),
        )
        // Note: don't call auto_resize() — we want manual bounds management
        .on_navigation(move |url| {
            let url_str = url.to_string();
            let tid = tab_id_nav.clone();
            let _ = emit_nav.emit("browser-url-changed", serde_json::json!({"tabId": tid, "url": url_str}));
            true
        })
        .on_page_load(move |wv, _payload| {
            if let Ok(url) = wv.url() {
                let tid = tab_id_load.clone();
                let _ = emit_load.emit("browser-page-loaded", serde_json::json!({"tabId": tid, "url": url.to_string()}));
            }
        })
        .on_new_window(move |url, _features| {
            let h = emit_newwin.clone();
            let u = url.to_string();
            let tid = tab_id_newwin.clone();
            tauri::async_runtime::spawn(async move {
                let label = {
                    let state = h.state::<Mutex<WebviewState>>();
                    let guard = state.lock().unwrap();
                    guard.tabs.get(&tid).cloned()
                };
                if let Some(label) = label {
                    if let Some(wv) = h.get_webview(&label) {
                        if let Ok(parsed) = u.parse::<url::Url>() {
                            let _ = wv.navigate(parsed);
                        }
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
                        guard.tabs.insert(tab_id.clone(), label.clone());
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

#[cfg(target_os = "linux")]
#[tauri::command]
async fn create_embedded_browser(app: tauri::AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let url_str = url.clone();
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    let (tx, rx) = oneshot::channel::<Result<(), String>>();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let label = format!("embedded-browser-{}", tab_id_clone);

            let has_fixed = GTK_FIXED.with(|f| f.borrow().is_some());
            if !has_fixed {
                let _ = app_clone.emit("browser-status", "error");
                return Err("GtkFixed not initialized — setup() may not have run".to_string());
            }

            let app_nav = app_clone.clone();
            let app_load = app_clone.clone();
            let app_newwin = app_clone.clone();
            let label_nav = label.clone();
            let label_load = label.clone();
            let label_newwin = label.clone();
            let tab_id_nav = tab_id.clone();
            let tab_id_load = tab_id.clone();

            let builder = wry::WebViewBuilder::new()
                .with_url(&url_str)
                .with_bounds(wry::Rect {
                    position: wry::dpi::LogicalPosition::new(0.0_f64, 60.0_f64).into(),
                    size: wry::dpi::LogicalSize::new(800.0_f64, 600.0_f64).into(),
                })
                .with_navigation_handler(move |url| {
                    let url_s = url.to_string();
                    WEBVIEW_URLS.with(|urls| {
                        urls.borrow_mut().insert(label_nav.clone(), url_s.clone());
                    });
                    let _ = app_nav.emit("browser-url-changed", serde_json::json!({
                        "tabId": tab_id_nav,
                        "url": url_s
                    }));
                    true
                })
                .with_on_page_load_handler(move |event, url| {
                    use wry::PageLoadEvent;
                    if matches!(event, PageLoadEvent::Finished) {
                        let url_s = url.to_string();
                        WEBVIEW_URLS.with(|urls| {
                            urls.borrow_mut().insert(label_load.clone(), url_s.clone());
                        });
                        let _ = app_load.emit("browser-page-loaded", serde_json::json!({
                            "tabId": tab_id_load,
                            "url": url_s
                        }));
                    }
                })
                .with_new_window_req_handler(move |url, _features| {
                    let url_s = url.to_string();

                    LINUX_WEBVIEWS.with(|webviews| {
                        if let Some(wv) = webviews.borrow().get(&label_newwin) {
                            let _ = wv.load_url(&url_s);
                        }
                    });

                    WEBVIEW_URLS.with(|urls| {
                        urls.borrow_mut().insert(label_newwin.clone(), url_s.clone());
                    });

                    let _ = app_newwin.emit("browser-url-changed", serde_json::json!({
                        "tabId": tab_id_clone,
                        "url": url_s
                    }));

                    wry::NewWindowResponse::Deny
                });

            let webview_result = GTK_FIXED.with(|f| {
                let fixed_ref = f.borrow();
                let fixed = fixed_ref.as_ref().expect("GTK_FIXED checked above");
                builder.build_gtk(fixed)
            });

            match webview_result {
                Ok(wv) => {
                    LINUX_WEBVIEWS.with(|webviews| {
                        webviews.borrow_mut().insert(label.clone(), wv);
                    });
                    WEBVIEW_URLS.with(|urls| {
                        urls.borrow_mut().insert(label.clone(), url_str.clone());
                    });
                    {
                        let state = app_clone.state::<Mutex<WebviewState>>();
                        let mut guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
                        guard.tabs.insert(tab_id.clone(), label.clone());
                    }
                    let _ = app_clone.emit("browser-status", "embedded-open");
                    Ok(())
                }
                Err(e) => {
                    let _ = app_clone.emit("browser-status", "error");
                    Err(format!("Failed to create Linux embedded browser: {}", e))
                }
            }
        })();

        let _ = tx.send(result);
    })
    .map_err(|_| "Failed to run on main thread".to_string())?;

    rx.await
        .map_err(|_| "Main thread response channel closed".to_string())??;

    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn navigate_embedded(app: tauri::AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    let parsed: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    wv.navigate(parsed).map_err(|e| format!("Navigation failed: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn navigate_embedded(app: tauri::AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let label_clone = label.clone();
    let url_str_clone = url.clone();
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label_clone) {
                if let Err(e) = wv.load_url(&url_str_clone) {
                    eprintln!("Navigate failed: {}", e);
                }
            }
        });
        WEBVIEW_URLS.with(|urls| {
            urls.borrow_mut().insert(label_clone.clone(), url_str_clone.clone());
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn go_back(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    wv.eval("history.back()")
        .map_err(|e| format!("Failed to go back: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn go_back(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                if let Err(e) = wv.evaluate_script("history.back()") {
                    eprintln!("go_back failed: {}", e);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn go_forward(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    wv.eval("history.forward()")
        .map_err(|e| format!("Failed to go forward: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn go_forward(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                if let Err(e) = wv.evaluate_script("history.forward()") {
                    eprintln!("go_forward failed: {}", e);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn reload_browser(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    wv.eval("location.reload()")
        .map_err(|e| format!("Failed to reload: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn reload_browser(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                if let Err(e) = wv.evaluate_script("location.reload()") {
                    eprintln!("reload_browser failed: {}", e);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn set_webview_bounds(
    app: tauri::AppHandle,
    tab_id: String,
    x: f64, y: f64, width: f64, height: f64,
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    wv.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;
    wv.set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn set_webview_bounds(
    app: tauri::AppHandle,
    tab_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                let rect = wry::Rect {
                    position: wry::dpi::LogicalPosition::new(x, y).into(),
                    size: wry::dpi::LogicalSize::new(width, height).into(),
                };
                if let Err(e) = wv.set_bounds(rect) {
                    eprintln!("Failed to set bounds: {}", e);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;

    Ok(())
}

#[tauri::command]
async fn hide_webview(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    #[cfg(target_os = "linux")]
    {
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    if let Err(e) = wv.set_visible(false) {
                        eprintln!("Failed to hide Linux webview: {}", e);
                    }
                }
            });
        }).map_err(|_| "Failed to run on main thread".to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
        wv.hide().map_err(|e| format!("Failed to hide: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
async fn show_webview(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    #[cfg(target_os = "linux")]
    {
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    if let Err(e) = wv.set_visible(true) {
                        eprintln!("Failed to show Linux webview: {}", e);
                    }
                }
            });
        }).map_err(|_| "Failed to run on main thread".to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
        wv.show().map_err(|e| format!("Failed to show: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
async fn get_embedded_url(app: tauri::AppHandle, tab_id: String) -> Result<String, String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = oneshot::channel::<String>();
        app.run_on_main_thread(move || {
            let url = WEBVIEW_URLS.with(|urls| {
                urls.borrow().get(&label).cloned().unwrap_or_default()
            });
            let _ = tx.send(url);
        }).map_err(|_| "Failed to run on main thread".to_string())?;
        let url = rx.await.map_err(|_| "Channel closed".to_string())?;
        Ok(url)
    }

    #[cfg(not(target_os = "linux"))]
    {
        let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
        let url = wv.url().map_err(|e| format!("Failed to get URL: {}", e))?;
        Ok(url.to_string())
    }
}

#[tauri::command]
async fn destroy_webview(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned()
    };
    if let Some(label) = label.clone() {
        #[cfg(target_os = "linux")]
        {
            let label_clone = label.clone();
            app.run_on_main_thread(move || {
                LINUX_WEBVIEWS.with(|webviews| {
                    webviews.borrow_mut().remove(&label_clone);
                });
                WEBVIEW_URLS.with(|urls| {
                    urls.borrow_mut().remove(&label_clone);
                });
            }).map_err(|_| "Failed to run on main thread".to_string())?;
        }

        #[cfg(not(target_os = "linux"))]
        {
            if let Some(wv) = app.get_webview(&label) {
                wv.close().map_err(|e| format!("Failed to close: {}", e))?;
            }
        }

        let state = app.state::<Mutex<WebviewState>>();
        let mut guard = state.lock().unwrap();
        guard.tabs.remove(&tab_id);
    }
    Ok(())
}

#[tauri::command]
async fn inject_autofill(app: tauri::AppHandle, tab_id: String, script: String) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    #[cfg(target_os = "linux")]
    {
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    if let Err(e) = wv.evaluate_script(&script) {
                        eprintln!("inject_autofill failed: {}", e);
                    }
                }
            });
        }).map_err(|_| "Failed to run on main thread".to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
        wv.eval(&script)
            .map_err(|e| format!("Failed to inject autofill script: {}", e))?;
        Ok(())
    }
}

/// Execute JavaScript in the embedded browser and return the result.
/// 
/// Uses message passing: injects wrapper script that executes code and calls back with result.
/// Timeout: 120 seconds. Returns JSON-serialized result.
#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn eval_webview_script(
    app: tauri::AppHandle,
    tab_id: String,
    script: String,
) -> Result<String, String> {
    let eval_id = uuid::Uuid::new_v4().to_string();
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().unwrap();
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
    
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
                // Indirect eval: executes at global scope so var declarations land on window.*
                // Also handles both statements (var x = ...) and expressions (() => value)
                let __result = (0, eval)(`{}`);
                if (__result instanceof Promise) {{
                    __result = await __result;
                }}
                await window.__TAURI_INTERNALS__.invoke('_eval_callback', {{
                    id: '{}',
                    success: true,
                    result: JSON.stringify(__result !== undefined ? __result : null)
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
    
    // Wait for callback with 120s timeout
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(120),
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
            Err("Timeout waiting for eval result (120s)".to_string())
        },
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn eval_webview_script(
    app: tauri::AppHandle,
    tab_id: String,
    script: String,
) -> Result<String, String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let escaped_script = script
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");

    let eval_id_js = uuid::Uuid::new_v4().to_string().replace('-', "");
    let wrapped_script = format!(
        r#"(function() {{
            try {{
                var __result = (0, eval)(`{escaped}`);
                if (__result && typeof __result === 'object' && typeof __result.then === 'function') {{
                    var __id = '{eval_id}';
                    window['__ogre_' + __id] = {{ pending: true }};
                    __result.then(function(v) {{
                        window['__ogre_' + __id] = {{ done: true, value: v }};
                    }}).catch(function(e) {{
                        window['__ogre_' + __id] = {{ done: true, error: String(e) }};
                    }});
                    return {{ __ogre_pending: __id }};
                }}
                return __result;
            }} catch (__e) {{
                return {{ __ogre_error: String(__e) + (__e && __e.stack ? '\n' + __e.stack : '') }};
            }}
        }})()"#,
        escaped = escaped_script,
        eval_id = eval_id_js
    );
    let label_for_poll = label.clone();
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx_mutex = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                let tx_for_callback = std::sync::Arc::clone(&tx_mutex);
                wv.evaluate_script_with_callback(&wrapped_script, move |result: String| {
                    if let Some(sender) = tx_for_callback.lock().unwrap().take() {
                        let _ = sender.send(result);
                    }
                })
                .unwrap_or_else(|e| {
                    eprintln!("evaluate_script_with_callback failed: {}", e);
                    if let Some(sender) = tx_mutex.lock().unwrap().take() {
                        let _ = sender.send(format!(
                            "{{\"__ogre_error\":\"wry eval failed: {}\"}}",
                            e
                        ));
                    }
                });
            } else {
                eprintln!("eval_webview_script: webview not found for label {}", label);
                if let Some(sender) = tx_mutex.lock().unwrap().take() {
                    let _ = sender.send("null".to_string());
                }
            }
        });
    })
    .map_err(|_| "Failed to run on main thread".to_string())?;
    let initial = match tokio::time::timeout(tokio::time::Duration::from_secs(120), rx).await {
        Ok(Ok(r)) => if r.is_empty() { "null".to_string() } else { r },
        Ok(Err(_)) => return Err("Callback channel closed unexpectedly".to_string()),
        Err(_) => return Err("Timeout waiting for eval result (120s)".to_string()),
    };

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&initial) {
        if let Some(err) = parsed.get("__ogre_error").and_then(|v| v.as_str()) {
            return Err(format!("Script error: {}", err));
        }

        if let Some(pending_id) = parsed.get("__ogre_pending").and_then(|v| v.as_str()) {
            let poll_script = format!(
                r#"(function() {{
                    var r = window['__ogre_{id}'];
                    if (r && r.done) {{
                        delete window['__ogre_{id}'];
                        if (r.error) return {{ __ogre_error: r.error }};
                        return r.value;
                    }}
                    return {{ __ogre_polling: true }};
                }})()"#,
                id = pending_id
            );
            let poll_label = label_for_poll.clone();
            let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(120);

            loop {
                if tokio::time::Instant::now() > deadline {
                    return Err("Timeout waiting for async eval result (120s)".to_string());
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

                let (ptx, prx) = tokio::sync::oneshot::channel::<String>();
                let ptx_mutex = std::sync::Arc::new(std::sync::Mutex::new(Some(ptx)));
                let ps = poll_script.clone();
                let pl = poll_label.clone();

                app.run_on_main_thread(move || {
                    LINUX_WEBVIEWS.with(|webviews| {
                        if let Some(wv) = webviews.borrow().get(&pl) {
                            let ptx_cb = std::sync::Arc::clone(&ptx_mutex);
                            wv.evaluate_script_with_callback(&ps, move |r: String| {
                                if let Some(s) = ptx_cb.lock().unwrap().take() {
                                    let _ = s.send(r);
                                }
                            }).unwrap_or_else(|e| {
                                if let Some(s) = ptx_mutex.lock().unwrap().take() {
                                    let _ = s.send(format!("{{\"__ogre_error\":\"poll failed: {}\"}}", e));
                                }
                            });
                        }
                    });
                }).map_err(|_| "Failed to run poll on main thread".to_string())?;

                let poll_result = match tokio::time::timeout(tokio::time::Duration::from_secs(5), prx).await {
                    Ok(Ok(r)) => if r.is_empty() { "null".to_string() } else { r },
                    Ok(Err(_)) => continue,
                    Err(_) => continue,
                };

                if let Ok(pv) = serde_json::from_str::<serde_json::Value>(&poll_result) {
                    if pv.get("__ogre_polling").is_some() {
                        continue;
                    }
                    if let Some(err) = pv.get("__ogre_error").and_then(|v| v.as_str()) {
                        return Err(format!("Script error: {}", err));
                    }
                }
                return Ok(poll_result);
            }
        }
    }

    Ok(initial)
}

/// Inject JavaScript into the embedded browser without waiting for a return value.
///
/// Unlike eval_webview_script, this does NOT wrap the script in the callback
/// mechanism. Use this for scripts that set global variables (e.g. library IIFEs).
/// Top-level var declarations become window properties because wv.eval() runs in
/// the global execution context.
#[tauri::command]
async fn inject_webview_script(
    app: tauri::AppHandle,
    tab_id: String,
    script: String,
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };

    #[cfg(target_os = "linux")]
    {
        app.run_on_main_thread(move || {
            LINUX_WEBVIEWS.with(|webviews| {
                if let Some(wv) = webviews.borrow().get(&label) {
                    if let Err(e) = wv.evaluate_script(&script) {
                        eprintln!("inject_webview_script failed: {}", e);
                    }
                }
            });
        }).map_err(|_| "Failed to run on main thread".to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let wv = app.get_webview(&label).ok_or_else(|| "Embedded browser not open".to_string())?;
        wv.eval(&script).map_err(|e| format!("Failed to inject script: {}", e))
    }
}

#[derive(serde::Serialize)]
struct LocalSkillFile {
    folder: String,
    content: String,
}

/// Scan ~/.config/opencode/skills/ for local skill files (SKILL.md) and return their contents.
#[tauri::command]
async fn scan_local_skills(app: tauri::AppHandle) -> Result<Vec<LocalSkillFile>, String> {
    let home = app.path().home_dir().map_err(|e| format!("Failed to get home dir: {}", e))?;
    let skills_dir = home.join(".config").join("opencode").join("skills");

    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    let entries = std::fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder = match path.file_name().and_then(|n| n.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let skill_file = path.join("SKILL.md");
        let content = if skill_file.exists() {
            std::fs::read_to_string(&skill_file)
                .map_err(|e| format!("Failed to read {}: {}", skill_file.display(), e))?
        } else {
            continue;
        };
        results.push(LocalSkillFile { folder, content });
    }
    Ok(results)
}

/// Internal callback handler for eval results.
/// Called by injected JavaScript wrapper via invoke().
#[cfg(not(target_os = "linux"))]
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

// ── OAuth Callback Server Commands ───────────────────────────────────────

/// Process an incoming TCP connection for OAuth callback.
async fn process_oauth_connection(
    stream: &mut tokio::net::TcpStream,
    actual_port: u16,
) -> Result<OAuthCallbackResult, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // Read HTTP request until \r\n\r\n
    let mut buf = vec![0u8; 4096];
    let mut total = 0usize;
    loop {
        let n = stream.read(&mut buf[total..]).await
            .map_err(|e| format!("Read failed: {}", e))?;
        if n == 0 { break; }
        total += n;
        if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if total >= buf.len() { break; }
    }

    let request = String::from_utf8_lossy(&buf[..total]).to_string();
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let query_string = path.split('?').nth(1).unwrap_or("");

    let params: HashMap<String, String> =
        url::form_urlencoded::parse(query_string.as_bytes())
            .into_owned()
            .collect();

    // Check for OAuth error response
    if let Some(error) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        let body = format!(
            "<html><body><h1>Authentication Failed</h1><p>{}: {}</p></body></html>",
            error, desc
        );
        let response = format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
        return Err(format!("OAuth error: {}: {}", error, desc));
    }

    let code = params.get("code")
        .ok_or("Missing 'code' parameter in OAuth callback")?
        .clone();
    let state_val = params.get("state")
        .ok_or("Missing 'state' parameter in OAuth callback")?
        .clone();

    // Send success response to browser
    let body = "<html><body><h1>Authentication successful!</h1><p>You can close this tab.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    Ok(OAuthCallbackResult { code, state: state_val, port: actual_port })
}

#[tauri::command]
async fn start_oauth_callback_server(
    app: tauri::AppHandle,
    port: u16,
) -> Result<OAuthCallbackResult, String> {
    // Try binding to requested port, fall back to port+1 through port+19
    let listener = {
        let mut bound = None;
        for offset in 0u16..20 {
            let try_port = port.checked_add(offset).ok_or("Port overflow")?;
            match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", try_port)).await {
                Ok(l) => { bound = Some(l); break; }
                Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => continue,
                Err(e) => return Err(format!("Failed to bind port {}: {}", try_port, e)),
            }
        }
        bound.ok_or_else(|| format!("All ports {}-{} are in use or reserved", port, port + 19))?
    };

    let actual_port = listener.local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();

    // Set up cancellation channel
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let state = app.state::<Mutex<OAuthCallbackState>>();
        let mut guard = state.lock().unwrap();
        guard.cancel_tx = Some(cancel_tx);
    }

    let result = tokio::select! {
        accept_result = listener.accept() => {
            match accept_result {
                Ok((mut stream, _)) => process_oauth_connection(&mut stream, actual_port).await,
                Err(e) => Err(format!("Accept failed: {}", e)),
            }
        }
        _ = cancel_rx => {
            Err("OAuth cancelled".to_string())
        }
        _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {
            Err("OAuth timeout (5 minutes)".to_string())
        }
    };

    // Clean up: remove cancel_tx from state
    {
        let state = app.state::<Mutex<OAuthCallbackState>>();
        let mut guard = state.lock().unwrap();
        guard.cancel_tx = None;
    }

    result
}

#[tauri::command]
async fn stop_oauth_callback_server(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state = app.state::<Mutex<OAuthCallbackState>>();
    let cancel_tx = {
        let mut guard = state.lock().unwrap();
        guard.cancel_tx.take()
    };

    if let Some(tx) = cancel_tx {
        let _ = tx.send(());
    }

    Ok(())
}


#[tauri::command]
fn get_cdp_port(state: tauri::State<CdpPortState>) -> Result<Option<u16>, String> {
    Ok(state.port)
}

#[tauri::command]
async fn discover_cdp_target(port: u16) -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("http://127.0.0.1:{}/json", port);
    let targets: Vec<CdpTarget> = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch CDP targets: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse CDP targets: {}", e))?;

    // Filter targets with exact parity to TypeScript logic in cdp-client.ts:53-59
    let target = targets.iter().find(|t| {
        t.target_type == "page"
            && t.url != "about:blank"
            && !t.url.is_empty()
            && !t.url.starts_with("tauri://localhost")
            && !t.url.starts_with("https://tauri.localhost")
            && !t.url.starts_with("http://localhost:1420")
            && !t.url.starts_with("http://localhost:5173")
    });

    Ok(target.and_then(|t| t.ws_debugger_url.clone()))
}

/// Simulate mouse events on a Linux embedded webview using GDK.
/// Only available on Linux; no-op on other platforms.
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_mouse_event(
    app: tauri::AppHandle,
    tab_id: String,
    event_type: String,    // "click" | "mousedown" | "mouseup" | "mousemove"
    x: f64,
    y: f64,
    button: Option<u32>,   // 1=left, 2=middle, 3=right (default: 1)
    modifiers: Option<u32>, // GDK modifier mask (default: 0)
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let btn = button.unwrap_or(1);
    let mods = gtk::gdk::ModifierType::from_bits_truncate(modifiers.unwrap_or(0));
    
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                let widget: gtk::Widget = wv.webview().upcast();
                if let Some(window) = widget.window() {
                    let ix = x as i32;
                    let iy = y as i32;
                    match event_type.as_str() {
                        "click" => {
                            gtk::gdk::test_simulate_button(
                                &window, ix, iy, btn,
                                mods,
                                gtk::gdk::EventType::ButtonPress,
                            );
                            gtk::gdk::test_simulate_button(
                                &window, ix, iy, btn,
                                mods,
                                gtk::gdk::EventType::ButtonRelease,
                            );
                        }
                        "mousedown" => {
                            gtk::gdk::test_simulate_button(
                                &window, ix, iy, btn,
                                mods,
                                gtk::gdk::EventType::ButtonPress,
                            );
                        }
                        "mouseup" => {
                            gtk::gdk::test_simulate_button(
                                &window, ix, iy, btn,
                                mods,
                                gtk::gdk::EventType::ButtonRelease,
                            );
                        }
                        "mousemove" => {
                            // Motion event: use test_simulate_button with MotionNotify
                            // Actually need to use GDK motion directly via gdk_sys or
                            // simulate a very slight movement. For now just move focus.
                            let _ = widget.grab_focus();
                        }
                        _ => {
                            eprintln!("simulate_mouse_event: unknown event_type: {}", event_type);
                        }
                    }
                } else {
                    eprintln!("simulate_mouse_event: widget not realized for tab {}", tab_id);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

/// Simulate keyboard key events on a Linux embedded webview using GDK.
/// Only available on Linux; no-op on other platforms.
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_key_event(
    app: tauri::AppHandle,
    tab_id: String,
    event_type: String,    // "keydown" | "keyup" | "keypress" (= keydown+keyup)
    key_val: u32,          // GDK keyval (e.g. gtk::gdk::keys::constants::Return)
    modifiers: Option<u32>, // GDK modifier mask (default: 0)
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    let mods = gtk::gdk::ModifierType::from_bits_truncate(modifiers.unwrap_or(0));
    
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                let widget: gtk::Widget = wv.webview().upcast();
                if let Some(window) = widget.window() {
                    match event_type.as_str() {
                        "keydown" => {
                            gtk::gdk::test_simulate_key(
                                &window, 0, 0, key_val, mods,
                                gtk::gdk::EventType::KeyPress,
                            );
                        }
                        "keyup" => {
                            gtk::gdk::test_simulate_key(
                                &window, 0, 0, key_val, mods,
                                gtk::gdk::EventType::KeyRelease,
                            );
                        }
                        "keypress" => {
                            gtk::gdk::test_simulate_key(
                                &window, 0, 0, key_val, mods,
                                gtk::gdk::EventType::KeyPress,
                            );
                            gtk::gdk::test_simulate_key(
                                &window, 0, 0, key_val, mods,
                                gtk::gdk::EventType::KeyRelease,
                            );
                        }
                        _ => {
                            eprintln!("simulate_key_event: unknown event_type: {}", event_type);
                        }
                    }
                } else {
                    eprintln!("simulate_key_event: widget not realized for tab {}", tab_id);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

/// Simulate text input on a Linux embedded webview using GDK.
/// Only available on Linux; no-op on other platforms.
#[cfg(target_os = "linux")]
#[tauri::command]
async fn simulate_text_input(
    app: tauri::AppHandle,
    tab_id: String,
    text: String,
) -> Result<(), String> {
    let label = {
        let state = app.state::<Mutex<WebviewState>>();
        let guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        guard.tabs.get(&tab_id).cloned().ok_or_else(|| format!("Tab {} not found", tab_id))?
    };
    
    app.run_on_main_thread(move || {
        LINUX_WEBVIEWS.with(|webviews| {
            if let Some(wv) = webviews.borrow().get(&label) {
                let widget: gtk::Widget = wv.webview().upcast();
                if let Some(window) = widget.window() {
                    for ch in text.chars() {
                        // For ASCII chars, keyval equals Unicode codepoint
                        let keyval = ch as u32;
                        gtk::gdk::test_simulate_key(
                            &window, 0, 0, keyval, gtk::gdk::ModifierType::empty(),
                            gtk::gdk::EventType::KeyPress,
                        );
                        gtk::gdk::test_simulate_key(
                            &window, 0, 0, keyval, gtk::gdk::ModifierType::empty(),
                            gtk::gdk::EventType::KeyRelease,
                        );
                    }
                } else {
                    eprintln!("simulate_text_input: widget not realized for tab {}", tab_id);
                }
            }
        });
    }).map_err(|_| "Failed to run on main thread".to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // === CDP: Dynamic port allocation for embedded browser automation ===
    // Try ports 9222-9242 sequentially. MUST be set before WebView2 creates its browser process.
    let cdp_port: Option<u16> = {
        let mut found = None;
        for port in 9222u16..=9242 {
            match std::net::TcpListener::bind(format!("127.0.0.1:{}", port)) {
                Ok(_listener) => {
                    // Port is available — use it (listener drops here, releasing the port)
                    found = Some(port);
                    break;
                }
                Err(_) => continue,
            }
        }
        found
    };
    if let Some(port) = cdp_port {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            format!("--remote-debugging-port={} --remote-allow-origins=*", port),
        );
        eprintln!("[ogre] CDP enabled on port {} (dynamic allocation)", port);
    } else {
        eprintln!("[ogre] CDP unavailable: all ports 9222-9242 are in use");
    }
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
        // Migration 6: site_profiles table
        Migration {
            version: 6,
            description: "create_site_profiles",
            sql: "CREATE TABLE IF NOT EXISTS site_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url_patterns TEXT NOT NULL,
    selectors TEXT NOT NULL,
    feedback TEXT NOT NULL,
    save TEXT NOT NULL,
    navigation TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);",
            kind: MigrationKind::Up,
        },
        // Migration 7: batch_session table for resume persistence
        Migration {
            version: 7,
            description: "create_batch_session",
            sql: "CREATE TABLE IF NOT EXISTS batch_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    last_student_name TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_session_url ON batch_session(url);",
            kind: MigrationKind::Up,
        },
        // Migration 8: skills table for Skills system
        Migration {
            version: 8,
            description: "create_skills",
            sql: "CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    source TEXT,
    source_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source ON skills(source, source_id) WHERE source IS NOT NULL;",
            kind: MigrationKind::Up,
        },
        // Migration 9: add url_pattern column to skills table for site profile auto-injection
        Migration {
            version: 9,
            description: "add_url_pattern_to_skills",
            sql: "ALTER TABLE skills ADD COLUMN url_pattern TEXT;",
            kind: MigrationKind::Up,
        },
        // Migration 10: response_embeddings table for vector search
        Migration {
            version: 10,
            description: "create_response_embeddings_table",
            sql: "CREATE TABLE IF NOT EXISTS response_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES grading_sessions(id),
    rubric_hash TEXT NOT NULL,
    student_response TEXT,
    score REAL NOT NULL,
    feedback TEXT,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_embeddings_rubric_hash ON response_embeddings(rubric_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON response_embeddings(embedding_model);",
            kind: MigrationKind::Up,
        },
        // Migration 11: add extraction column to site_profiles
        Migration {
            version: 11,
            description: "add_extraction_column_to_site_profiles",
            sql: "ALTER TABLE site_profiles ADD COLUMN extraction TEXT DEFAULT NULL;",
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
            #[cfg(not(target_os = "linux"))]
            _eval_callback,
            inject_webview_script,
            scan_local_skills,
            start_oauth_callback_server,
            stop_oauth_callback_server,
            get_cdp_port,
            discover_cdp_target,
            #[cfg(target_os = "linux")]
            simulate_mouse_event,
            #[cfg(target_os = "linux")]
            simulate_key_event,
            #[cfg(target_os = "linux")]
            simulate_text_input,
        ])
        .plugin(tauri_plugin_opener::init())
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
        .manage(Mutex::new(ServerState { child: None, status_item: None }))
        .manage(Mutex::new(WebviewState { tabs: HashMap::new() }))
        .manage(EvalRegistry::new(Mutex::new(HashMap::new())))
        .manage(Mutex::new(OAuthCallbackState { cancel_tx: None }))
        .manage(CdpPortState { port: cdp_port })
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
                let state = app.state::<Mutex<ServerState>>();
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
            let server_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                spawn_server(&server_handle, restart_count);
            });

            // Linux: initialize shared GtkFixed container for embedded browser webviews.
            // ALL wry webviews must share this single GtkFixed instance (per wry PR #1504).
            //
            // IMPORTANT: We use GtkOverlay so the GtkFixed is layered ON TOP of the main
            // webview, not beside it in the vbox. Using vbox.pack_start() would split
            // the window vertically, compressing the main Svelte UI.
            #[cfg(target_os = "linux")]
            {
                let window = app.get_webview_window("main")
                    .ok_or("Main window not found for GtkFixed setup")?;
                let vbox = window.default_vbox()
                    .map_err(|e| format!("Failed to get default vbox: {}", e))?;

                // Create an overlay container: main webview = background, GtkFixed = foreground
                let overlay = gtk::Overlay::new();

                // Reparent existing vbox children (the main webview) into the overlay
                let children: Vec<gtk::Widget> = vbox.children();
                if let Some(child) = children.first() {
                    vbox.remove(child);
                    overlay.add(child);  // First child becomes the "main" child
                }

                // Create the GtkFixed for embedded browser webviews
                let fixed = gtk::Fixed::new();
                overlay.add_overlay(&fixed);
                // Pass input through to the main webview where the GtkFixed has no children
                overlay.set_overlay_pass_through(&fixed, true);

                // Add the overlay to the vbox in place of the original webview
                vbox.pack_start(&overlay, true, true, 0);
                overlay.show_all();

                GTK_FIXED.with(|f| {
                    *f.borrow_mut() = Some(fixed);
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill sidecar when the app exits
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<Mutex<ServerState>>();
                let mut guard = state.lock().unwrap();
                guard.child.take();
            }
        });
}
