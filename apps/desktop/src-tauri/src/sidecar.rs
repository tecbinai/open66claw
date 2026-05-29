use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::platform;

static SIDECAR_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Last known PID of the sidecar process. Preserved even after the Child handle
/// is consumed by `try_wait()` detecting an exit, so the watchdog can still kill
/// orphaned child processes (MCP servers, workers) that outlive the parent.
static LAST_SIDECAR_PID: Mutex<Option<u32>> = Mutex::new(None);

/// Windows Job Object handle. When dropped, the OS kernel kills ALL processes
/// in the job (sidecar + all descendants), regardless of intermediate process exits.
/// This solves the problem where `taskkill /T` cannot reach grandchild processes
/// whose parent (e.g. cmd.exe from cross-spawn) has already exited.
#[cfg(target_os = "windows")]
static SIDECAR_JOB: Mutex<Option<platform::JobObjectHandle>> = Mutex::new(None);

/// Runtime-generated token for Tauri <-> Gateway auth.
/// Generated once per app launch; passed to both sidecar and WebView.
static GATEWAY_TOKEN: Mutex<Option<String>> = Mutex::new(None);

/// True when EXTERNAL_GATEWAY env var is set or sidecar startup was skipped.
static EXTERNAL_GATEWAY: Mutex<bool> = Mutex::new(false);

const GATEWAY_PORT: u16 = 19002;

/// Try to find `node` on the system PATH, then check well-known locations.
/// When launched from a `.app` bundle via Finder, PATH is minimal
/// (`/usr/bin:/bin:/usr/sbin:/sbin`), so `which node` will miss Homebrew/nvm
/// installs. We fall back to probing common paths directly.
fn find_system_node() -> Option<PathBuf> {
    // 1. Try PATH-based lookup first (works in terminal / tauri dev).
    #[cfg(target_os = "windows")]
    let output = Command::new("where").arg("node").output();
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("which").arg("node").output();

    if let Ok(output) = output {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let first_line = path_str.lines().next().unwrap_or("").trim();
            if !first_line.is_empty() {
                let p = PathBuf::from(first_line);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 2. Probe well-known locations (Finder-launched .app won't have full PATH).
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let candidates: Vec<PathBuf> = vec![
            // Homebrew Apple Silicon
            PathBuf::from("/opt/homebrew/bin/node"),
            // Homebrew Intel
            PathBuf::from("/usr/local/bin/node"),
            // nvm (default alias)
            PathBuf::from(format!("{}/.nvm/current/bin/node", home)),
            // fnm
            PathBuf::from(format!("{}/.local/share/fnm/aliases/default/bin/node", home)),
            // volta
            PathBuf::from(format!("{}/.volta/bin/node", home)),
            // System
            PathBuf::from("/usr/bin/node"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                println!("[Sidecar] Found node at well-known path: {:?}", candidate);
                return Some(candidate);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let candidates = [
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
        ];
        for candidate in &candidates {
            let p = PathBuf::from(candidate);
            if p.exists() {
                println!("[Sidecar] Found node at well-known path: {:?}", p);
                return Some(p);
            }
        }
    }

    None
}

/// Public wrapper for diagnostics.
pub fn find_system_node_pub() -> Option<PathBuf> {
    find_system_node()
}

/// Node.js version to download when no node is found.
const NODE_VERSION: &str = "v22.16.0";

/// Update the splash screen loading text via JavaScript injection.
fn update_splash_text(app: &AppHandle, text: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let escaped = text.replace('\\', "\\\\").replace('\'', "\\'");
        let js = format!(
            "var _t=document.getElementById('__loading_text__');\
             if(_t){{_t.textContent='{}';_t.style.color='#8892b0';_t.style.animation='__pulse 2s ease-in-out infinite'}}",
            escaped
        );
        let _ = window.eval(&js);
    }
}

/// Download and install Node.js to `~/.openclaw/node/`.
/// On macOS: downloads `.tar.gz`, extracts with system `tar`.
/// On Windows: downloads `.zip`, extracts `node.exe`.
/// Returns the path to the `node` (or `node.exe`) binary.
fn download_node(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let node_dir = home.join(".openclaw").join("node");

    #[cfg(target_os = "macos")]
    let (arch, ext) = {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
        (arch, "tar.gz")
    };
    #[cfg(target_os = "windows")]
    let (arch, ext) = ("x64", "zip");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let (arch, ext) = ("x64", "tar.gz");

    let filename = format!("node-{}-{}-{}.{}", NODE_VERSION, std::env::consts::OS, arch, ext);
    let url = format!("https://nodejs.org/dist/{}/{}", NODE_VERSION, filename);
    let download_path = home.join(".openclaw").join(&filename);

    println!("[Sidecar] Downloading Node.js from: {}", url);
    update_splash_text(app, "正在下载 Node.js 运行时...");

    // Download
    fs::create_dir_all(home.join(".openclaw"))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;
    let response = client.get(&url).send()?;
    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()).into());
    }
    let bytes = response.bytes()?;
    let mut file = fs::File::create(&download_path)?;
    file.write_all(&bytes)?;
    drop(file);
    println!("[Sidecar] Downloaded {} bytes to {:?}", bytes.len(), download_path);

    update_splash_text(app, "正在安装 Node.js 运行时...");

    // Extract
    #[cfg(target_os = "macos")]
    {
        // Use system tar to extract (always available on macOS)
        let tmp_extract = home.join(".openclaw").join("_node_extract");
        let _ = fs::remove_dir_all(&tmp_extract);
        fs::create_dir_all(&tmp_extract)?;

        let status = Command::new("tar")
            .args(["xzf", &download_path.to_string_lossy(), "-C", &tmp_extract.to_string_lossy()])
            .status()?;
        if !status.success() {
            let _ = fs::remove_dir_all(&tmp_extract);
            let _ = fs::remove_file(&download_path);
            return Err("tar extraction failed".into());
        }

        // Move extracted dir to ~/.openclaw/node/
        // The tarball extracts to node-vXX.XX.XX-darwin-arm64/
        let extracted_name = format!("node-{}-{}-{}", NODE_VERSION, std::env::consts::OS, arch);
        let extracted_dir = tmp_extract.join(&extracted_name);
        if !extracted_dir.exists() {
            let _ = fs::remove_dir_all(&tmp_extract);
            let _ = fs::remove_file(&download_path);
            return Err(format!("Expected directory not found: {:?}", extracted_dir).into());
        }

        let _ = fs::remove_dir_all(&node_dir);
        fs::rename(&extracted_dir, &node_dir)?;
        let _ = fs::remove_dir_all(&tmp_extract);
        let _ = fs::remove_file(&download_path);

        let node_bin = node_dir.join("bin").join("node");
        if !node_bin.exists() {
            return Err(format!("node binary not found at {:?}", node_bin).into());
        }
        println!("[Sidecar] Node.js installed to {:?}", node_bin);
        update_splash_text(app, "Node.js 安装完成，正在启动...");
        Ok(node_bin)
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, the zip contains node-vXX-win-x64/node.exe
        // Use PowerShell to extract (always available on Windows 10+)
        let tmp_extract = home.join(".openclaw").join("_node_extract");
        let _ = fs::remove_dir_all(&tmp_extract);
        fs::create_dir_all(&tmp_extract)?;

        let status = Command::new("powershell")
            .args([
                "-NoProfile", "-Command",
                &format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    download_path.to_string_lossy(),
                    tmp_extract.to_string_lossy()
                ),
            ])
            .status()?;
        if !status.success() {
            let _ = fs::remove_dir_all(&tmp_extract);
            let _ = fs::remove_file(&download_path);
            return Err("zip extraction failed".into());
        }

        let extracted_name = format!("node-{}-win-{}", NODE_VERSION, arch);
        let extracted_dir = tmp_extract.join(&extracted_name);

        let _ = fs::remove_dir_all(&node_dir);
        fs::create_dir_all(&node_dir)?;

        // Copy just node.exe (we don't need npm etc.)
        let src_exe = extracted_dir.join("node.exe");
        let dst_exe = node_dir.join("node.exe");
        if src_exe.exists() {
            fs::copy(&src_exe, &dst_exe)?;
        } else {
            let _ = fs::remove_dir_all(&tmp_extract);
            let _ = fs::remove_file(&download_path);
            return Err(format!("node.exe not found in {:?}", extracted_dir).into());
        }

        let _ = fs::remove_dir_all(&tmp_extract);
        let _ = fs::remove_file(&download_path);

        println!("[Sidecar] Node.js installed to {:?}", dst_exe);
        update_splash_text(app, "Node.js \u{5B89}\u{88C5}\u{5B8C}\u{6210}\u{FF0C}\u{6B63}\u{5728}\u{542F}\u{52A8}...");
        Ok(dst_exe)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = fs::remove_file(&download_path);
        Err("Auto-download not supported on this platform".into())
    }
}

/// Try to find `dist/entry.js` by walking up from the executable directory
/// toward the repo root (looks for a directory containing both `package.json`
/// and `dist/entry.js`).
fn find_repo_entry_js() -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let mut dir = exe_path.parent()?;

    for _ in 0..15 {
        let candidate = dir.join("dist").join("entry.js");
        if candidate.exists() && dir.join("package.json").exists() {
            return Some(candidate);
        }
        dir = dir.parent()?;
    }
    None
}

/// Public wrapper for diagnostics.
pub fn find_repo_entry_js_pub() -> Option<PathBuf> {
    find_repo_entry_js()
}

/// [MED-08 FIX] Generate a 48-char hex token using OS CSPRNG.
/// Uses `getrandom` crate which delegates to the OS random source
/// (CryptGenRandom on Windows, /dev/urandom on Unix).
fn generate_token() -> String {
    let mut buf = [0u8; 24]; // 24 bytes = 48 hex chars
    getrandom::getrandom(&mut buf).expect("OS CSPRNG should always be available");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Try to kill any process occupying the given port, including its entire
/// process tree (child node.exe workers from the previous gateway instance).
/// On Windows, uses `netstat` + `taskkill /T /F`. On Unix, uses `lsof` + `kill`.
/// Returns true if a process was found and killed.
fn kill_port_occupant(port: u16) -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd")
            .args(["/C", &format!("netstat -ano | findstr :{} | findstr LISTENING", port)])
            .creation_flags(0x08000000)
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pid_str) = parts.last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid == 0 || pid == std::process::id() {
                            continue;
                        }
                        println!("[Sidecar] Found process {} occupying port {}, killing tree...", pid, port);
                        // /T = kill entire process tree (parent + children)
                        // /F = force kill
                        let kill_result = Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .creation_flags(0x08000000)
                            .output();
                        if let Ok(r) = kill_result {
                            println!("[Sidecar] taskkill /T result: {} {}",
                                r.status,
                                String::from_utf8_lossy(&r.stdout).trim());
                            std::thread::sleep(std::time::Duration::from_millis(1500));
                            return true;
                        }
                    }
                }
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for pid_str in stdout.lines() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    if pid == 0 || pid == std::process::id() {
                        continue;
                    }
                    println!("[Sidecar] Found process {} occupying port {}, killing...", pid, port);
                    // Kill the process group to get children too
                    let _ = Command::new("kill").args(["-9", &format!("-{}", pid)]).output();
                    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    return true;
                }
            }
        }
        false
    }
}

/// Internal: kill port occupant on the default gateway port.
fn try_kill_port_occupant() -> bool {
    kill_port_occupant(GATEWAY_PORT)
}

/// Public API: try to kill any process occupying the specified port.
/// Used by the repair assistant to release stuck ports.
pub fn try_kill_port_occupant_pub(port: u16) -> bool {
    kill_port_occupant(port)
}

/// Clean up stale gateway lock files in the system temp directory.
/// Removes any `gateway.*.lock` files found in `openclaw-*` temp dirs.
/// Node.js uses `os.tmpdir()/openclaw-<uid>` as the lock directory.
pub fn cleanup_gateway_locks() {
    let temp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            // Match both "openclaw-<uid>" and "openclawcn-<uid>" patterns
            if !(name_str.starts_with("openclaw-") || name_str.starts_with("openclawcn-"))
                || !entry.path().is_dir()
            {
                continue;
            }
            if let Ok(lock_entries) = std::fs::read_dir(entry.path()) {
                for lock_entry in lock_entries.flatten() {
                    let lock_name = lock_entry.file_name();
                    let lock_str = lock_name.to_string_lossy();
                    if lock_str.starts_with("gateway.") && lock_str.ends_with(".lock") {
                        println!("[Sidecar] Removing stale lock: {:?}", lock_entry.path());
                        let _ = std::fs::remove_file(lock_entry.path());
                    }
                }
            }
        }
    }
}

/// Kill orphaned child processes from a crashed gateway instance.
///
/// When the gateway parent crashes, its children (MCP servers, workers) become
/// orphans. `taskkill /T /PID <parent>` won't work because the parent is gone.
///
/// Strategy: use LAST_SIDECAR_PID to find all node.exe processes whose
/// ParentProcessId matches the dead sidecar PID (direct children), then
/// recursively find their children too. On Windows uses WMIC; on Unix
/// orphans get re-parented to PID 1 so we match by command line patterns.
pub fn kill_orphaned_gateway_processes() -> u32 {
    let dead_pid = LAST_SIDECAR_PID.lock().unwrap().take();
    let my_pid = std::process::id();
    let mut killed: u32 = 0;

    #[cfg(target_os = "windows")]
    {
        // Build a PID -> children map from all running processes, then walk
        // the tree from the dead sidecar PID to find all descendants.
        let output = Command::new("wmic")
            .args([
                "process", "get",
                "ProcessId,ParentProcessId",
                "/FORMAT:CSV",
            ])
            .creation_flags(0x08000000)
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // WMIC CSV: Node,ParentProcessId,ProcessId
            let mut parent_map: std::collections::HashMap<u32, Vec<u32>> =
                std::collections::HashMap::new();

            for line in stdout.lines().skip(1) {
                let line = line.trim();
                if line.is_empty() { continue; }
                let fields: Vec<&str> = line.split(',').collect();
                if fields.len() < 3 { continue; }
                let ppid: u32 = fields[1].trim().parse().unwrap_or(0);
                let pid: u32 = fields[2].trim().parse().unwrap_or(0);
                if pid == 0 { continue; }
                parent_map.entry(ppid).or_default().push(pid);
            }

            // Collect all descendants of the dead sidecar PID
            let mut to_kill: Vec<u32> = Vec::new();
            if let Some(root_pid) = dead_pid {
                let mut stack = vec![root_pid];
                while let Some(pid) = stack.pop() {
                    if let Some(children) = parent_map.get(&pid) {
                        for &child in children {
                            if child != my_pid && child != 0 {
                                to_kill.push(child);
                                stack.push(child); // recurse into grandchildren
                            }
                        }
                    }
                }
            }

            // Kill each orphan (leaf-first order doesn't matter with /F)
            for pid in &to_kill {
                println!("[Sidecar] Killing orphaned gateway child (pid={})", pid);
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output();
                killed += 1;
            }

            if killed > 0 {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, orphans get re-parented to PID 1.
        // Use pgrep to find node processes with PPID=1 that have gateway markers.
        let patterns = [
            "entry.js gateway",
            "openclawcn.mjs gateway",
        ];
        for pattern in &patterns {
            let output = Command::new("pgrep")
                .args(["-f", pattern, "-P", "1"])
                .output();
            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for pid_str in stdout.lines() {
                    if let Ok(pid) = pid_str.trim().parse::<u32>() {
                        if pid != 0 && pid != my_pid {
                            println!("[Sidecar] Killing orphaned gateway process (pid={})", pid);
                            // Kill the process group to get its children too
                            let _ = Command::new("kill").args(["-9", &format!("-{}", pid)]).output();
                            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                            killed += 1;
                        }
                    }
                }
            }
        }

        // Also try killing by the dead PID's process group if known
        if let Some(root_pid) = dead_pid {
            let _ = Command::new("kill")
                .args(["-9", &format!("-{}", root_pid)])
                .output();
        }
    }

    if killed > 0 {
        println!("[Sidecar] Cleaned up {} orphaned gateway process(es)", killed);
    }
    killed
}

/// Check if the gateway port is available. If occupied, try to kill the occupant.
fn ensure_port_available() -> Result<(), String> {
    match TcpListener::bind(("127.0.0.1", GATEWAY_PORT)) {
        Ok(_listener) => Ok(()), // Port is free; listener drops immediately
        Err(_) => {
            println!(
                "[Sidecar] Port {} is occupied, attempting to kill occupying process...",
                GATEWAY_PORT
            );

            if try_kill_port_occupant() {
                // Verify port is now free
                match TcpListener::bind(("127.0.0.1", GATEWAY_PORT)) {
                    Ok(_) => {
                        println!("[Sidecar] Port {} is now available", GATEWAY_PORT);
                        Ok(())
                    }
                    Err(_) => Err(format!(
                        "端口 {} 仍被占用，无法自动释放。\n\n\
                         请手动关闭占用该端口的程序后重试。",
                        GATEWAY_PORT
                    )),
                }
            } else {
                Err(format!(
                    "端口 {} 已被其他程序占用，且无法自动释放。\n\n\
                     可能原因：\n\
                     \u{2022} 已有一个 OpenClawCN 实例在运行\n\
                     \u{2022} 其他程序正在使用该端口\n\n\
                     请关闭占用该端口的程序后重试。",
                    GATEWAY_PORT
                ))
            }
        }
    }
}

fn resolve_app_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let exe_path = std::env::current_exe()?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Failed to get app directory")?;

    // On macOS, the exe is at <app>/Contents/MacOS/<binary>.
    // Tauri bundles "resources/**/*" into <app>/Contents/Resources/resources/.
    // On Windows, resources are next to the exe.
    #[cfg(target_os = "macos")]
    {
        let contents_dir = exe_dir.parent().unwrap_or(exe_dir); // Contents/
        // Check multiple possible resource locations:
        // 1. _dist/ (staging directory used by stage-dist.sh)
        // 2. resources/ (legacy Tauri default)
        for subdir in &["_dist", "resources"] {
            let candidate = contents_dir.join("Resources").join(subdir);
            if candidate.join("dist").join("entry.js").exists() {
                return Ok(candidate);
            }
        }
        // Default fallback
        Ok(contents_dir.join("Resources").join("resources"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Check multiple possible resource locations:
        // 1. _dist/ (staging directory used by stage-dist.sh, preserved by NSIS)
        // 2. resources/ (legacy Tauri default)
        // 3. exe_dir itself (manual deployment / fallback)
        for subdir in &["_dist", "resources"] {
            let candidate = exe_dir.join(subdir);
            if candidate.join("dist").join("entry.js").exists() {
                return Ok(candidate);
            }
        }
        // Fallback: resources directly alongside the exe
        Ok(exe_dir.to_path_buf())
    }
}

/// Public wrapper for `resolve_app_dir()`. Used by the repair assistant
/// to locate the Node.js binary and `dist/entry.js` for running `doctor`.
pub fn resolve_app_dir_pub() -> Result<PathBuf, Box<dyn std::error::Error>> {
    resolve_app_dir()
}

fn open_log_file(log_path: &Path) -> Option<std::fs::File> {
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .ok()
}

/// Detect the state directory that the Node.js gateway will use.
///
/// Mirrors the logic in `src/config/paths.ts resolveStateDir()`:
/// 1. `OPENCLAW_STATE_DIR` env (explicit override)
/// 2. `OPENCLAW_HOME` env + `.openclaw`
/// 3. Scan legacy candidate paths (E:\openclawcn\.openclaw, ~\.openclaw)
///
/// Returns the resolved path so Rust repair modules can find the same data.
fn detect_state_dir() -> PathBuf {
    // Explicit override wins
    if let Ok(val) = std::env::var("OPENCLAW_STATE_DIR") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // OPENCLAW_HOME override
    if let Ok(val) = std::env::var("OPENCLAW_HOME") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join(".openclaw");
        }
    }
    // Scan candidate paths — check for the config marker file
    let mut candidates: Vec<PathBuf> = Vec::new();

    // User home directory — the only candidate for production builds.
    // Note: Do NOT add hardcoded drive paths (e.g. E:\openclawcn) here.
    // Such paths are developer-specific and break on end-user machines.
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".openclaw"));
    }

    // Return the first candidate that looks like a real state dir
    for candidate in &candidates {
        if candidate.join("openclaw.json").exists()
            || candidate.join("logs").is_dir()
            || candidate.join("agents").is_dir()
        {
            return candidate.clone();
        }
    }

    // Fallback: user home (always writable), never E:\openclawcn on unknown machines
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
}

pub fn start_sidecar(_app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = resolve_app_dir()?;
    println!("[Sidecar] App directory: {:?}", app_dir);

    let bundled_node = platform::resolve_node_path(&app_dir);
    let bundled_backend = app_dir.join("dist").join("entry.js");
    let extensions_dir = app_dir.join("extensions");
    let skills_dir = app_dir.join("skills");

    // Allow explicit external gateway mode via env var (useful for testing
    // production builds without bundled sidecar resources).
    let force_external = std::env::var("EXTERNAL_GATEWAY").is_ok();

    // Resolve node_path and backend_path independently.
    // Each can come from bundled resources OR system/repo fallback.
    // This supports mixed mode: e.g. bundled backend + system node.
    if force_external {
        println!(
            "[Sidecar] EXTERNAL_GATEWAY set; skipping sidecar."
        );
        *EXTERNAL_GATEWAY.lock().unwrap() = true;
        return Ok(());
    }

    let node_path = if bundled_node.exists() {
        println!("[Sidecar] Using bundled node: {:?}", bundled_node);
        bundled_node
    } else if let Some(sys_node) = find_system_node() {
        println!("[Sidecar] Using system node: {:?}", sys_node);
        sys_node
    } else {
        // No node found — try to auto-download it
        println!("[Sidecar] Node.js not found, attempting auto-download...");
        match download_node(&_app) {
            Ok(downloaded) => {
                println!("[Sidecar] Using downloaded node: {:?}", downloaded);
                downloaded
            }
            Err(e) => {
                return Err(format!(
                    "\u{65E0}\u{6CD5}\u{627E}\u{5230} Node.js\u{FF0C}\u{81EA}\u{52A8}\u{4E0B}\u{8F7D}\u{4E5F}\u{5931}\u{8D25}\u{3002}\n\
                     \u{9519}\u{8BEF}: {}\n\n\
                     \u{8BF7}\u{624B}\u{52A8}\u{5B89}\u{88C5} Node.js 22+ (https://nodejs.org)\u{3002}",
                    e
                ).into());
            }
        }
    };

    let backend_path = if bundled_backend.exists() {
        println!("[Sidecar] Using bundled backend: {:?}", bundled_backend);
        bundled_backend
    } else if let Some(repo_entry) = find_repo_entry_js() {
        println!("[Sidecar] Using repo backend: {:?}", repo_entry);
        repo_entry
    } else {
        return Err(format!(
            "\u{65E0}\u{6CD5}\u{627E}\u{5230}\u{540E}\u{7AEF}\u{5165}\u{53E3} entry.js\u{3002}\n\
             \u{68C0}\u{67E5}\u{8DEF}\u{5F84}: {} (bundled)\n\
             \u{4E5F}\u{672A}\u{5728}\u{4ED3}\u{5E93}\u{76EE}\u{5F55}\u{4E2D}\u{627E}\u{5230} dist/entry.js\u{3002}\n\n\
             \u{8BF7}\u{786E}\u{4FDD}\u{5B89}\u{88C5}\u{5B8C}\u{6574}\u{6216}\u{5728}\u{4ED3}\u{5E93}\u{6839}\u{76EE}\u{5F55}\u{6267}\u{884C}\u{8FC7} pnpm build\u{3002}",
            bundled_backend.display()
        ).into());
    };

    // Clean up stale gateway lock files from previous instances that were
    // killed without proper shutdown. Without this, the new gateway would
    // detect the stale lock and refuse to start.
    cleanup_gateway_locks();

    // Check port availability; auto-kill stale gateway if port is occupied.
    ensure_port_available().map_err(|msg| -> Box<dyn std::error::Error> { msg.into() })?;

    // Use env-provided token, then config file token, then generate a random one.
    // Reading config token first ensures Rust and Node.js use the same token
    // even when the user has a fixed token configured (avoids token mismatch).
    let token = std::env::var("OPENCLAW_GATEWAY_TOKEN")
        .ok()
        .filter(|t| !t.is_empty())
        .or_else(|| read_config_token())
        .unwrap_or_else(generate_token);
    {
        let mut stored = GATEWAY_TOKEN.lock().unwrap();
        *stored = Some(token.clone());
    }

    println!("[Sidecar] Starting Node.js sidecar...");
    println!("  Node: {:?}", node_path);
    println!("  Backend: {:?}", backend_path);
    println!("  Port: {}", GATEWAY_PORT);

    // Log file
    let log_path = platform::resolve_log_path(&app_dir);
    let log_file = open_log_file(&log_path);

    // Detect the actual state directory the Node.js gateway will use,
    // then propagate it via OPENCLAW_STATE_DIR so the Rust repair modules
    // (repair/mod.rs, offline_diag.rs) resolve the same path.
    let state_dir = detect_state_dir();
    println!("[Sidecar] State directory: {:?}", state_dir);
    // Sync the Tauri process's own env so repair module picks it up immediately
    // (std::env::set_var is process-wide; safe here as we're single-threaded at startup)
    if std::env::var("OPENCLAW_STATE_DIR").is_err() {
        // Only set if not already overridden by the user
        std::env::set_var("OPENCLAW_STATE_DIR", &state_dir);
    }

    // Determine whether we're using bundled resources or fallback (repo) resources.
    // When using fallback, the working dir should be the repo root (parent of dist/entry.js),
    // and bundled-specific paths (extensions, skills, NODE_PATH) need adjustment.
    let is_fallback = !app_dir.join("dist").join("entry.js").exists();
    let work_dir = if is_fallback {
        // backend_path is <repo>/dist/entry.js → parent.parent = repo root
        backend_path.parent().and_then(|d| d.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| app_dir.clone())
    } else {
        app_dir.clone()
    };

    let mut command = Command::new(&node_path);
    command
        .arg(&backend_path)
        .arg("gateway")
        .arg("--port")
        .arg(GATEWAY_PORT.to_string())
        .arg("--allow-unconfigured")
        .env("OPENCLAW_GATEWAY_TOKEN", &token)
        .env("OPENCLAW_DESKTOP_MODE", "1")
        .env("OPENCLAW_NO_RESPAWN", "1")
        .env("OPENCLAW_STATE_DIR", &state_dir)
        .env("NODE_OPTIONS", "--disable-warning=ExperimentalWarning")
        // Node 22 compile cache: persist V8 bytecode across restarts → cold start ~10x faster
        // Fixed path under state_dir so cache survives app restarts and is version-stable
        .env("NODE_COMPILE_CACHE", state_dir.join("node-compile-cache"))
        .current_dir(&work_dir);

    // Set NODE_PATH so that bundled dist JS can resolve npm packages.
    // app_dir/node_modules contains the bundled dependencies (from stage-dist.sh).
    // For fallback mode, the repo's node_modules is used via the work_dir.
    let bundled_nm = app_dir.join("node_modules");
    if bundled_nm.exists() {
        println!("[Sidecar] NODE_PATH: {:?}", bundled_nm);
        command.env("NODE_PATH", &bundled_nm);
    }

    // Bundled-specific: set plugin/skill dirs only when bundled resources exist
    if !is_fallback {
        command
            .env("OPENCLAW_BUNDLED_PLUGINS_DIR", &extensions_dir)
            .env("OPENCLAW_BUNDLED_SKILLS_DIR", &skills_dir);
        // Platform-specific: additional NODE_PATH entries for bundled node
        platform::configure_node_env(&mut command, &app_dir);
    }

    // Redirect output to log file or null
    if let Some(ref file) = log_file {
        if let (Ok(stdout), Ok(stderr)) = (file.try_clone(), file.try_clone()) {
            command.stdout(stdout).stderr(stderr);
        }
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }

    // Platform-specific process flags (e.g. hide console on Windows)
    platform::configure_process_flags(&mut command);

    let child = command.spawn().map_err(|e| -> Box<dyn std::error::Error> {
        format!(
            "\u{65E0}\u{6CD5}\u{542F}\u{52A8}\u{540E}\u{53F0}\u{670D}\u{52A1}\u{FF1A}{}\n\n\u{8BF7}\u{68C0}\u{67E5}\u{5B89}\u{88C5}\u{662F}\u{5426}\u{5B8C}\u{6574}\u{3002}",
            e
        )
        .into()
    })?;

    // Assign the child process to a Windows Job Object so that ALL descendant
    // processes (MCP servers, workers spawned via cross-spawn/cmd.exe, etc.)
    // are automatically killed when the job handle is closed on app exit.
    #[cfg(target_os = "windows")]
    {
        match platform::create_job_for_child(&child) {
            Some(job) => {
                *SIDECAR_JOB.lock().unwrap() = Some(job);
            }
            None => {
                // Non-fatal: falls back to taskkill /T for cleanup.
                eprintln!("[Sidecar] WARNING: Job Object not created, falling back to taskkill for cleanup");
            }
        }
    }

    let pid = child.id();
    {
        let mut last_pid = LAST_SIDECAR_PID.lock().unwrap();
        *last_pid = Some(pid);
    }
    let mut process = SIDECAR_PROCESS.lock().unwrap();
    *process = Some(child);

    println!("[Sidecar] Node.js sidecar started on port {} (pid={})", GATEWAY_PORT, pid);
    Ok(())
}

pub fn stop_sidecar() -> Result<(), Box<dyn std::error::Error>> {
    // On Windows, terminate the Job Object first. This kills ALL processes in
    // the job atomically via the OS kernel — including orphaned grandchildren
    // that `taskkill /T` cannot reach through broken ParentProcessId chains.
    #[cfg(target_os = "windows")]
    {
        // take() removes the handle from the static; drop triggers
        // TerminateJobObject + CloseHandle via the RAII Drop impl.
        if SIDECAR_JOB.lock().unwrap().take().is_some() {
            println!("[Sidecar] Job object terminated");
        }
    }

    let mut process = SIDECAR_PROCESS.lock().unwrap();
    if let Some(mut child) = process.take() {
        let pid = child.id();
        // Fallback: taskkill in case the Job Object wasn't created or some
        // processes escaped the job (e.g. JOB_OBJECT_LIMIT_BREAKAWAY_OK).
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
                .args(["-9", &format!("-{}", pid)])
                .output();
            let _ = child.kill();
        }
        let _ = child.wait();
        println!("[Sidecar] Node.js sidecar stopped (pid={}, tree killed)", pid);
    }
    Ok(())
}

pub fn cleanup_on_exit() {
    if let Err(e) = stop_sidecar() {
        eprintln!("[Sidecar] Error stopping sidecar: {}", e);
    }
}

/// Returns true if the sidecar is currently running.
/// Uses `try_wait()` to detect crashed/exited processes and clean up the handle.
pub fn is_sidecar_running() -> bool {
    // Structured to avoid holding SIDECAR_PROCESS and SIDECAR_JOB locks
    // simultaneously, preventing potential deadlocks with stop_sidecar().
    let (running, needs_job_cleanup) = {
        let mut process = SIDECAR_PROCESS.lock().unwrap();
        if let Some(ref mut child) = *process {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // Process has exited — clean up the stale handle
                    println!("[Sidecar] Process exited (detected via try_wait), cleaning up handle");
                    *process = None;
                    (false, true)
                }
                Ok(None) => {
                    // Still running
                    (true, false)
                }
                Err(e) => {
                    // Error checking status — assume dead
                    eprintln!("[Sidecar] Error checking process status: {}, assuming dead", e);
                    *process = None;
                    (false, true)
                }
            }
        } else {
            // External gateway may be running without a sidecar process (EXTERNAL_GATEWAY env)
            (*EXTERNAL_GATEWAY.lock().unwrap(), false)
        }
    }; // SIDECAR_PROCESS lock released here

    // Clean up the Job Object after releasing the process lock to avoid deadlock.
    #[cfg(target_os = "windows")]
    if needs_job_cleanup {
        let mut job_guard = SIDECAR_JOB.lock().unwrap();
        if job_guard.is_some() {
            // Drop triggers TerminateJobObject + CloseHandle, cleaning up
            // any lingering child processes from the dead sidecar.
            *job_guard = None;
            println!("[Sidecar] Job object cleaned up after process exit");
        }
    }

    running
}

/// Returns true if using an external (non-sidecar) gateway.
pub fn is_external_gateway() -> bool {
    *EXTERNAL_GATEWAY.lock().unwrap()
}

/// Returns the gateway token only if the sidecar is currently running.
/// Used by doctor subprocess to authenticate with the running gateway.
pub fn gateway_token_if_running() -> Option<String> {
    if is_sidecar_running() {
        GATEWAY_TOKEN.lock().unwrap().clone()
    } else {
        None
    }
}

/// Restart the sidecar process.
pub fn restart_sidecar(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    println!("[Sidecar] Restarting sidecar...");
    stop_sidecar()?;
    // Small delay to ensure the port is released
    std::thread::sleep(std::time::Duration::from_millis(500));
    start_sidecar(app)?;
    Ok(())
}

/// Returns the gateway token so the WebView URL can include `#token=...`.
/// The token is generated at startup. If no sidecar was started (EXTERNAL_GATEWAY),
/// falls back to reading the token from the gateway config file.
pub fn gateway_token() -> String {
    let stored = GATEWAY_TOKEN.lock().unwrap().clone();
    if let Some(token) = stored {
        return token;
    }

    // Dev mode fallback: read token from gateway config file.
    if let Some(token) = read_config_token() {
        return token;
    }

    "openclawcn-desktop-local".to_string()
}

/// Try to read gateway.auth.token from the config file.
/// Respects OPENCLAW_HOME env var for custom home directory.
fn read_config_token() -> Option<String> {
    let openclawcn_home = std::env::var("OPENCLAW_HOME").ok().map(PathBuf::from);
    let home = dirs::home_dir();

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(ref oh) = openclawcn_home {
        candidates.push(oh.join(".openclaw").join("openclaw.json"));
    }
    if let Some(ref h) = home {
        candidates.push(h.join(".openclaw").join("openclaw.json"));
    }

    for path in candidates {
        if let Some(token) = read_token_from_file(&path) {
            return Some(token);
        }
    }

    None
}

/// Fetch gateway token from the running gateway's /api/local-token endpoint.
fn fetch_token_from_gateway() -> Option<String> {
    let port = gateway_port();
    let url = format!("http://127.0.0.1:{}/api/local-token", port);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;
    let resp = client.get(&url).send().ok()?;
    let body: serde_json::Value = resp.json().ok()?;
    body.get("token")?.as_str().map(|s| s.to_string())
}

fn read_token_from_file(path: &Path) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let token = parsed
        .get("gateway")?
        .get("auth")?
        .get("token")?
        .as_str()?;
    // Skip env-var placeholders (${...}) — not substituted in config file
    if token.starts_with("${") && token.ends_with('}') {
        return None;
    }
    Some(token.to_string())
}

/// Returns the gateway port number.
/// In external gateway mode, reads `GATEWAY_PORT` env var
/// so Tauri connects to the externally-started gateway.
pub fn gateway_port() -> u16 {
    if is_external_gateway() {
        if let Ok(val) = std::env::var("GATEWAY_PORT") {
            if let Ok(port) = val.parse::<u16>() {
                return port;
            }
        }
    }
    GATEWAY_PORT
}

/// Returns the full path to the sidecar log file (e.g. `resources/sidecar.log`).
pub fn log_file_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_dir = resolve_app_dir()?;
    Ok(platform::resolve_log_path(&app_dir))
}

/// Ensure CN-specific defaults exist in `openclaw.json` before the gateway starts.
///
/// Idempotent: only fills missing keys (fill-empty semantics), except for the
/// local desktop gateway auth block which is normalized to tokenless local mode.
///
/// - `gateway.mode = "local"`
/// - `gateway.bind = "loopback"` (security: only listen on localhost)
/// - `gateway.auth.mode = "none"`
/// - `gateway.controlUi.dangerouslyDisableDeviceAuth = true`
/// - `update.checkOnStart = false`
/// - `update.auto.enabled = false`
/// - `plugins.entries.cn-adapter.enabled = true`
/// - `plugins.entries.agent-team.enabled = true`
pub fn ensure_cn_defaults() {
    let state_dir = detect_state_dir();
    let config_path = state_dir.join("openclaw.json");

    // Read existing config (or start with empty object)
    let mut config: serde_json::Value = if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|_| serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        }
    } else {
        serde_json::json!({})
    };

    let mut changed = false;

    // Helper: ensure a nested key exists under gateway object
    let gateway = config
        .as_object_mut()
        .unwrap()
        .entry("gateway")
        .or_insert_with(|| serde_json::json!({}));
    let gateway_obj = gateway.as_object_mut().unwrap();

    // Ensure gateway.mode = "local"
    gateway_obj.entry("mode").or_insert_with(|| { changed = true; serde_json::json!("local") });

    // Ensure gateway.bind = "loopback" (only listen on 127.0.0.1)
    gateway_obj.entry("bind").or_insert_with(|| { changed = true; serde_json::json!("loopback") });

    // Desktop is a local-only app: the gateway binds to loopback and should not
    // require a shared token for the bundled Control UI.
    {
        let auth = gateway_obj
            .entry("auth")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .unwrap();
        let current_mode = auth.get("mode").and_then(|v| v.as_str());
        if current_mode != Some("none") {
            auth.insert("mode".to_string(), serde_json::json!("none"));
            changed = true;
        }
        if auth.remove("token").is_some() {
            changed = true;
        }
        if auth.remove("password").is_some() {
            changed = true;
        }
    }

    // Ensure gateway.controlUi.dangerouslyDisableDeviceAuth = true
    // Desktop mode always uses token auth via env var, device pairing is unnecessary.
    {
        let control_ui = gateway_obj
            .entry("controlUi")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .unwrap();
        control_ui.entry("dangerouslyDisableDeviceAuth")
            .or_insert_with(|| { changed = true; serde_json::json!(true) });
    }

    // Open-source desktop builds must be fully local by default. Disable the
    // gateway's npm update checks so first launch does not call registry.npmjs.org
    // or block the UI on network timeouts.
    {
        let update = config
            .as_object_mut().unwrap()
            .entry("update")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .unwrap();
        if update.get("checkOnStart").and_then(|v| v.as_bool()) != Some(false) {
            update.insert("checkOnStart".to_string(), serde_json::json!(false));
            changed = true;
        }
        let auto = update
            .entry("auto")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .unwrap();
        if auto.get("enabled").and_then(|v| v.as_bool()) != Some(false) {
            auto.insert("enabled".to_string(), serde_json::json!(false));
            changed = true;
        }
    }

    // Ensure all CN-relevant plugins are enabled by default.
    // Channel plugins must be enabled for their configSchema to appear in the UI.
    {
        let plugins = config
            .as_object_mut().unwrap()
            .entry("plugins")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut().unwrap();

        // Keep the packaged app on a small trusted plugin set by default.
        // Users can enable channel/provider plugins explicitly from the UI/config.
        let default_plugins: &[&str] = &[
            "cn-adapter",
            "agent-team",
            "acpx",
            "llm-task",
            "memory-core",
            "device-pair",
            "diffs",
            "thread-ownership",
            "diagnostics-otel",
        ];
        if plugins
            .get("allow")
            .and_then(|v| v.as_array())
            .map(|arr| arr.is_empty())
            .unwrap_or(true)
        {
            plugins.insert(
                "allow".to_string(),
                serde_json::json!(default_plugins),
            );
            changed = true;
        }

        let entries = plugins
            .entry("entries")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut().unwrap();
        for plugin_id in default_plugins {
            let entry = entries
                .entry(*plugin_id)
                .or_insert_with(|| serde_json::json!({}))
                .as_object_mut()
                .unwrap();
            entry.entry("enabled").or_insert_with(|| { changed = true; serde_json::json!(true) });
        }
    }

    if changed {
        std::fs::create_dir_all(&state_dir).ok();
        if let Ok(json) = serde_json::to_string_pretty(&config) {
            std::fs::write(&config_path, json).ok();
        }
        println!("[CN-defaults] Applied to {}", config_path.display());
    }
}
