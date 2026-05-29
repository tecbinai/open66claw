//! Offline diagnostic checks for the repair assistant.
//!
//! All checks are purely file-system / OS based — they work without
//! the Gateway sidecar running.

use std::fs;
use std::net::TcpStream;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;

use crate::sidecar;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticCheck {
    pub id: String,
    pub name: String,
    pub status: CheckStatus,
    pub message: String,
    /// If the issue can be auto-fixed, the fix action ID.
    pub fix_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub memory_total_mb: u64,
    pub disk_free_mb: u64,
    pub app_version: String,
    pub sidecar_running: bool,
    pub gateway_port: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticResult {
    pub checks: Vec<DiagnosticCheck>,
    pub system_info: SystemInfo,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn resolve_state_dir() -> PathBuf {
    super::resolve_state_dir()
}

fn check(id: &str, name: &str, status: CheckStatus, msg: &str, fix: Option<&str>) -> DiagnosticCheck {
    DiagnosticCheck {
        id: id.to_string(),
        name: name.to_string(),
        status,
        message: msg.to_string(),
        fix_id: fix.map(|s| s.to_string()),
    }
}

// ── System info ──────────────────────────────────────────────────────────────

pub fn collect_system_info() -> SystemInfo {
    SystemInfo {
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        arch: std::env::consts::ARCH.to_string(),
        memory_total_mb: get_total_memory_mb(),
        disk_free_mb: get_disk_free_mb(&resolve_state_dir()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        sidecar_running: sidecar::is_sidecar_running(),
        gateway_port: sidecar::gateway_port(),
    }
}

#[cfg(target_os = "windows")]
fn get_total_memory_mb() -> u64 {
    use std::process::Command;
    // Use PowerShell + Get-CimInstance (wmic is deprecated/removed on Win11 24H2+)
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"])
        .creation_flags(0x08000000u32)
        .output();
    if let Ok(output) = output {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Ok(bytes) = text.trim().parse::<u64>() {
            return bytes / (1024 * 1024);
        }
    }
    // Fallback: try wmic for older Windows versions
    let output = Command::new("cmd")
        .args(["/C", "wmic ComputerSystem get TotalPhysicalMemory /value"])
        .creation_flags(0x08000000u32)
        .output();
    if let Ok(output) = output {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(val) = line.strip_prefix("TotalPhysicalMemory=") {
                if let Ok(bytes) = val.trim().parse::<u64>() {
                    return bytes / (1024 * 1024);
                }
            }
        }
    }
    0
}

#[cfg(not(target_os = "windows"))]
fn get_total_memory_mb() -> u64 {
    // macOS / Linux
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                let kb_str: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(kb) = kb_str.parse::<u64>() {
                    return kb / 1024;
                }
            }
        }
    }
    // macOS fallback
    if let Ok(output) = std::process::Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Ok(bytes) = text.trim().parse::<u64>() {
            return bytes / (1024 * 1024);
        }
    }
    0
}

#[cfg(target_os = "windows")]
fn get_disk_free_mb(path: &std::path::Path) -> u64 {
    use std::process::Command;
    // Use the drive letter from the path
    let drive = path
        .to_string_lossy()
        .chars()
        .next()
        .unwrap_or('C');
    // Use PowerShell + Get-CimInstance (wmic is deprecated/removed on Win11 24H2+)
    let ps_cmd = format!(
        "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='{}:'\").FreeSpace",
        drive
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .creation_flags(0x08000000u32)
        .output();
    if let Ok(output) = output {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Ok(bytes) = text.trim().parse::<u64>() {
            return bytes / (1024 * 1024);
        }
    }
    // Fallback: try wmic for older Windows versions
    let output = Command::new("cmd")
        .args(["/C", &format!("wmic LogicalDisk where DeviceID='{}:' get FreeSpace /value", drive)])
        .creation_flags(0x08000000u32)
        .output();
    if let Ok(output) = output {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(val) = line.strip_prefix("FreeSpace=") {
                if let Ok(bytes) = val.trim().parse::<u64>() {
                    return bytes / (1024 * 1024);
                }
            }
        }
    }
    0
}

#[cfg(not(target_os = "windows"))]
fn get_disk_free_mb(path: &std::path::Path) -> u64 {
    let path_str = path.to_string_lossy();
    if let Ok(output) = std::process::Command::new("df")
        .args(["-m", &path_str])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = text.lines().nth(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                if let Ok(mb) = parts[3].parse::<u64>() {
                    return mb;
                }
            }
        }
    }
    0
}

// ── Individual checks ────────────────────────────────────────────────────────

fn check_state_dir_exists(state_dir: &std::path::Path) -> DiagnosticCheck {
    if state_dir.is_dir() {
        check("state_dir_exists", "状态目录", CheckStatus::Pass,
            &format!("{} 存在", state_dir.display()), None)
    } else {
        // First launch: Gateway has not created the state dir yet.
        // Report Warn (not Fail) so the auto-upload logic does not fire.
        check("state_dir_exists", "状态目录", CheckStatus::Warn,
            &format!("{} 不存在（首次启动将自动创建）", state_dir.display()), Some("repair_permissions"))
    }
}

fn check_state_dir_writable(state_dir: &std::path::Path) -> DiagnosticCheck {
    if !state_dir.is_dir() {
        return check("state_dir_writable", "目录可写", CheckStatus::Warn,
            "状态目录不存在（首次启动将自动创建）", Some("repair_permissions"));
    }
    let test_file = state_dir.join(".repair-write-test");
    match fs::write(&test_file, "test") {
        Ok(()) => {
            let _ = fs::remove_file(&test_file);
            check("state_dir_writable", "目录可写", CheckStatus::Pass,
                "状态目录可写", None)
        }
        Err(e) => {
            check("state_dir_writable", "目录可写", CheckStatus::Fail,
                &format!("状态目录无法写入: {}", e), Some("repair_permissions"))
        }
    }
}

fn check_config_file(state_dir: &std::path::Path) -> DiagnosticCheck {
    let config_path = state_dir.join("openclawcn.json");
    if !config_path.exists() {
        // Config file is created on first Gateway start. Missing file before
        // that is expected — Warn, not Fail.
        return check("config_file_exists", "配置文件", CheckStatus::Warn,
            "openclawcn.json 不存在（首次启动后自动生成）", None);
    }
    match fs::read_to_string(&config_path) {
        Ok(content) => {
            match json5::from_str::<serde_json::Value>(&content) {
                Ok(_) => check("config_file_exists", "配置文件", CheckStatus::Pass,
                    "openclawcn.json 格式正确", None),
                Err(e) => check("config_file_exists", "配置文件", CheckStatus::Fail,
                    &format!("配置文件语法错误: {}", e), Some("repair_config_syntax")),
            }
        }
        Err(e) => check("config_file_exists", "配置文件", CheckStatus::Fail,
            &format!("无法读取配置文件: {}", e), None),
    }
}

fn check_config_has_provider(state_dir: &std::path::Path) -> DiagnosticCheck {
    let config_path = state_dir.join("openclawcn.json");
    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(val) = json5::from_str::<serde_json::Value>(&content) {
            // Path 1: models.providers — legacy multi-provider config
            if let Some(providers) = val.get("models").and_then(|m| m.get("providers")).and_then(|p| p.as_object()) {
                if !providers.is_empty() {
                    return check("config_has_provider", "AI 模型配置", CheckStatus::Pass,
                        &format!("已配置 {} 个 AI 模型提供商", providers.len()), None);
                }
            }
            // Path 2: modelCapability.capabilities.text.providerId — preferred single-provider config
            // This is how provider_discovery.rs reads the active text model provider.
            if let Some(provider_id) = val
                .get("modelCapability")
                .and_then(|mc: &serde_json::Value| mc.get("capabilities"))
                .and_then(|caps: &serde_json::Value| caps.get("text"))
                .and_then(|text: &serde_json::Value| text.get("providerId"))
                .and_then(|v: &serde_json::Value| v.as_str())
            {
                if !provider_id.is_empty() {
                    return check("config_has_provider", "AI 模型配置", CheckStatus::Pass,
                        &format!("已配置 AI 提供商: {}", provider_id), None);
                }
            }
        }
    }
    // Also check env vars
    let env_keys = [
        "DEEPSEEK_API_KEY", "KIMI_API_KEY", "ANTHROPIC_API_KEY",
        "DASHSCOPE_API_KEY", "OPENAI_API_KEY", "MOONSHOT_API_KEY",
        "ZHIPU_API_KEY", "ARK_API_KEY", "SILICONFLOW_API_KEY",
    ];
    for key in &env_keys {
        if std::env::var(key).is_ok() {
            return check("config_has_provider", "AI 模型配置", CheckStatus::Pass,
                &format!("检测到环境变量 {}", key), None);
        }
    }
    check("config_has_provider", "AI 模型配置", CheckStatus::Warn,
        "未检测到已配置的 AI 模型提供商（检修助手 AI 功能不可用）", None)
}

fn check_logs_dir(state_dir: &std::path::Path) -> DiagnosticCheck {
    let logs_dir = state_dir.join("logs");
    if logs_dir.is_dir() {
        check("logs_dir_exists", "日志目录", CheckStatus::Pass,
            "logs/ 目录存在", None)
    } else {
        check("logs_dir_exists", "日志目录", CheckStatus::Warn,
            "logs/ 目录不存在", Some("repair_permissions"))
    }
}

fn check_auth_profiles(state_dir: &std::path::Path) -> DiagnosticCheck {
    let auth_path = state_dir
        .join("agents").join("main").join("agent").join("auth-profiles.json");
    if auth_path.exists() {
        match fs::read_to_string(&auth_path) {
            Ok(content) => {
                // Check if it's valid JSON (might be encrypted wrapper or plain JSON)
                if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                    check("auth_profiles_exist", "认证配置", CheckStatus::Pass,
                        "auth-profiles.json 存在且可读", None)
                } else {
                    check("auth_profiles_exist", "认证配置", CheckStatus::Warn,
                        "auth-profiles.json 格式异常", Some("reset_auth_profiles"))
                }
            }
            Err(_) => check("auth_profiles_exist", "认证配置", CheckStatus::Warn,
                "auth-profiles.json 无法读取", None),
        }
    } else {
        check("auth_profiles_exist", "认证配置", CheckStatus::Warn,
            "auth-profiles.json 不存在（首次使用？）", None)
    }
}

fn check_node_binary() -> DiagnosticCheck {
    // Use sidecar::resolve_app_dir_pub() for correct platform-aware path resolution.
    // On macOS: Contents/Resources/resources/  On Windows: <exe_dir>/resources/ or <exe_dir>/
    let app_dir = sidecar::resolve_app_dir_pub().ok();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Primary: use the resolved app dir (matches sidecar launch paths)
    if let Some(ref dir) = app_dir {
        candidates.push(dir.join("node").join("bin").join("node"));
        candidates.push(dir.join("node").join("node.exe"));
        candidates.push(dir.join("node").join("node"));
    }
    // Fallback: exe_dir-relative paths (dev layout, manual deployment)
    if let Some(ref dir) = exe_dir {
        candidates.push(dir.join("resources").join("node").join("bin").join("node"));
        candidates.push(dir.join("resources").join("node").join("node.exe"));
        candidates.push(dir.join("resources").join("node").join("node"));
        candidates.push(dir.join("node").join("bin").join("node"));
        candidates.push(dir.join("node").join("node.exe"));
        candidates.push(dir.join("node").join("node"));
    }

    for path in &candidates {
        if path.exists() {
            return check("node_binary_exists", "Node.js 运行时", CheckStatus::Pass,
                &format!("Node.js 存在: {}", path.display()), None);
        }
    }
    // Bundled node not found — check system node as fallback
    if let Some(system_node) = sidecar::find_system_node_pub() {
        return check("node_binary_exists", "Node.js 运行时", CheckStatus::Warn,
            &format!("捆绑的 Node.js 未找到，将使用系统 Node: {}", system_node.display()), None);
    }
    check("node_binary_exists", "Node.js 运行时", CheckStatus::Fail,
        "捆绑的 Node.js 运行时未找到且系统 PATH 中也没有 node，安装可能不完整", None)
}

fn check_backend_entry() -> DiagnosticCheck {
    // Use sidecar::resolve_app_dir_pub() for correct platform-aware path resolution.
    let app_dir = sidecar::resolve_app_dir_pub().ok();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Primary: use the resolved app dir (matches sidecar launch paths)
    if let Some(ref dir) = app_dir {
        candidates.push(dir.join("dist").join("entry.js"));
    }
    // Fallback: exe_dir-relative paths
    if let Some(ref dir) = exe_dir {
        candidates.push(dir.join("resources").join("dist").join("entry.js"));
        candidates.push(dir.join("dist").join("entry.js"));
    }

    for path in &candidates {
        if path.exists() {
            return check("backend_entry_exists", "后端入口", CheckStatus::Pass,
                "dist/entry.js 存在", None);
        }
    }
    // Bundled entry.js not found — check repo fallback
    if let Some(repo_entry) = sidecar::find_repo_entry_js_pub() {
        return check("backend_entry_exists", "后端入口", CheckStatus::Warn,
            &format!("捆绑的 entry.js 未找到，将使用仓库文件: {}", repo_entry.display()), None);
    }
    check("backend_entry_exists", "后端入口", CheckStatus::Fail,
        "后端入口文件 dist/entry.js 未找到，安装可能不完整", None)
}

fn check_port_available() -> DiagnosticCheck {
    let port = sidecar::gateway_port();
    // If sidecar is running, port being occupied is expected
    if sidecar::is_sidecar_running() {
        return check("port_available", "网关端口", CheckStatus::Pass,
            &format!("端口 {} 被本应用的 Gateway 使用中", port), None);
    }
    match TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    ) {
        Ok(_) => check("port_available", "网关端口", CheckStatus::Fail,
            &format!("端口 {} 被其他进程占用", port), Some("kill_stale_port")),
        Err(_) => check("port_available", "网关端口", CheckStatus::Pass,
            &format!("端口 {} 可用", port), None),
    }
}

fn check_disk_space(state_dir: &std::path::Path) -> DiagnosticCheck {
    let free_mb = get_disk_free_mb(state_dir);
    if free_mb == 0 {
        return check("disk_space", "磁盘空间", CheckStatus::Warn,
            "无法检测磁盘空间", None);
    }
    if free_mb < 100 {
        check("disk_space", "磁盘空间", CheckStatus::Fail,
            &format!("磁盘剩余空间不足: {} MB（需要至少 100 MB）", free_mb), Some("clear_cache"))
    } else if free_mb < 500 {
        check("disk_space", "磁盘空间", CheckStatus::Warn,
            &format!("磁盘空间偏低: {} MB", free_mb), None)
    } else {
        check("disk_space", "磁盘空间", CheckStatus::Pass,
            &format!("磁盘剩余 {} MB", free_mb), None)
    }
}

fn check_gateway_locks() -> DiagnosticCheck {
    let temp_dir = std::env::temp_dir();
    let mut stale_count = 0u32;

    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with("openclawcn-") || !entry.path().is_dir() {
                continue;
            }
            if let Ok(lock_entries) = fs::read_dir(entry.path()) {
                for lock_entry in lock_entries.flatten() {
                    let lock_name = lock_entry.file_name();
                    let lock_str = lock_name.to_string_lossy();
                    if lock_str.starts_with("gateway.") && lock_str.ends_with(".lock") {
                        stale_count += 1;
                    }
                }
            }
        }
    }
    if stale_count > 0 {
        check("gateway_lock_stale", "网关锁文件", CheckStatus::Warn,
            &format!("发现 {} 个残留的 gateway lock 文件", stale_count),
            Some("clear_gateway_locks"))
    } else {
        check("gateway_lock_stale", "网关锁文件", CheckStatus::Pass,
            "无残留锁文件", None)
    }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/// Run all diagnostic checks and return the results.
pub fn run_all_checks() -> DiagnosticResult {
    let state_dir = resolve_state_dir();

    let checks = vec![
        check_state_dir_exists(&state_dir),
        check_state_dir_writable(&state_dir),
        check_config_file(&state_dir),
        check_config_has_provider(&state_dir),
        check_logs_dir(&state_dir),
        check_auth_profiles(&state_dir),
        check_node_binary(),
        check_backend_entry(),
        check_port_available(),
        check_disk_space(&state_dir),
        check_gateway_locks(),
    ];

    DiagnosticResult {
        checks,
        system_info: collect_system_info(),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repair::TEST_ENV_LOCK;

    // ── Helper function test ─────────────────────────────────────────

    #[test]
    fn test_check_helper_basic() {
        let c = check("test_id", "Test Name", CheckStatus::Pass, "All good", None);
        assert_eq!(c.id, "test_id");
        assert_eq!(c.name, "Test Name");
        assert_eq!(c.message, "All good");
        assert!(c.fix_id.is_none());
        assert!(matches!(c.status, CheckStatus::Pass));
    }

    #[test]
    fn test_check_helper_with_fix_id() {
        let c = check("broken", "Broken Thing", CheckStatus::Fail, "It broke", Some("fix_it"));
        assert_eq!(c.fix_id.as_deref(), Some("fix_it"));
        assert!(matches!(c.status, CheckStatus::Fail));
    }

    // ── state dir checks ─────────────────────────────────────────────

    #[test]
    fn test_check_state_dir_exists_pass() {
        let temp = std::env::temp_dir().join("_repair_diag_test_dir");
        let _ = fs::create_dir_all(&temp);

        let result = check_state_dir_exists(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));
        assert_eq!(result.id, "state_dir_exists");

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_state_dir_exists_missing_is_warn() {
        let nonexistent = std::env::temp_dir().join("_repair_diag_nonexistent_xyzzy");
        let _ = fs::remove_dir_all(&nonexistent);

        let result = check_state_dir_exists(&nonexistent);
        assert!(matches!(result.status, CheckStatus::Warn));
        assert_eq!(result.fix_id.as_deref(), Some("repair_permissions"));
    }

    #[test]
    fn test_check_state_dir_writable_pass() {
        let temp = std::env::temp_dir().join("_repair_diag_writable");
        let _ = fs::create_dir_all(&temp);

        let result = check_state_dir_writable(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_state_dir_writable_missing_dir_is_warn() {
        let nonexistent = std::env::temp_dir().join("_repair_diag_no_writable_xyzzy");
        let _ = fs::remove_dir_all(&nonexistent);

        let result = check_state_dir_writable(&nonexistent);
        assert!(matches!(result.status, CheckStatus::Warn));
    }

    // ── config file checks ───────────────────────────────────────────

    #[test]
    fn test_check_config_file_valid() {
        let temp = std::env::temp_dir().join("_repair_diag_cfg_valid");
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{"models":{}}"#).unwrap();

        let result = check_config_file(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_config_file_invalid_json() {
        let temp = std::env::temp_dir().join("_repair_diag_cfg_invalid");
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), "{invalid json...").unwrap();

        let result = check_config_file(&temp);
        assert!(matches!(result.status, CheckStatus::Fail));
        assert_eq!(result.fix_id.as_deref(), Some("repair_config_syntax"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_config_file_json5_with_comments() {
        let temp = std::env::temp_dir().join("_repair_diag_cfg_json5");
        let _ = fs::create_dir_all(&temp);
        // JSON5 allows comments and trailing commas
        fs::write(temp.join("openclawcn.json"), r#"{
            // This is a comment
            "models": {},
        }"#).unwrap();

        let result = check_config_file(&temp);
        assert!(matches!(result.status, CheckStatus::Pass), "JSON5 with comments should pass");

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_config_file_missing_is_warn() {
        let temp = std::env::temp_dir().join("_repair_diag_cfg_missing");
        let _ = fs::create_dir_all(&temp);
        let _ = fs::remove_file(temp.join("openclawcn.json"));

        let result = check_config_file(&temp);
        assert!(matches!(result.status, CheckStatus::Warn));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── provider config check ────────────────────────────────────────

    #[test]
    fn test_check_config_has_provider_with_config() {
        let temp = std::env::temp_dir().join("_repair_diag_provider");
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{
            "models": {
                "providers": {
                    "deepseek": {"baseUrl": "https://api.deepseek.com", "apiKey": "sk-xxx"}
                }
            }
        }"#).unwrap();

        let result = check_config_has_provider(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));
        assert!(result.message.contains("1"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_config_has_provider_warn_none() {
        let temp = std::env::temp_dir().join("_repair_diag_no_provider");
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{"models":{"providers":{}}}"#).unwrap();

        // Make sure no env vars would match
        // (we can't unset all, but test the config-only path)
        let result = check_config_has_provider(&temp);
        // Could be Pass if env vars happen to be set, or Warn if not
        // Just verify it returns a valid check
        assert!(matches!(result.status, CheckStatus::Pass | CheckStatus::Warn));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_config_has_provider_model_capability_path() {
        // Covers the modelCapability.capabilities.text.providerId path
        let temp = std::env::temp_dir().join("_repair_diag_cap_provider");
        let _ = fs::create_dir_all(&temp);
        fs::write(temp.join("openclawcn.json"), r#"{
            "modelCapability": {
                "capabilities": {
                    "text": {
                        "providerId": "deepseek",
                        "modelId": "deepseek-chat"
                    }
                }
            }
        }"#).unwrap();

        let result = check_config_has_provider(&temp);
        assert!(matches!(result.status, CheckStatus::Pass),
            "modelCapability.capabilities.text.providerId should register as configured provider");
        assert!(result.message.contains("deepseek"));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── logs dir check ───────────────────────────────────────────────

    #[test]
    fn test_check_logs_dir_pass() {
        let temp = std::env::temp_dir().join("_repair_diag_logs");
        let _ = fs::create_dir_all(temp.join("logs"));

        let result = check_logs_dir(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_logs_dir_warn() {
        let temp = std::env::temp_dir().join("_repair_diag_no_logs");
        let _ = fs::create_dir_all(&temp);
        let _ = fs::remove_dir_all(temp.join("logs"));

        let result = check_logs_dir(&temp);
        assert!(matches!(result.status, CheckStatus::Warn));
        assert_eq!(result.fix_id.as_deref(), Some("repair_permissions"));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── auth profiles check ──────────────────────────────────────────

    #[test]
    fn test_check_auth_profiles_valid() {
        let temp = std::env::temp_dir().join("_repair_diag_auth_valid");
        let auth_dir = temp.join("agents").join("main").join("agent");
        let _ = fs::create_dir_all(&auth_dir);
        fs::write(auth_dir.join("auth-profiles.json"),
            r#"{"version":1,"profiles":{}}"#).unwrap();

        let result = check_auth_profiles(&temp);
        assert!(matches!(result.status, CheckStatus::Pass));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_auth_profiles_invalid_json() {
        let temp = std::env::temp_dir().join("_repair_diag_auth_bad");
        let auth_dir = temp.join("agents").join("main").join("agent");
        let _ = fs::create_dir_all(&auth_dir);
        fs::write(auth_dir.join("auth-profiles.json"), "not json!!!").unwrap();

        let result = check_auth_profiles(&temp);
        assert!(matches!(result.status, CheckStatus::Warn));
        assert_eq!(result.fix_id.as_deref(), Some("reset_auth_profiles"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_check_auth_profiles_missing() {
        let temp = std::env::temp_dir().join("_repair_diag_auth_missing");
        let _ = fs::create_dir_all(&temp);

        let result = check_auth_profiles(&temp);
        assert!(matches!(result.status, CheckStatus::Warn));

        let _ = fs::remove_dir_all(&temp);
    }

    // ── disk space check ─────────────────────────────────────────────

    #[test]
    fn test_check_disk_space_with_real_path() {
        // This just tests that the function doesn't panic on a real path
        let temp = std::env::temp_dir();
        let result = check_disk_space(&temp);
        // Should either Pass, Warn, or Fail — but should not panic
        assert!(matches!(result.status, CheckStatus::Pass | CheckStatus::Warn | CheckStatus::Fail));
        assert_eq!(result.id, "disk_space");
    }

    // ── resolve_state_dir tests ──────────────────────────────────────

    #[test]
    fn test_resolve_state_dir_env_override() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        let custom = std::env::temp_dir().join("_repair_custom_state");
        std::env::set_var("OPENCLAWCN_STATE_DIR", custom.to_str().unwrap());
        let resolved = resolve_state_dir();
        assert_eq!(resolved, custom);
        std::env::remove_var("OPENCLAWCN_STATE_DIR");
    }

    #[test]
    fn test_resolve_state_dir_empty_env() {
        let _lock = TEST_ENV_LOCK.lock().unwrap();
        std::env::set_var("OPENCLAWCN_STATE_DIR", "   ");
        let resolved = resolve_state_dir();
        // Should fall back to home dir
        assert!(resolved.to_string_lossy().contains(".openclawcn"));
        std::env::remove_var("OPENCLAWCN_STATE_DIR");
    }

    // ── Serialization tests ──────────────────────────────────────────

    #[test]
    fn test_diagnostic_result_serializable() {
        let result = DiagnosticResult {
            checks: vec![
                check("test", "Test", CheckStatus::Pass, "OK", None),
                check("test2", "Test2", CheckStatus::Fail, "Bad", Some("fix")),
            ],
            system_info: SystemInfo {
                os: "windows x86_64".into(),
                arch: "x86_64".into(),
                memory_total_mb: 16384,
                disk_free_mb: 50000,
                app_version: "0.1.0".into(),
                sidecar_running: false,
                gateway_port: 19002,
            },
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"id\":\"test\""));
        assert!(json.contains("\"gateway_port\":19002"));
        assert!(json.contains("\"fix_id\":\"fix\""));
    }

    #[test]
    fn test_check_status_serialization() {
        let pass_json = serde_json::to_string(&CheckStatus::Pass).unwrap();
        let warn_json = serde_json::to_string(&CheckStatus::Warn).unwrap();
        let fail_json = serde_json::to_string(&CheckStatus::Fail).unwrap();
        assert_eq!(pass_json, "\"Pass\"");
        assert_eq!(warn_json, "\"Warn\"");
        assert_eq!(fail_json, "\"Fail\"");
    }

    // ── run_all_checks integration test ─────────────────────────────

    #[test]
    fn test_run_all_checks_returns_12_checks() {
        let result = run_all_checks();
        assert_eq!(result.checks.len(), 12, "Should have exactly 12 diagnostic checks");
    }

    #[test]
    fn test_run_all_checks_all_have_ids() {
        let result = run_all_checks();
        for check in &result.checks {
            assert!(!check.id.is_empty(), "Check should have non-empty id");
            assert!(!check.name.is_empty(), "Check should have non-empty name");
            assert!(!check.message.is_empty(), "Check should have non-empty message");
        }
    }

    #[test]
    fn test_system_info_populated() {
        let info = collect_system_info();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.app_version.is_empty());
        assert_eq!(info.gateway_port, 19002);
    }

    // ── gateway lock check ──────────────────────────────────────────

    #[test]
    fn test_check_gateway_locks_clean() {
        // Just verify the check doesn't panic
        let result = check_gateway_locks();
        assert_eq!(result.id, "gateway_lock_stale");
        assert!(matches!(result.status, CheckStatus::Pass | CheckStatus::Warn));
    }

    // ── node binary & backend entry (fallback) ──────────────────────

    #[test]
    fn test_check_node_binary_fallback() {
        // When bundled resources are missing, should return Warn (system fallback) or Pass
        let result = check_node_binary();
        assert_eq!(result.id, "node_binary_exists");
        assert!(matches!(result.status, CheckStatus::Pass | CheckStatus::Warn));
    }

    #[test]
    fn test_check_backend_entry_fallback() {
        let result = check_backend_entry();
        assert_eq!(result.id, "backend_entry_exists");
        assert!(matches!(result.status, CheckStatus::Pass | CheckStatus::Warn));
    }
}
