//! frpc process management for remote repair tunnels.
//!
//! Manages an frpc subprocess that creates a TCP tunnel from the user's
//! local SSH port to our frps relay server, enabling our repair agent
//! to SSH into the user's machine.
//!
//! Follows the same `Mutex<Option<Child>>` pattern as `sidecar.rs`.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};

// ── Constants ────────────────────────────────────────────────────────────────

const FRPS_ADDR: &str = "106.15.198.253";
const FRPS_PORT: u16 = 7000;
const FRPS_AUTH_TOKEN: &str = "openclawcn-frp-2026";

/// Maximum tunnel lifetime in seconds (30 minutes).
const TUNNEL_TIMEOUT_SECS: u64 = 30 * 60;

/// How long to wait for frpc to report the assigned remote port (seconds).
const STARTUP_TIMEOUT_SECS: u64 = 30;

// ── State ────────────────────────────────────────────────────────────────────

static FRPC_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static INTENTIONAL_STOP: AtomicBool = AtomicBool::new(false);
static TUNNEL_INFO: Mutex<Option<TunnelInfo>> = Mutex::new(None);

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    /// Session ID for this tunnel (matches the repair ticket).
    pub session_id: String,
    /// The remote port assigned by frps on the relay server.
    pub remote_port: u16,
    /// The local SSH port being tunneled.
    pub local_port: u16,
    /// Unix timestamp when the tunnel was started.
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub active: bool,
    pub info: Option<TunnelInfo>,
    /// Remaining seconds before auto-timeout.
    pub remaining_secs: Option<u64>,
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Start an frpc tunnel that maps `local_ssh_port` to a dynamically assigned
/// port on the frps relay server.
///
/// Returns `TunnelInfo` with the assigned remote port.
pub fn start_tunnel(session_id: &str, local_ssh_port: u16) -> Result<TunnelInfo, String> {
    // Prevent double-start
    {
        let proc = FRPC_PROCESS.lock().unwrap();
        if proc.is_some() {
            return Err("隧道已在运行中".into());
        }
    }

    INTENTIONAL_STOP.store(false, Ordering::SeqCst);

    // Resolve frpc binary path
    let frpc_path = resolve_frpc_path()
        .ok_or("找不到 frpc 二进制文件。请确认安装完整。")?;

    // Write temporary frpc config
    let config_path = write_frpc_config(session_id, local_ssh_port)?;

    println!(
        "[RemoteTunnel] Starting frpc: {:?}, config: {:?}",
        frpc_path, config_path
    );

    // Start frpc with stdout piped so we can parse the assigned port
    let mut command = Command::new(&frpc_path);
    command
        .arg("-c")
        .arg(&config_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 frpc 失败: {}", e))?;

    // Read stdout to find the assigned remote port.
    // frpc logs a line like:
    //   "start proxy success ... remote_port = 20123"
    // or in newer versions:
    //   "[repair-ssh] start proxy success"
    // We need to parse the remote port from frpc output.
    let remote_port = parse_remote_port(&mut child)?;

    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let info = TunnelInfo {
        session_id: session_id.to_string(),
        remote_port,
        local_port: local_ssh_port,
        started_at,
    };

    // Store process and info
    {
        let mut proc = FRPC_PROCESS.lock().unwrap();
        *proc = Some(child);
    }
    {
        let mut stored = TUNNEL_INFO.lock().unwrap();
        *stored = Some(info.clone());
    }

    // Start timeout watchdog thread
    let sid = session_id.to_string();
    std::thread::spawn(move || {
        tunnel_timeout_watchdog(&sid);
    });

    println!(
        "[RemoteTunnel] Tunnel active: local:{} -> {}:{} (session {})",
        local_ssh_port, FRPS_ADDR, remote_port, session_id
    );

    Ok(info)
}

/// Stop the frpc tunnel and clean up.
pub fn stop_tunnel() -> Result<(), String> {
    INTENTIONAL_STOP.store(true, Ordering::SeqCst);

    let mut proc = FRPC_PROCESS.lock().unwrap();
    if let Some(mut child) = proc.take() {
        let pid = child.id();
        println!("[RemoteTunnel] Stopping frpc (pid {})", pid);

        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000)
                .output();
            // Reap the child handle to release OS resources (prevent zombie handle leak).
            let _ = child.wait();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Clear tunnel info
    {
        let mut info = TUNNEL_INFO.lock().unwrap();
        *info = None;
    }

    // Clean up temp config
    cleanup_frpc_config();

    Ok(())
}

/// Check if the tunnel is currently active.
pub fn is_tunnel_active() -> bool {
    let proc = FRPC_PROCESS.lock().unwrap();
    proc.is_some()
}

/// Get the current tunnel status (for UI polling).
pub fn get_tunnel_status() -> TunnelStatus {
    let active = is_tunnel_active();
    let info = TUNNEL_INFO.lock().unwrap().clone();

    let remaining_secs = info.as_ref().map(|i| {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let elapsed = now.saturating_sub(i.started_at);
        TUNNEL_TIMEOUT_SECS.saturating_sub(elapsed)
    });

    TunnelStatus {
        active,
        info,
        remaining_secs,
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────

/// Find the frpc binary in the bundled resources.
fn resolve_frpc_path() -> Option<PathBuf> {
    // Try standard resource locations
    let exe_dir = std::env::current_exe()
        .ok()?
        .parent()?
        .to_path_buf();

    let candidates = [
        // Production: bundled in resources/tools/
        exe_dir.join("resources").join("tools").join("frpc.exe"),
        exe_dir.join("resources").join("tools").join("frpc"),
        // macOS app bundle
        exe_dir.join("../Resources/tools/frpc"),
        // Dev: check project bundled-bins
        exe_dir.join("bundled-bins").join("frpc.exe"),
        exe_dir.join("bundled-bins").join("frpc"),
    ];

    for candidate in &candidates {
        if candidate.is_file() {
            return Some(candidate.clone());
        }
    }

    // Fallback: check PATH
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("frpc")
        .output()
    {
        let path_str = String::from_utf8_lossy(&output.stdout);
        let path = path_str.trim();
        if !path.is_empty() {
            let p = PathBuf::from(path);
            if p.is_file() {
                return Some(p);
            }
        }
    }

    None
}

/// Write a temporary frpc TOML config file for this session.
fn write_frpc_config(session_id: &str, local_ssh_port: u16) -> Result<PathBuf, String> {
    let config_dir = std::env::temp_dir().join("openclawcn-repair");
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("创建临时目录失败: {}", e))?;

    let config_path = config_dir.join(format!("frpc-{}.toml", session_id));

    // Use remotePort = 0 to let frps dynamically assign a port
    let config_content = format!(
        r#"serverAddr = "{server_addr}"
serverPort = {server_port}
auth.token = "{auth_token}"

[[proxies]]
name = "repair-ssh-{session_id}"
type = "tcp"
localIP = "127.0.0.1"
localPort = {local_port}
remotePort = 0
"#,
        server_addr = FRPS_ADDR,
        server_port = FRPS_PORT,
        auth_token = FRPS_AUTH_TOKEN,
        session_id = session_id,
        local_port = local_ssh_port,
    );

    fs::write(&config_path, &config_content)
        .map_err(|e| format!("写入 frpc 配置失败: {}", e))?;

    Ok(config_path)
}

/// Clean up temporary frpc config files.
fn cleanup_frpc_config() {
    let config_dir = std::env::temp_dir().join("openclawcn-repair");
    if config_dir.is_dir() {
        let _ = fs::remove_dir_all(&config_dir);
    }
}

/// Parse the remote port from frpc's stdout/stderr output.
/// frpc logs something like:
///   `[I] [proxy_manager.go:xxx] [repair-ssh-xxx] proxy start, remote_port: 20123`
/// or newer versions:
///   `start proxy success ... remotePort: 20123`
///
/// IMPORTANT: BufReader::lines() is blocking — we must run it in a dedicated thread
/// and use a channel + recv_timeout so the main thread never blocks indefinitely
/// (e.g. when frpc hangs without producing any output due to a network issue).
fn parse_remote_port(child: &mut Child) -> Result<u16, String> {
    // Take stderr (frpc logs to stderr in recent versions)
    let stderr = child
        .stderr
        .take()
        .ok_or("无法获取 frpc 输出")?;

    // Spawn a reader thread to avoid blocking the main thread.
    // The channel is bounded(1) — we only need the first result.
    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<u16, String>>(1);
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(e) => {
                    let _ = tx.send(Err(format!("读取 frpc 输出失败: {}", e)));
                    return;
                }
            };
            println!("[RemoteTunnel] frpc: {}", line);

            if let Some(port) = extract_port_from_line(&line) {
                let _ = tx.send(Ok(port));
                return;
            }

            if line.contains("connect to server error")
                || line.contains("login to server failed")
            {
                let _ = tx.send(Err(format!("frpc 连接服务器失败: {}", line)));
                return;
            }
        }
        // Process exited without printing port
        let _ = tx.send(Err("frpc 进程异常退出，未能建立隧道".into()));
    });

    // Wait for the reader thread with a hard timeout.
    match rx.recv_timeout(Duration::from_secs(STARTUP_TIMEOUT_SECS)) {
        Ok(result) => result,
        Err(_timeout) => {
            // Timeout — kill the frpc process and reap the handle before returning.
            let pid = child.id();
            println!("[RemoteTunnel] frpc startup timeout, killing pid {}", pid);
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output();
                // Reap the child handle to prevent zombie handle leak on Windows.
                let _ = child.wait();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
                let _ = child.wait();
            }
            Err("frpc 启动超时，未能获取分配的远程端口".into())
        }
    }
}

/// Extract a remote port number from an frpc log line.
fn extract_port_from_line(line: &str) -> Option<u16> {
    // Pattern 1: "remote_port: 20123" or "remotePort: 20123"
    for pattern in &["remote_port:", "remotePort:", "remote_port =", "remotePort ="] {
        if let Some(idx) = line.find(pattern) {
            let after = &line[idx + pattern.len()..];
            let port_str: String = after.trim().chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(port) = port_str.parse::<u16>() {
                if port > 0 {
                    return Some(port);
                }
            }
        }
    }

    // Pattern 2: "start proxy success" line — may not contain port directly
    // In this case we need to check subsequent lines (handled by caller)

    None
}

/// Background thread that auto-closes the tunnel after TUNNEL_TIMEOUT_SECS.
fn tunnel_timeout_watchdog(session_id: &str) {
    let check_interval = Duration::from_secs(10);
    let start = Instant::now();

    loop {
        std::thread::sleep(check_interval);

        if INTENTIONAL_STOP.load(Ordering::SeqCst) {
            return;
        }

        if !is_tunnel_active() {
            return;
        }

        if start.elapsed() > Duration::from_secs(TUNNEL_TIMEOUT_SECS) {
            println!(
                "[RemoteTunnel] Tunnel timeout ({} min), auto-closing session {}",
                TUNNEL_TIMEOUT_SECS / 60,
                session_id
            );
            let _ = stop_tunnel();
            return;
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_port_from_line_remote_port_colon() {
        let line = "[I] [proxy_manager.go:142] [repair-ssh-abc123] proxy start, remote_port: 20345";
        assert_eq!(extract_port_from_line(line), Some(20345));
    }

    #[test]
    fn test_extract_port_from_line_camel_case() {
        let line = "start proxy success, remotePort: 25678";
        assert_eq!(extract_port_from_line(line), Some(25678));
    }

    #[test]
    fn test_extract_port_from_line_equals() {
        let line = "remote_port = 21000";
        assert_eq!(extract_port_from_line(line), Some(21000));
    }

    #[test]
    fn test_extract_port_from_line_no_port() {
        let line = "[I] connecting to server at 106.15.198.253:7000";
        assert_eq!(extract_port_from_line(line), None);
    }

    #[test]
    fn test_tunnel_status_inactive() {
        let status = get_tunnel_status();
        // May or may not be active depending on test ordering,
        // but the function should not panic.
        assert!(!status.active || status.info.is_some());
    }

    #[test]
    fn test_write_and_cleanup_frpc_config() {
        let config_path = write_frpc_config("test-session-123", 22).unwrap();
        assert!(config_path.exists());

        let content = fs::read_to_string(&config_path).unwrap();
        assert!(content.contains("repair-ssh-test-session-123"));
        assert!(content.contains("remotePort = 0"));
        assert!(content.contains("localPort = 22"));

        cleanup_frpc_config();
        assert!(!config_path.exists());
    }
}
