// Prevents additional console window on Windows in release builds.
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod offline_diag;
mod platform;
mod repair;
mod sidecar;
mod tray;

use std::io::Write;
use std::sync::Mutex;
use tauri::Manager;
use tauri::WebviewUrl;

/// Simple file logger for debugging desktop startup issues.
static LOG_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);

fn log(msg: &str) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let line = format!("[{}] {}\n", timestamp, msg);
    if let Ok(mut guard) = LOG_FILE.lock() {
        if let Some(ref mut f) = *guard {
            let _ = f.write_all(line.as_bytes());
            let _ = f.flush();
        }
    }
}

fn init_log() {
    let log_path = dirs::home_dir()
        .map(|h| h.join(".openclaw").join("desktop-debug.log"))
        .unwrap_or_else(|| std::path::PathBuf::from("desktop-debug.log"));
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
    {
        let mut guard = LOG_FILE.lock().unwrap();
        *guard = Some(file);
    }
}

/// Poll the gateway's /health endpoint from Rust and inject
/// the token via hash change when ready (no page reload).
/// After the gateway is ready, starts a watchdog that auto-restarts
/// the sidecar if it crashes unexpectedly.
fn poll_and_navigate(handle: tauri::AppHandle) {
    let port = sidecar::gateway_port();
    let token = sidecar::gateway_token();
    let health_url = format!("http://127.0.0.1:{}/health", port);

    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .no_proxy()
            .build()
            .unwrap();

        let start = std::time::Instant::now();
        let max_wait = std::time::Duration::from_secs(300);

        loop {
            let elapsed = start.elapsed();
            if elapsed > max_wait {
                log("Gateway health timeout!");
                // Update loading text to show timeout
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.eval(
                        "var _l=document.querySelector('#__loading__');if(_l){_l.children[1].textContent='\\u670D\\u52A1\\u542F\\u52A8\\u8D85\\u65F6\\uFF0C\\u8BF7\\u91CD\\u65B0\\u6253\\u5F00\\u5E94\\u7528';_l.children[0].style.animation='none';_l.children[0].style.borderColor='#f87171'}"
                    );
                }
                return;
            }

            match client.get(&health_url).send() {
                Ok(resp) => {
                    if let Ok(body) = resp.json::<serde_json::Value>() {
                        // OpenClaw upstream returns {"ok":true,"status":"live"}
                        // ClawdBot returned {"ready":true,"needsSetup":false}
                        let ready = body.get("ok").and_then(|v| v.as_bool())
                            .or_else(|| body.get("ready").and_then(|v| v.as_bool()))
                            .unwrap_or(false);
                        if !ready {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            continue;
                        }

                        // Check if setup wizard is needed
                        let needs_setup = body.get("needsSetup")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);

                        if needs_setup {
                            log("Gateway ready! -> needsSetup=true, navigating to setup wizard");
                            if let Some(window) = handle.get_webview_window("main") {
                                let js = format!(
                                    "window.location.href='http://127.0.0.1:{}/setup';",
                                    port,
                                );
                                let _ = window.eval(&js);
                                log("Navigated to setup wizard");
                            }
                        } else {
                            log("Gateway ready! -> navigating to gateway CN UI");
                            if let Some(window) = handle.get_webview_window("main") {
                                let js = format!(
                                    "window.location.href='http://127.0.0.1:{}/#token={}&gatewayUrl=ws%3A%2F%2F127.0.0.1%3A{}';",
                                    port, token, port,
                                );
                                let _ = window.eval(&js);
                                log("Navigated to gateway CN UI");
                            }
                        }

                        // Gateway is up — start the watchdog to auto-restart on crash
                        start_sidecar_watchdog(handle);
                        return;
                    }
                }
                Err(e) => {
                    if start.elapsed().as_secs() % 5 == 0 {
                        log(&format!("Health check pending: {}", e));
                    }
                }
            }

            let delay = if elapsed.as_secs() < 10 { 300 } else { 1000 };
            std::thread::sleep(std::time::Duration::from_millis(delay));
        }
    });
}

/// Background watchdog that detects sidecar crashes and auto-restarts the gateway.
/// Checks every 5 seconds. On crash: cleans stale locks, restarts sidecar, waits
/// for health, then re-navigates the WebView.
fn start_sidecar_watchdog(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        // External gateway mode — no sidecar process to monitor.
        if sidecar::is_external_gateway() {
            log("[Watchdog] External gateway mode, watchdog disabled");
            return;
        }
        // Wait a bit before starting monitoring — the gateway just came up.
        std::thread::sleep(std::time::Duration::from_secs(10));
        log("[Watchdog] Sidecar watchdog started");

        let mut consecutive_failures: u32 = 0;
        const MAX_RESTART_ATTEMPTS: u32 = 5;

        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));

            if sidecar::is_sidecar_running() {
                consecutive_failures = 0;
                continue;
            }

            // Sidecar is dead
            consecutive_failures += 1;
            log(&format!(
                "[Watchdog] Sidecar crash detected! (attempt {}/{})",
                consecutive_failures, MAX_RESTART_ATTEMPTS
            ));

            if consecutive_failures > MAX_RESTART_ATTEMPTS {
                log("[Watchdog] Max restart attempts reached, stopping watchdog");
                // Show persistent error in WebView
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.eval(
                        "if(!document.querySelector('#__watchdog_err__')){var d=document.createElement('div');d.id='__watchdog_err__';d.style.cssText='position:fixed;top:0;left:0;right:0;padding:12px 20px;background:#991b1b;color:#fff;font:14px system-ui;text-align:center;z-index:99999';d.textContent='\\u670D\\u52A1\\u591A\\u6B21\\u91CD\\u542F\\u5931\\u8D25\\uFF0C\\u8BF7\\u901A\\u8FC7\\u6258\\u76D8\\u83DC\\u5355\\u201C\\u4E00\\u952E\\u68C0\\u4FEE\\u201D\\u8FDB\\u884C\\u4FEE\\u590D';document.body.appendChild(d)}"
                    );
                }
                return;
            }

            // Clean up orphaned child processes (MCP servers, workers) and stale locks
            sidecar::kill_orphaned_gateway_processes();
            sidecar::cleanup_gateway_locks();

            // Brief delay to let the OS release resources
            std::thread::sleep(std::time::Duration::from_millis(1000));

            // Attempt restart
            match sidecar::start_sidecar(handle.clone()) {
                Ok(()) => {
                    log("[Watchdog] Sidecar restarted, waiting for health...");
                    tray::update_tray_menu_state(&handle);

                    // Wait for gateway to become ready (up to 30s)
                    let port = sidecar::gateway_port();
                    let health_url = format!("http://127.0.0.1:{}/health", port);
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(3))
                        .no_proxy()
                        .build()
                        .unwrap_or_else(|_| reqwest::blocking::Client::new());

                    let start = std::time::Instant::now();
                    let mut ready = false;
                    while start.elapsed() < std::time::Duration::from_secs(30) {
                        if let Ok(resp) = client.get(&health_url).send() {
                            if let Ok(body) = resp.json::<serde_json::Value>() {
                                if body.get("ok").and_then(|v| v.as_bool())
                                    .or_else(|| body.get("ready").and_then(|v| v.as_bool()))
                                    .unwrap_or(false) {
                                    ready = true;
                                    break;
                                }
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }

                    if ready {
                        log("[Watchdog] Gateway back online, re-navigating WebView");
                        let token = sidecar::gateway_token();

                        // Check needsSetup from health endpoint for watchdog re-navigation
                        let watchdog_needs_setup = {
                            let health_url_check = format!("http://127.0.0.1:{}/health", port);
                            client.get(&health_url_check).send().ok()
                                .and_then(|r| r.json::<serde_json::Value>().ok())
                                .and_then(|b| b.get("needsSetup").and_then(|v| v.as_bool()))
                                .unwrap_or(false)
                        };
                        if watchdog_needs_setup {
                            if let Some(window) = handle.get_webview_window("main") {
                                log("[Watchdog] -> needsSetup=true, navigating to setup wizard");
                                let js = format!(
                                    "window.location.href='http://127.0.0.1:{}/setup';",
                                    port,
                                );
                                let _ = window.eval(&js);
                            }
                        } else {
                            if let Some(window) = handle.get_webview_window("main") {
                                log("[Watchdog] -> navigating to gateway CN UI");
                                let js = format!(
                                    "window.location.href='http://127.0.0.1:{}/#token={}&gatewayUrl=ws%3A%2F%2F127.0.0.1%3A{}';",
                                    port, token, port,
                                );
                                let _ = window.eval(&js);
                            }
                        }
                        // Reset failure counter on successful recovery
                        consecutive_failures = 0;
                    } else {
                        log("[Watchdog] Gateway did not become ready after restart");
                    }
                }
                Err(e) => {
                    log(&format!("[Watchdog] Failed to restart sidecar: {}", e));
                }
            }
        }
    });
}

/// Show a user-friendly error page in the WebView when the sidecar fails.
fn show_error_page(app: &tauri::App, error_msg: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let escaped = error_msg
            .replace('\\', "\\\\")
            .replace('\'', "\\'")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        let js = format!(
            r#"(function(){{
                function show(){{
                    var c=document.createElement('div');
                    c.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;text-align:center;padding:40px';
                    var icon=document.createElement('div');
                    icon.style.cssText='font-size:48px;margin-bottom:20px';
                    icon.textContent='\u26A0\uFE0F';
                    var h=document.createElement('h1');
                    h.style.cssText='margin:0 0 12px;font-size:22px;color:#fff';
                    h.textContent='\u670D\u52A1\u542F\u52A8\u5931\u8D25';
                    var p=document.createElement('p');
                    p.style.cssText='margin:0 0 24px;font-size:14px;color:#aaa;max-width:480px;line-height:1.6;white-space:pre-wrap';
                    p.textContent='{escaped}';
                    var btn=document.createElement('button');
                    btn.style.cssText='padding:10px 28px;border:none;border-radius:8px;background:#4a6cf7;color:#fff;font-size:14px;cursor:pointer';
                    btn.textContent='\u91CD\u65B0\u52A0\u8F7D';
                    btn.onclick=function(){{location.reload()}};
                    c.appendChild(icon);c.appendChild(h);c.appendChild(p);c.appendChild(btn);
                    document.body.innerHTML='';document.body.appendChild(c)
                }}
                if(document.readyState==='loading'){{document.addEventListener('DOMContentLoaded',show)}}else{{show()}}
            }})()"#,
            escaped = escaped,
        );
        let _ = window.eval(&js);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_log();
    log("=== OpenClawCN Desktop starting ===");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Another instance was launched — focus the existing window instead.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            tray::setup_tray(app)?;

            let handle = app.handle().clone();

            // Create main window programmatically so we can attach on_navigation.
            // Use splash.html (minimal dark loading page) instead of index.html
            // to avoid loading the full app JS at the tauri:// origin where
            // WebSocket connections fail. Rust poll_and_navigate will redirect
            // to the gateway http:// URL once it's ready.
            let window_icon = tauri::image::Image::from_bytes(
                include_bytes!("../icons/icon.png"),
            )
            .expect("failed to load window icon");

            let _window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("splash.html".into()),
            )
            .title("")
            .icon(window_icon)?
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .center()
            .visible(true)
            // Dark background matching the loading screen gradient (#0f0f1a)
            // prevents white flash during navigation between origins.
            .background_color(tauri::window::Color(15, 15, 26, 255))
            .on_navigation(|url| {
                let host = url.host_str().unwrap_or("");
                let scheme = url.scheme();
                // Allow local gateway and tauri URLs
                if host == "127.0.0.1" || host == "localhost" || host == "tauri.localhost"
                    || scheme == "tauri" || scheme == "about"
                {
                    return true;
                }
                // External URL — open in system browser and block WebView navigation
                if scheme == "https" || scheme == "http" {
                    log(&format!("Opening external URL in browser: {}", url));
                    let _ = open::that(url.as_str());
                    return false;
                }
                true
            })
            .on_new_window(|url, _features| {
                // Intercept target="_blank" links
                let host = url.host_str().unwrap_or("");
                if host != "127.0.0.1" && host != "localhost" {
                    // External URL — open in system browser
                    log(&format!("Opening new window URL in browser: {}", url));
                    let _ = open::that(url.as_str());
                    return tauri::webview::NewWindowResponse::Deny;
                }
                tauri::webview::NewWindowResponse::Allow
            })
            .build()
            .expect("failed to create main window");

            log(&format!("Initial WebView URL: about:blank (programmatic)"));

            log("[Updater] Disabled in open-source build");

            // Ensure CN defaults (plugins, gateway.mode) before gateway starts
            sidecar::ensure_cn_defaults();

            match sidecar::start_sidecar(handle.clone()) {
                Ok(()) => {
                    log("Sidecar started, beginning health poll...");
                    tray::update_tray_menu_state(&handle);
                    poll_and_navigate(handle);
                }
                Err(e) => {
                    log(&format!("Sidecar failed: {}", e));
                    show_error_page(
                        app,
                        &format!(
                            "\u{540E}\u{53F0}\u{670D}\u{52A1}\u{542F}\u{52A8}\u{5931}\u{8D25}\u{FF0C}\u{8BF7}\u{5C1D}\u{8BD5}\u{91CD}\u{65B0}\u{6253}\u{5F00}\u{5E94}\u{7528}\u{3002}\n\n\u{9519}\u{8BEF}\u{8BE6}\u{60C5}\u{FF1A}{}",
                            e
                        ),
                    );
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_gateway_info,
            commands::start_service,
            commands::stop_service,
            commands::restart_service,
            commands::get_service_status,
            commands::check_needs_setup,
            commands::open_logs_directory,
            commands::show_screen_border,
            commands::hide_screen_border,
            // Repair assistant
            commands::repair_run_diagnostics,
            commands::repair_discover_providers,
            commands::repair_ai_chat,
            commands::repair_apply_fix,
            commands::repair_get_recent_logs,
            commands::repair_get_logs_batch,
            commands::upload_crash_logs,
            commands::repair_ssh_check,
            commands::repair_ssh_enable,
            commands::repair_tunnel_start,
            commands::repair_tunnel_stop,
            commands::repair_tunnel_status,
            // Updater
            commands::check_for_update,
            commands::install_update,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Only intercept close for the main window (hide to tray).
                    // Overlay windows (screen-share-border, etc.) should close normally.
                    if window.label() == "main" {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    if window.label() == "main" {
                        sidecar::cleanup_on_exit();
                    }
                    if window.label() == "repair-assistant" {
                        // Best-effort: stop any active repair tunnel when the
                        // repair-assistant window is closed via the title bar X button.
                        if repair::remote_tunnel::is_tunnel_active() {
                            let _ = repair::remote_tunnel::stop_tunnel();
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
