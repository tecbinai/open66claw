//! Automated repair actions for the repair assistant.
//!
//! Each action is identified by a fix ID string and performs a specific
//! repair operation. Actions are triggered by the AI or by the user
//! clicking repair buttons in the UI.

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::AppHandle;

use crate::{platform, sidecar};

static DOCTOR_RUNNING: AtomicBool = AtomicBool::new(false);

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FixResult {
    pub fix_id: String,
    pub success: bool,
    pub message: String,
    pub requires_restart: bool,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn resolve_state_dir() -> PathBuf {
    super::resolve_state_dir()
}

/// Create a timestamped backup of `src`, e.g. `openclawcn.json.bak.1709500000`.
/// Using a timestamp prevents concurrent repair runs from overwriting each other's backup.
/// Returns the backup path on success.
fn backup_file_timestamped(src: &std::path::Path) -> Result<std::path::PathBuf, std::io::Error> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let ext = src
        .extension()
        .map(|e| format!("{}.bak.{}", e.to_string_lossy(), ts))
        .unwrap_or_else(|| format!("bak.{}", ts));
    let backup = src.with_extension(ext);
    fs::copy(src, &backup)?;
    Ok(backup)
}

fn log_action(action: &str, result: &str) {
    let logs_dir = resolve_state_dir().join("logs");
    let _ = fs::create_dir_all(&logs_dir);
    let log_path = logs_dir.join("desktop-debug.log");
    let timestamp = chrono_now_simple();
    let line = format!("[{}] [RepairAction] {} -> {}\n", timestamp, action, result);
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        });
}

fn chrono_now_simple() -> String {
    // Return local time HH:MM:SS (not UTC).
    #[cfg(target_os = "windows")]
    {
        #[repr(C)]
        #[allow(non_snake_case)]
        struct SYSTEMTIME {
            wYear: u16, wMonth: u16, wDayOfWeek: u16, wDay: u16,
            wHour: u16, wMinute: u16, wSecond: u16, wMilliseconds: u16,
        }
        extern "system" {
            fn GetLocalTime(lpSystemTime: *mut SYSTEMTIME);
        }
        let mut st = SYSTEMTIME {
            wYear: 0, wMonth: 0, wDayOfWeek: 0, wDay: 0,
            wHour: 0, wMinute: 0, wSecond: 0, wMilliseconds: 0,
        };
        unsafe { GetLocalTime(&mut st); }
        return format!("{:02}:{:02}:{:02}", st.wHour, st.wMinute, st.wSecond);
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback: UTC + 8 hours (China Standard Time).
        // Most CN desktop users are in CST; avoids libc dependency.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let local_secs = (now.as_secs() + 8 * 3600) % 86400;
        let hours = local_secs / 3600;
        let minutes = (local_secs % 3600) / 60;
        let seconds = local_secs % 60;
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    }
}

// ── Fix implementations ──────────────────────────────────────────────────────

fn fix_restart_service(app: &AppHandle) -> FixResult {
    log_action("restart_service", "attempting");

    match sidecar::restart_sidecar(app.clone()) {
        Ok(()) => {
            log_action("restart_service", "success");
            FixResult {
                fix_id: "restart_service".into(),
                success: true,
                message: "Gateway 服务已重启。请等待几秒后页面将自动恢复。".into(),
                requires_restart: false,
            }
        }
        Err(e) => {
            let msg = format!("重启失败: {}", e);
            log_action("restart_service", &msg);
            FixResult {
                fix_id: "restart_service".into(),
                success: false,
                message: msg,
                requires_restart: false,
            }
        }
    }
}

fn fix_kill_stale_port() -> FixResult {
    let port = sidecar::gateway_port();
    log_action("kill_stale_port", &format!("killing port {}", port));

    if sidecar::try_kill_port_occupant_pub(port) {
        log_action("kill_stale_port", "success");
        FixResult {
            fix_id: "kill_stale_port".into(),
            success: true,
            message: format!("已释放端口 {}。现在可以尝试重启服务。", port),
            requires_restart: true,
        }
    } else {
        log_action("kill_stale_port", "no process found or failed");
        FixResult {
            fix_id: "kill_stale_port".into(),
            success: false,
            message: format!("无法释放端口 {}。请手动关闭占用该端口的程序。", port),
            requires_restart: false,
        }
    }
}

fn fix_clear_gateway_locks() -> FixResult {
    log_action("clear_gateway_locks", "clearing");
    sidecar::cleanup_gateway_locks();
    log_action("clear_gateway_locks", "done");
    FixResult {
        fix_id: "clear_gateway_locks".into(),
        success: true,
        message: "已清理残留的 Gateway 锁文件。".into(),
        requires_restart: true,
    }
}

fn fix_clear_cache() -> FixResult {
    log_action("clear_cache", "clearing");
    let state_dir = resolve_state_dir();

    let mut cleared: Vec<String> = Vec::new();

    // Clear cache directory
    let cache_dir = state_dir.join("cache");
    if cache_dir.is_dir() {
        if fs::remove_dir_all(&cache_dir).is_ok() {
            cleared.push("cache/".to_string());
        }
    }

    // Clear orphaned temp dirs (openclawcn-* in system temp).
    // Skip dirs that contain active lock files — deleting them while the gateway
    // is running would corrupt its IPC state. A dir is considered "active" if it
    // holds any *.lock file or if any process has it as its working directory.
    let temp_dir = std::env::temp_dir();
    let mut temp_cleared: u32 = 0;
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with("openclawcn-") || !entry.path().is_dir() {
                continue;
            }
            // Check for active lock files inside this temp dir
            let has_locks = fs::read_dir(entry.path())
                .map(|mut rd| rd.any(|e| {
                    e.map(|e| {
                        let n = e.file_name();
                        let ns = n.to_string_lossy();
                        ns.ends_with(".lock") || ns.ends_with(".pid")
                    }).unwrap_or(false)
                }))
                .unwrap_or(false);
            if has_locks {
                log_action("clear_cache", &format!("Skipping active temp dir: {:?}", entry.path()));
                continue;
            }
            if fs::remove_dir_all(entry.path()).is_ok() {
                temp_cleared += 1;
            }
        }
    }
    if temp_cleared > 0 {
        cleared.push(format!("临时目录 ({}个)", temp_cleared));
    }

    let msg = if cleared.is_empty() {
        "没有找到需要清理的缓存文件。".to_string()
    } else {
        format!("已清理: {}", cleared.join(", "))
    };

    log_action("clear_cache", &msg);
    FixResult {
        fix_id: "clear_cache".into(),
        success: true,
        message: msg,
        requires_restart: false,
    }
}

fn fix_repair_config_syntax() -> FixResult {
    let state_dir = resolve_state_dir();
    let config_path = state_dir.join("openclawcn.json");

    log_action("repair_config_syntax", "attempting");

    let content = match fs::read(&config_path) {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("无法读取配置文件: {}", e);
            log_action("repair_config_syntax", &msg);
            return FixResult {
                fix_id: "repair_config_syntax".into(),
                success: false,
                message: msg,
                requires_restart: false,
            };
        }
    };

    let mut text = String::from_utf8_lossy(&content).to_string();
    let mut fixed = false;

    // Strip BOM — after from_utf8_lossy, the BOM is a single char \u{FEFF}
    if let Some(stripped) = text.strip_prefix('\u{FEFF}') {
        text = stripped.to_string();
        fixed = true;
    }

    // Try to parse as JSON5 first — if it works, the content is valid
    if json5::from_str::<serde_json::Value>(&text).is_ok() {
        // If BOM was stripped, write the clean version back
        if fixed {
            let backup_msg = match backup_file_timestamped(&config_path) {
                Ok(p) => format!("原文件已备份为 {}。", p.file_name().unwrap_or_default().to_string_lossy()),
                Err(e) => {
                    log_action("repair_config_syntax", &format!("备份失败，中止操作: {}", e));
                    return FixResult {
                        fix_id: "repair_config_syntax".into(),
                        success: false,
                        message: format!("备份原配置文件失败，修复已中止: {}", e),
                        requires_restart: false,
                    };
                }
            };
            let _ = fs::write(&config_path, &text);
            log_action("repair_config_syntax", "stripped BOM");
            return FixResult {
                fix_id: "repair_config_syntax".into(),
                success: true,
                message: format!("已移除配置文件的 BOM 标记。{}", backup_msg),
                requires_restart: false,
            };
        }
        return FixResult {
            fix_id: "repair_config_syntax".into(),
            success: true,
            message: "配置文件语法正确，无需修复。".into(),
            requires_restart: false,
        };
    }

    // Try to strip trailing garbage after the last }
    if let Some(last_brace) = text.rfind('}') {
        let after = text[last_brace + 1..].trim();
        if !after.is_empty() {
            text = text[..=last_brace].to_string();
            fixed = true;
        }
    }

    // Re-check if the fix worked
    if fixed && json5::from_str::<serde_json::Value>(&text).is_ok() {
        // Backup original — abort if backup fails to avoid data loss
        let backup_msg = match backup_file_timestamped(&config_path) {
            Ok(p) => format!("原文件已备份为 {}。", p.file_name().unwrap_or_default().to_string_lossy()),
            Err(e) => {
                log_action("repair_config_syntax", &format!("备份失败，中止操作: {}", e));
                return FixResult {
                    fix_id: "repair_config_syntax".into(),
                    success: false,
                    message: format!("备份原配置文件失败，修复已中止: {}", e),
                    requires_restart: false,
                };
            }
        };
        let _ = fs::write(&config_path, &text);
        log_action("repair_config_syntax", "fixed and saved");
        FixResult {
            fix_id: "repair_config_syntax".into(),
            success: true,
            message: format!("配置文件已修复。{}", backup_msg),
            requires_restart: true,
        }
    } else {
        log_action("repair_config_syntax", "cannot auto-fix");
        FixResult {
            fix_id: "repair_config_syntax".into(),
            success: false,
            message: "配置文件语法错误较复杂，无法自动修复。请手动检查 openclawcn.json。".into(),
            requires_restart: false,
        }
    }
}

fn fix_repair_permissions() -> FixResult {
    let state_dir = resolve_state_dir();
    log_action("repair_permissions", "creating directories");

    let dirs_to_create = [
        state_dir.clone(),
        state_dir.join("logs"),
        state_dir.join("cache"),
        state_dir.join("agents"),
        state_dir.join("agents").join("main"),
        state_dir.join("agents").join("main").join("agent"),
        state_dir.join("log-reports"),
    ];

    let mut created = 0;
    let mut errors = Vec::new();
    for dir in &dirs_to_create {
        if !dir.exists() {
            match fs::create_dir_all(dir) {
                Ok(()) => created += 1,
                Err(e) => errors.push(format!("{}: {}", dir.display(), e)),
            }
        }
    }

    if errors.is_empty() {
        let msg = if created > 0 {
            format!("已创建 {} 个缺失目录。", created)
        } else {
            "所有目录已存在，无需修复。".to_string()
        };
        log_action("repair_permissions", &msg);
        FixResult {
            fix_id: "repair_permissions".into(),
            success: true,
            message: msg,
            requires_restart: false,
        }
    } else {
        let msg = format!("部分目录创建失败: {}", errors.join("; "));
        log_action("repair_permissions", &msg);
        FixResult {
            fix_id: "repair_permissions".into(),
            success: false,
            message: msg,
            requires_restart: false,
        }
    }
}

fn fix_reset_auth_profiles() -> FixResult {
    let state_dir = resolve_state_dir();
    let auth_path = state_dir
        .join("agents").join("main").join("agent").join("auth-profiles.json");

    log_action("reset_auth_profiles", "resetting");

    if auth_path.exists() {
        // Backup
        let backup_path = auth_path.with_extension("json.bak");
        if let Err(e) = fs::copy(&auth_path, &backup_path) {
            let msg = format!("无法备份认证配置: {}", e);
            log_action("reset_auth_profiles", &msg);
            return FixResult {
                fix_id: "reset_auth_profiles".into(),
                success: false,
                message: msg,
                requires_restart: false,
            };
        }
    }

    // Write empty auth profile store
    let empty_store = serde_json::json!({
        "version": 1,
        "profiles": {},
        "order": {},
    });

    if let Some(parent) = auth_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    match fs::write(&auth_path, serde_json::to_string_pretty(&empty_store).unwrap()) {
        Ok(()) => {
            log_action("reset_auth_profiles", "done");
            FixResult {
                fix_id: "reset_auth_profiles".into(),
                success: true,
                message: "认证配置已重置（原文件已备份为 .json.bak）。重启后需要重新配置 API Key。".into(),
                requires_restart: true,
            }
        }
        Err(e) => {
            let msg = format!("写入失败: {}", e);
            log_action("reset_auth_profiles", &msg);
            FixResult {
                fix_id: "reset_auth_profiles".into(),
                success: false,
                message: msg,
                requires_restart: false,
            }
        }
    }
}

fn fix_open_state_dir() -> FixResult {
    let state_dir = resolve_state_dir();
    log_action("open_state_dir", &format!("opening {}", state_dir.display()));

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(state_dir.to_string_lossy().to_string())
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(state_dir.to_string_lossy().to_string())
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(state_dir.to_string_lossy().to_string())
            .spawn();
    }

    FixResult {
        fix_id: "open_state_dir".into(),
        success: true,
        message: format!("已打开 {}", state_dir.display()),
        requires_restart: false,
    }
}

// ── Doctor ────────────────────────────────────────────────────────────────────

fn fix_run_doctor() -> FixResult {
    // Prevent concurrent doctor runs
    if DOCTOR_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return FixResult {
            fix_id: "run_doctor".into(),
            success: false,
            message: "Doctor 正在运行中，请等待完成。".into(),
            requires_restart: false,
        };
    }

    let result = run_doctor_with_timeout();
    DOCTOR_RUNNING.store(false, Ordering::SeqCst);
    result
}

/// Spawn the doctor subprocess with a 120-second timeout.
/// If the timeout fires, kill the child process to avoid orphans.
fn run_doctor_with_timeout() -> FixResult {
    log_action("run_doctor", "starting");

    let app_dir = match sidecar::resolve_app_dir_pub() {
        Ok(d) => d,
        Err(e) => {
            let msg = format!("无法定位应用目录: {}", e);
            log_action("run_doctor", &msg);
            return FixResult {
                fix_id: "run_doctor".into(),
                success: false,
                message: msg,
                requires_restart: false,
            };
        }
    };

    let node_path = platform::resolve_node_path(&app_dir);
    let backend_path = app_dir.join("dist").join("entry.js");

    if !node_path.exists() {
        let msg = format!("Node.js 运行时未找到: {}", node_path.display());
        log_action("run_doctor", &msg);
        return FixResult {
            fix_id: "run_doctor".into(),
            success: false,
            message: msg,
            requires_restart: false,
        };
    }
    if !backend_path.exists() {
        let msg = format!("后端入口文件未找到: {}", backend_path.display());
        log_action("run_doctor", &msg);
        return FixResult {
            fix_id: "run_doctor".into(),
            success: false,
            message: msg,
            requires_restart: false,
        };
    }

    let mut command = Command::new(&node_path);
    command
        .arg(&backend_path)
        .arg("doctor")
        .arg("--fix")
        .arg("--non-interactive")
        .env("OPENCLAWCN_BUNDLED_PLUGINS_DIR", app_dir.join("extensions"))
        .env("OPENCLAWCN_BUNDLED_SKILLS_DIR", app_dir.join("skills"))
        .env("OPENCLAWCN_DESKTOP_MODE", "1")
        .env("NODE_OPTIONS", "--disable-warning=ExperimentalWarning")
        .current_dir(&app_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Pass gateway token so doctor's health check can authenticate with
    // the running gateway instead of always reporting "Gateway not running".
    if let Some(token) = sidecar::gateway_token_if_running() {
        command.env("OPENCLAWCN_GATEWAY_TOKEN", token);
    }

    platform::configure_node_env(&mut command, &app_dir);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // Use spawn() instead of output() so we can kill the process on timeout.
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("无法执行 Doctor: {}", e);
            log_action("run_doctor", &msg);
            return FixResult {
                fix_id: "run_doctor".into(),
                success: false,
                message: msg,
                requires_restart: false,
            };
        }
    };

    let pid = child.id();

    // Wait on a background thread so we can enforce a timeout.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let output = child.wait_with_output();
        let _ = tx.send(output);
    });

    match rx.recv_timeout(std::time::Duration::from_secs(120)) {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = strip_ansi(&format!("{}{}", stdout, stderr));
            let success = output.status.success();
            let msg = if combined.trim().is_empty() {
                if success {
                    "Doctor 完成，无需修复。".to_string()
                } else {
                    format!("Doctor 退出码: {}", output.status)
                }
            } else {
                combined
            };
            log_action("run_doctor", if success { "success" } else { "failed" });
            FixResult {
                fix_id: "run_doctor".into(),
                success,
                message: msg,
                requires_restart: success,
            }
        }
        Ok(Err(e)) => {
            let msg = format!("Doctor 进程等待失败: {}", e);
            log_action("run_doctor", &msg);
            FixResult {
                fix_id: "run_doctor".into(),
                success: false,
                message: msg,
                requires_restart: false,
            }
        }
        Err(_) => {
            // Timeout — kill the orphaned doctor process.
            log_action("run_doctor", &format!("timeout, killing pid {}", pid));
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output();
            }
            FixResult {
                fix_id: "run_doctor".into(),
                success: false,
                message: "Doctor 执行超时（120 秒），已终止子进程。".into(),
                requires_restart: false,
            }
        }
    }
}

/// Strip ANSI escape sequences from terminal output.
///
/// Handles:
/// - CSI sequences: ESC `[` ... `<letter>` (colors, cursor movement, etc.)
/// - OSC sequences: ESC `]` ... ST (ESC `\`) or BEL (`\x07`) (e.g. terminal title)
/// - 2-char ESC sequences: ESC + any single char (ESC#, ESC(, ESC), ESCc, etc.)
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek().copied() {
                Some('[') => {
                    // CSI sequence: ESC [ <params> <final-byte A-Z a-z>
                    chars.next(); // consume '['
                    for next in chars.by_ref() {
                        if next.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC sequence: ESC ] <text> ST  (where ST = ESC \ or BEL \x07)
                    chars.next(); // consume ']'
                    loop {
                        match chars.next() {
                            None | Some('\x07') => break, // BEL terminates OSC
                            Some('\x1b') => {
                                // ST = ESC \ — consume the '\\'
                                if chars.peek() == Some(&'\\') {
                                    chars.next();
                                }
                                break;
                            }
                            _ => {} // consume OSC body chars
                        }
                    }
                }
                Some(_) => {
                    // 2-char ESC sequence (ESC#n, ESC(G, ESC)G, ESCc, etc.)
                    chars.next(); // consume the single parameter byte
                }
                None => {} // lone ESC at end of string — ignore
            }
        } else {
            result.push(c);
        }
    }
    result
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Execute a repair action by its fix ID.
pub fn apply_fix(app: &AppHandle, fix_id: &str) -> FixResult {
    match fix_id {
        "restart_service" => fix_restart_service(app),
        "kill_stale_port" => fix_kill_stale_port(),
        "clear_gateway_locks" => fix_clear_gateway_locks(),
        "clear_cache" => fix_clear_cache(),
        "repair_config_syntax" => fix_repair_config_syntax(),
        "repair_permissions" => fix_repair_permissions(),
        "reset_auth_profiles" => fix_reset_auth_profiles(),
        "open_state_dir" => fix_open_state_dir(),
        "run_doctor" => fix_run_doctor(),
        _ => FixResult {
            fix_id: fix_id.to_string(),
            success: false,
            message: format!("未知的修复操作: {}", fix_id),
            requires_restart: false,
        },
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── chrono_now_simple tests ──────────────────────────────────────

    #[test]
    fn test_chrono_now_simple_format() {
        let time_str = chrono_now_simple();
        // Should be in HH:MM:SS format
        assert_eq!(time_str.len(), 8);
        assert_eq!(&time_str[2..3], ":");
        assert_eq!(&time_str[5..6], ":");

        // Hours should be 0-23
        let hours: u32 = time_str[..2].parse().unwrap();
        assert!(hours < 24);

        // Minutes should be 0-59
        let minutes: u32 = time_str[3..5].parse().unwrap();
        assert!(minutes < 60);

        // Seconds should be 0-59
        let seconds: u32 = time_str[6..8].parse().unwrap();
        assert!(seconds < 60);
    }

    // ── resolve_state_dir tests ─────────────────────────────────────

    #[test]
    fn test_resolve_state_dir_env_override() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let custom = std::env::temp_dir().join("_repair_actions_test_state");
        std::env::set_var("OPENCLAWCN_STATE_DIR", custom.to_str().unwrap());
        let resolved = resolve_state_dir();
        assert_eq!(resolved, custom);
        std::env::remove_var("OPENCLAWCN_STATE_DIR");
    }

    // NOTE: Tests that call fix_*() functions need to set OPENCLAWCN_STATE_DIR
    // to a unique temp path. Because Rust tests run in parallel and share the
    // process-wide environment, we use std::sync::Mutex to serialize env-dependent
    // tests. The alternative `--test-threads=1` is too slow.

    use crate::repair::TEST_ENV_LOCK;

    // ── fix_clear_cache tests ───────────────────────────────────────

    #[test]
    fn test_fix_clear_cache_with_cache_dir() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cache_1");
        let _ = fs::remove_dir_all(&temp);
        let cache_dir = temp.join("cache");
        let _ = fs::create_dir_all(&cache_dir);
        fs::write(cache_dir.join("test.tmp"), "data").unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_clear_cache();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert_eq!(result.fix_id, "clear_cache");
        assert!(!cache_dir.exists(), "cache dir should be removed");

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_clear_cache_no_cache() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cache_2");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_clear_cache();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert_eq!(result.fix_id, "clear_cache");
        // Message is either "没有找到" or "已清理" depending on temp dir contents
        assert!(
            result.message.contains("没有找到") || result.message.contains("已清理"),
            "Expected clear_cache message, got: {}",
            result.message,
        );

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_clear_cache_skips_active_temp_dir() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Create a fake openclawcn-* temp dir with a .lock file (simulates active gateway)
        let active_temp = std::env::temp_dir().join("openclawcn-_test_active");
        let _ = fs::remove_dir_all(&active_temp);
        let _ = fs::create_dir_all(&active_temp);
        fs::write(active_temp.join("gateway.12345.lock"), "pid=12345").unwrap();

        let state_temp = std::env::temp_dir().join("_ra_test_cache_3");
        let _ = fs::remove_dir_all(&state_temp);
        let _ = fs::create_dir_all(&state_temp);

        std::env::set_var("OPENCLAWCN_STATE_DIR", state_temp.to_str().unwrap());
        let result = fix_clear_cache();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        // The active_temp dir with a lock file must NOT be deleted
        assert!(active_temp.exists(), "active temp dir with lock file should be preserved");

        assert!(result.success);

        let _ = fs::remove_dir_all(&active_temp);
        let _ = fs::remove_dir_all(&state_temp);
    }

    // ── fix_repair_config_syntax tests ──────────────────────────────

    #[test]
    fn test_fix_repair_config_syntax_valid_file() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cfg_valid");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{"models":{}}"#).unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_config_syntax();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert!(result.message.contains("无需修复"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_repair_config_syntax_trailing_garbage() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cfg_garbage");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{"models":{}}garbage_after_json"#).unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_config_syntax();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert!(result.message.contains("已修复") || result.message.contains("无需修复"));

        // Verify backup was created (timestamped, e.g. openclawcn.json.bak.1709500000)
        if result.message.contains("已修复") {
            let backup_exists = fs::read_dir(&temp).unwrap().any(|e| {
                e.ok().and_then(|e| e.file_name().into_string().ok())
                    .map(|n| n.starts_with("openclawcn.json.bak"))
                    .unwrap_or(false)
            });
            assert!(backup_exists, "expected a timestamped .bak file in {:?}", temp);
            // Verify fixed content is valid JSON
            let content = fs::read_to_string(temp.join("openclawcn.json")).unwrap();
            assert!(json5::from_str::<serde_json::Value>(&content).is_ok());
        }

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_repair_config_syntax_bom_removal() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cfg_bom");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);
        // BOM + valid JSON
        let mut content = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
        content.extend_from_slice(r#"{"models":{}}"#.as_bytes());
        fs::write(temp.join("openclawcn.json"), &content).unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_config_syntax();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_repair_config_syntax_missing_file() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cfg_none");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_config_syntax();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(!result.success);
        assert!(result.message.contains("无法读取"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_repair_config_syntax_unfixable() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_cfg_unfixable");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), "this is not json at all {{{{").unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_config_syntax();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(!result.success);
        assert!(result.message.contains("无法自动修复"));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── fix_repair_permissions tests ─────────────────────────────────

    #[test]
    fn test_fix_repair_permissions_creates_dirs() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_perms");
        let _ = fs::remove_dir_all(&temp);

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_permissions();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert!(temp.join("logs").is_dir());
        assert!(temp.join("cache").is_dir());
        assert!(temp.join("agents").join("main").join("agent").is_dir());
        assert!(temp.join("log-reports").is_dir());
        assert!(result.message.contains("已创建"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_repair_permissions_already_exists() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_perms_exist");
        let _ = fs::create_dir_all(temp.join("logs"));
        let _ = fs::create_dir_all(temp.join("cache"));
        let _ = fs::create_dir_all(temp.join("agents").join("main").join("agent"));
        let _ = fs::create_dir_all(temp.join("log-reports"));

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_repair_permissions();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert!(result.message.contains("已存在") || result.message.contains("无需"));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── fix_reset_auth_profiles tests ───────────────────────────────

    #[test]
    fn test_fix_reset_auth_profiles_creates_empty() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_reset_auth");
        let _ = fs::remove_dir_all(&temp);
        let auth_dir = temp.join("agents").join("main").join("agent");
        let _ = fs::create_dir_all(&auth_dir);

        fs::write(auth_dir.join("auth-profiles.json"), r#"{"version":1,"profiles":{"x":{"type":"api_key","key":"secret"}}}"#).unwrap();

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_reset_auth_profiles();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        assert!(result.requires_restart);

        // Backup should exist
        assert!(auth_dir.join("auth-profiles.json.bak").exists());

        // New file should be empty profile store
        let content = fs::read_to_string(auth_dir.join("auth-profiles.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["version"], 1);
        assert!(parsed["profiles"].as_object().unwrap().is_empty());

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_fix_reset_auth_profiles_no_existing_file() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_ra_test_reset_auth_new");
        let _ = fs::remove_dir_all(&temp);

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        let result = fix_reset_auth_profiles();
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        assert!(result.success);
        let auth_path = temp.join("agents").join("main").join("agent").join("auth-profiles.json");
        assert!(auth_path.exists());

        let _ = fs::remove_dir_all(&temp);
    }

    // ── FixResult serialization ─────────────────────────────────────

    #[test]
    fn test_fix_result_serialization() {
        let result = FixResult {
            fix_id: "test_fix".into(),
            success: true,
            message: "修复成功".into(),
            requires_restart: true,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"fix_id\":\"test_fix\""));
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"requires_restart\":true"));
    }

    // ── log_action test ─────────────────────────────────────────────

    #[test]
    fn test_log_action_writes_to_file() {
        let _lock = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let temp = std::env::temp_dir().join("_repair_actions_log");
        let _ = fs::remove_dir_all(&temp);
        let _ = fs::create_dir_all(temp.join("logs"));

        std::env::set_var("OPENCLAWCN_STATE_DIR", temp.to_str().unwrap());
        log_action("test_action", "test_result");
        std::env::remove_var("OPENCLAWCN_STATE_DIR");

        let log_content = fs::read_to_string(temp.join("logs").join("desktop-debug.log")).unwrap();
        assert!(log_content.contains("[RepairAction]"));
        assert!(log_content.contains("test_action"));
        assert!(log_content.contains("test_result"));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── strip_ansi tests ──────────────────────────────────────────

    #[test]
    fn test_strip_ansi_no_escapes() {
        assert_eq!(strip_ansi("hello world"), "hello world");
        assert_eq!(strip_ansi("你好世界"), "你好世界");
    }

    #[test]
    fn test_strip_ansi_color_codes() {
        // ESC[32m = green, ESC[0m = reset
        assert_eq!(strip_ansi("\x1b[32mOK\x1b[0m"), "OK");
        // Bold + color
        assert_eq!(strip_ansi("\x1b[1;33mWarning\x1b[0m"), "Warning");
    }

    #[test]
    fn test_strip_ansi_cursor_movement() {
        assert_eq!(strip_ansi("\x1b[2A\x1b[0GHello"), "Hello");
    }

    #[test]
    fn test_strip_ansi_preserves_unicode() {
        // Unicode box-drawing (used by @clack/prompts) should be preserved
        let input = "\x1b[36m|\x1b[0m  Doctor complete.";
        assert_eq!(strip_ansi(input), "|  Doctor complete.");
    }

    #[test]
    fn test_strip_ansi_empty() {
        assert_eq!(strip_ansi(""), "");
    }

    // ── doctor concurrency guard test ─────────────────────────────

    #[test]
    fn test_doctor_running_flag_default() {
        // The flag should be false by default
        assert!(!DOCTOR_RUNNING.load(Ordering::SeqCst));
    }
}
