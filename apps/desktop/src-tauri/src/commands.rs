use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::{offline_diag, platform, repair, sidecar, tray};

#[derive(Debug, Serialize)]
pub struct GatewayInfo {
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct ServiceStatus {
    pub running: bool,
    pub port: u16,
}

/// Returns the gateway connection info so the WebView can connect.
/// This is the primary IPC command — the UI fetches the token from here
/// instead of relying solely on URL hash injection.
#[tauri::command]
pub async fn get_gateway_info() -> Result<GatewayInfo, String> {
    Ok(GatewayInfo {
        port: sidecar::gateway_port(),
        token: sidecar::gateway_token(),
    })
}

/// Start the gateway sidecar service.
#[tauri::command]
pub async fn start_service(app: AppHandle) -> Result<String, String> {
    if sidecar::is_sidecar_running() {
        return Err("服务已在运行中".to_string());
    }

    sidecar::start_sidecar(app.clone())
        .map_err(|e| format!("启动服务失败: {}", e))?;

    tray::update_tray_menu_state(&app);
    Ok("服务启动成功".to_string())
}

/// Stop the gateway sidecar service.
#[tauri::command]
pub async fn stop_service(app: AppHandle) -> Result<String, String> {
    if !sidecar::is_sidecar_running() {
        return Err("服务未在运行".to_string());
    }

    sidecar::stop_sidecar()
        .map_err(|e| format!("停止服务失败: {}", e))?;

    tray::update_tray_menu_state(&app);
    Ok("服务已停止".to_string())
}

/// Restart the gateway sidecar service.
#[tauri::command]
pub async fn restart_service(app: AppHandle) -> Result<String, String> {
    sidecar::restart_sidecar(app.clone())
        .map_err(|e| format!("重启服务失败: {}", e))?;

    tray::update_tray_menu_state(&app);
    Ok("服务重启成功".to_string())
}

/// Get the service running status.
#[tauri::command]
pub async fn get_service_status() -> Result<ServiceStatus, String> {
    Ok(ServiceStatus {
        running: sidecar::is_sidecar_running(),
        port: sidecar::gateway_port(),
    })
}

/// Check if gateway needs first-run setup.
/// Uses the gateway's own `needsSetup` field from /health, which calls
/// shouldShowSetupWizard() — the single source of truth for setup state.
#[tauri::command]
pub async fn check_needs_setup() -> Result<bool, String> {
    let port = sidecar::gateway_port();
    let url = format!("http://127.0.0.1:{}/health", port);

    let response = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("client build failed: {}", e))?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("health check failed: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("parse health failed: {}", e))?;

    // Use the gateway's authoritative needsSetup field
    if let Some(needs) = body.get("needsSetup").and_then(|v| v.as_bool()) {
        return Ok(needs);
    }

    // Fallback: if needsSetup field is missing (older gateway), check hasConfiguredProvider
    if let Some(has_provider) = body.get("hasConfiguredProvider").and_then(|v| v.as_bool()) {
        return Ok(!has_provider);
    }

    Ok(true)
}

/// Show the screen-share border overlay (transparent, always-on-top, click-through).
#[tauri::command]
pub async fn show_screen_border(app: AppHandle) -> Result<String, String> {
    // If overlay already exists, just return
    if app.get_webview_window("screen-share-border").is_some() {
        return Ok("already visible".to_string());
    }

    // Get primary monitor size in logical pixels (accounts for HiDPI scaling).
    // monitor.size() returns PhysicalSize but inner_size() expects logical pixels.
    let (width, height) = if let Some(monitor) = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
    {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        (size.width as f64 / scale, size.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    };

    let overlay = WebviewWindowBuilder::new(
        &app,
        "screen-share-border",
        WebviewUrl::App("screen-border.html".into()),
    )
    .title("")
    .inner_size(width, height)
    .position(0.0, 0.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .build()
    .map_err(|e| format!("Failed to create overlay: {}", e))?;

    // Make the window click-through so users can interact with everything underneath
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| format!("Failed to set click-through: {}", e))?;

    Ok("ok".to_string())
}

/// Hide the screen-share border overlay.
#[tauri::command]
pub async fn hide_screen_border(app: AppHandle) -> Result<String, String> {
    if let Some(overlay) = app.get_webview_window("screen-share-border") {
        overlay
            .close()
            .map_err(|e| format!("Failed to close overlay: {}", e))?;
    }
    Ok("ok".to_string())
}

/// Open the sidecar log file in the system file explorer (with file selected).
#[tauri::command]
pub async fn open_logs_directory() -> Result<String, String> {
    let log_path = sidecar::log_file_path()
        .map_err(|e| format!("获取日志路径失败: {}", e))?;

    platform::open_file_in_explorer(&log_path)
        .map_err(|e| format!("打开日志文件失败: {}", e))?;

    Ok(format!("已打开日志: {}", log_path.display()))
}

// ── Repair Assistant IPC commands ───────────────────────────────────────────

/// Run all offline diagnostic checks and return results.
#[tauri::command]
pub async fn repair_run_diagnostics() -> Result<repair::diagnostics::DiagnosticResult, String> {
    Ok(repair::diagnostics::run_all_checks())
}

/// Discover locally available AI providers for the repair chat.
#[tauri::command]
pub async fn repair_discover_providers() -> Result<Vec<repair::provider_discovery::ProviderInfo>, String> {
    Ok(repair::provider_discovery::discover_and_cache())
}

/// Send a message to the AI repair assistant (streaming via events).
///
/// `gateway_running`: pass `true` when the Gateway sidecar is alive but a feature
/// is broken (API errors, model config issues, etc.), `false` when the Gateway
/// has crashed or failed to start.  Selects the appropriate system prompt.
#[tauri::command]
pub async fn repair_ai_chat(
    app: AppHandle,
    message: String,
    context: String,
    provider_id: String,
    gateway_running: bool,
) -> Result<(), String> {
    let provider = repair::provider_discovery::get_cached_provider(&provider_id)
        .ok_or_else(|| format!("找不到 AI provider: {}", provider_id))?;
    repair::ai_client::stream_chat(&app, &provider, &message, &context, gateway_running).await
}

/// Apply an automated repair fix by its ID.
#[tauri::command]
pub async fn repair_apply_fix(app: AppHandle, fix_id: String) -> Result<repair::repair_actions::FixResult, String> {
    Ok(repair::repair_actions::apply_fix(&app, &fix_id))
}

/// Upload crash logs to the remote support server.
/// `attachments`: optional base64 data-URL encoded screenshots (max 3).
#[tauri::command]
pub async fn upload_crash_logs(
    description: String,
    attachments: Option<Vec<String>>,
) -> Result<offline_diag::UploadResult, String> {
    offline_diag::upload_crash_logs(description, attachments.unwrap_or_default()).await
}

/// Get recent log entries for AI-assisted diagnosis.
/// Reads all known log sources, filters to error/warn lines, truncated to ~16KB.
#[tauri::command]
pub async fn repair_get_recent_logs() -> Result<String, String> {
    Ok(offline_diag::get_recent_logs_summary())
}

/// Get a paginated batch of raw log content for incremental AI analysis.
///
/// `batch=0` returns the most recent 80KB of logs (newest content first).
/// `batch=1` returns the preceding 80KB, and so on.
/// The response includes `has_more` and `total_batches` so the frontend
/// can loop until all logs are analyzed.
#[tauri::command]
pub async fn repair_get_logs_batch(batch: u32) -> Result<offline_diag::LogBatchResult, String> {
    Ok(offline_diag::get_logs_batch(batch))
}

/// Check SSH server status on this machine.
#[tauri::command]
pub async fn repair_ssh_check() -> Result<repair::ssh_setup::SshStatus, String> {
    Ok(repair::ssh_setup::check_ssh())
}

/// Enable/install SSH server on this machine.
#[tauri::command]
pub async fn repair_ssh_enable() -> Result<(), String> {
    repair::ssh_setup::enable_ssh()
}

/// Start a remote repair tunnel (frpc + SSH key injection).
#[tauri::command]
pub async fn repair_tunnel_start(
    session_id: String,
    public_key: String,
    local_ssh_port: Option<u16>,
) -> Result<repair::remote_tunnel::TunnelInfo, String> {
    // Inject the repair session's public key into authorized_keys
    repair::ssh_setup::inject_authorized_key(&public_key, &session_id)?;

    // Determine SSH port (use provided or auto-detect)
    let ssh_port = local_ssh_port.unwrap_or_else(|| {
        let status = repair::ssh_setup::check_ssh();
        status.port
    });

    match repair::remote_tunnel::start_tunnel(&session_id, ssh_port) {
        Ok(info) => Ok(info),
        Err(e) => {
            // Clean up the injected key on tunnel failure
            let _ = repair::ssh_setup::cleanup_authorized_key(&session_id);
            Err(e)
        }
    }
}

/// Stop the remote repair tunnel and clean up SSH keys.
#[tauri::command]
pub async fn repair_tunnel_stop(session_id: String) -> Result<(), String> {
    repair::remote_tunnel::stop_tunnel()?;
    repair::ssh_setup::cleanup_authorized_key(&session_id)?;
    Ok(())
}

/// Get the current tunnel status (for UI polling).
#[tauri::command]
pub async fn repair_tunnel_status() -> Result<repair::remote_tunnel::TunnelStatus, String> {
    Ok(repair::remote_tunnel::get_tunnel_status())
}

// ====== Updater commands ======

/// Check for updates and return version info if available.
#[tauri::command]
pub async fn check_for_update() -> Result<Option<UpdateInfo>, String> {
    Ok(None)
}

/// Download and install the pending update, then restart the app.
#[tauri::command]
pub async fn install_update() -> Result<(), String> {
    Err("Auto update is disabled in the open-source build".to_string())
}

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}
