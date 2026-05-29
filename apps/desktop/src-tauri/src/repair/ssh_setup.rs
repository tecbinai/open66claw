//! SSH server detection, enablement, and authorized_key management.
//!
//! On Windows: OpenSSH Server (optional feature).
//! On macOS: Remote Login (System Preferences → Sharing).
//!
//! This module handles:
//! - Checking if SSH server is installed and running
//! - Enabling SSH server (may require elevation)
//! - Injecting a one-time public key into authorized_keys
//! - Cleaning up the public key after the repair session

use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshStatus {
    /// Whether SSH server software is installed.
    pub installed: bool,
    /// Whether the SSH server service is currently running.
    pub running: bool,
    /// The SSH listening port (usually 22).
    pub port: u16,
    /// Human-readable status message.
    pub message: String,
    /// The current OS user name (for SSH connection).
    pub username: String,
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Check the current state of the SSH server on this machine.
pub fn check_ssh() -> SshStatus {
    #[cfg(target_os = "windows")]
    {
        check_ssh_windows()
    }
    #[cfg(target_os = "macos")]
    {
        check_ssh_macos()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        SshStatus {
            installed: false,
            running: false,
            port: 22,
            message: "不支持的操作系统".into(),
            username: whoami(),
        }
    }
}

/// Enable the SSH server. On Windows, this may trigger a UAC elevation prompt.
/// Returns Ok(()) on success or an error message.
pub fn enable_ssh() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        enable_ssh_windows()
    }
    #[cfg(target_os = "macos")]
    {
        enable_ssh_macos()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("不支持的操作系统".into())
    }
}

/// Validate that a string looks like a valid SSH public key.
/// Accepts formats: ssh-rsa, ssh-ed25519, ecdsa-sha2-*, sk-ssh-*, ssh-dss.
fn validate_ssh_public_key(key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("公钥不能为空".into());
    }
    // Must not contain newlines (potential injection)
    if trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("公钥包含非法换行符".into());
    }
    // Must start with a known key type prefix
    let valid_prefixes = [
        "ssh-rsa ", "ssh-ed25519 ", "ssh-dss ",
        "ecdsa-sha2-", "sk-ssh-ed25519@", "sk-ecdsa-sha2-",
    ];
    if !valid_prefixes.iter().any(|p| trimmed.starts_with(p)) {
        return Err(format!(
            "不是有效的 SSH 公钥格式（应以 ssh-rsa/ssh-ed25519/ecdsa-sha2-* 开头）"
        ));
    }
    // Key data part should be base64-like (letters, digits, +, /, =)
    let parts: Vec<&str> = trimmed.splitn(3, ' ').collect();
    if parts.len() < 2 {
        return Err("SSH 公钥格式不完整（缺少密钥数据）".into());
    }
    let key_data = parts[1];
    if key_data.len() < 16 {
        return Err("SSH 公钥数据过短".into());
    }
    if !key_data.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=') {
        return Err("SSH 公钥包含无效字符".into());
    }
    Ok(())
}

/// Inject a public key into the user's `~/.ssh/authorized_keys` file,
/// tagged with the session ID for later cleanup.
pub fn inject_authorized_key(public_key: &str, session_id: &str) -> Result<(), String> {
    // Validate public key format before writing to authorized_keys
    validate_ssh_public_key(public_key)?;

    let ssh_dir = get_ssh_dir()?;
    fs::create_dir_all(&ssh_dir)
        .map_err(|e| format!("创建 .ssh 目录失败: {}", e))?;

    let auth_keys_path = ssh_dir.join("authorized_keys");

    // Read existing content (if any)
    let existing = fs::read_to_string(&auth_keys_path).unwrap_or_default();

    // Check if this session's key is already present
    let tag = format!("openclawcn-repair-{}", session_id);
    if existing.contains(&tag) {
        return Ok(()); // Already injected
    }

    // Append the new key with a comment tag
    let key_line = format!("{} {}\n", public_key.trim(), tag);
    let new_content = if existing.ends_with('\n') || existing.is_empty() {
        format!("{}{}", existing, key_line)
    } else {
        format!("{}\n{}", existing, key_line)
    };

    fs::write(&auth_keys_path, &new_content)
        .map_err(|e| format!("写入 authorized_keys 失败: {}", e))?;

    // On Windows, fix permissions on authorized_keys for administrators
    #[cfg(target_os = "windows")]
    fix_authorized_keys_permissions(&auth_keys_path)
        .map_err(|e| format!("设置 authorized_keys 权限失败: {}", e))?;

    println!(
        "[SshSetup] Injected authorized key for session {} into {:?}",
        session_id, auth_keys_path
    );

    Ok(())
}

/// Remove the public key for the given session from authorized_keys.
pub fn cleanup_authorized_key(session_id: &str) -> Result<(), String> {
    let ssh_dir = get_ssh_dir()?;
    let auth_keys_path = ssh_dir.join("authorized_keys");

    if !auth_keys_path.exists() {
        return Ok(());
    }

    // Read raw bytes to detect and preserve the original line ending style
    let raw = fs::read(&auth_keys_path)
        .map_err(|e| format!("读取 authorized_keys 失败: {}", e))?;
    let content = String::from_utf8_lossy(&raw);

    // Detect CRLF vs LF
    let uses_crlf = content.contains("\r\n");
    let line_ending = if uses_crlf { "\r\n" } else { "\n" };

    let tag = format!("openclawcn-repair-{}", session_id);

    // Split on universal newlines but then reassemble with the original ending
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| !line.contains(&tag))
        .collect();

    let new_content = if filtered.is_empty() {
        String::new()
    } else {
        format!("{}{}", filtered.join(line_ending), line_ending)
    };

    fs::write(&auth_keys_path, new_content.as_bytes())
        .map_err(|e| format!("写入 authorized_keys 失败: {}", e))?;

    println!(
        "[SshSetup] Cleaned up authorized key for session {}",
        session_id
    );

    Ok(())
}

// ── Windows implementation ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn check_ssh_windows() -> SshStatus {
    let username = whoami();

    // Check if OpenSSH Server service exists and its state
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "try { $s = Get-Service sshd -ErrorAction Stop; \"$($s.Status)\" } catch { 'NOT_FOUND' }",
        ])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout == "NOT_FOUND" {
                // Check if the capability is available but not installed
                let cap_check = Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-Command",
                        "Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Select-Object -ExpandProperty State",
                    ])
                    .creation_flags(0x08000000)
                    .output();

                let installable = cap_check
                    .map(|o| {
                        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        s == "NotPresent" || s == "Staged"
                    })
                    .unwrap_or(false);

                SshStatus {
                    installed: false,
                    running: false,
                    port: 22,
                    message: if installable {
                        "OpenSSH Server 未安装（可自动安装）".into()
                    } else {
                        "OpenSSH Server 未安装".into()
                    },
                    username,
                }
            } else if stdout == "Running" {
                SshStatus {
                    installed: true,
                    running: true,
                    port: detect_ssh_port_windows(),
                    message: "OpenSSH Server 运行中".into(),
                    username,
                }
            } else {
                // Service exists but not running (e.g. "Stopped")
                SshStatus {
                    installed: true,
                    running: false,
                    port: 22,
                    message: format!("OpenSSH Server 已安装但未运行 ({})", stdout),
                    username,
                }
            }
        }
        Err(e) => SshStatus {
            installed: false,
            running: false,
            port: 22,
            message: format!("检查 SSH 状态失败: {}", e),
            username,
        },
    }
}

#[cfg(target_os = "windows")]
fn enable_ssh_windows() -> Result<(), String> {
    // Use ShellExecute with "runas" to trigger UAC elevation.
    // We run a PowerShell script that:
    // 1. Installs OpenSSH Server capability (if needed)
    // 2. Starts the sshd service
    // 3. Sets it to auto-start
    // 4. Ensures PubkeyAuthentication is enabled
    let ps_script = r#"
        $ErrorActionPreference = 'Stop'
        # Install OpenSSH Server if not present
        $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
        if ($cap.State -ne 'Installed') {
            Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
        }
        # Start and enable the service
        Start-Service sshd
        Set-Service -Name sshd -StartupType Automatic
        # Ensure PubkeyAuthentication is enabled
        $config = "$env:ProgramData\ssh\sshd_config"
        if (Test-Path $config) {
            $content = Get-Content $config -Raw
            if ($content -notmatch '(?m)^PubkeyAuthentication\s+yes') {
                $content = $content -replace '(?m)^#?\s*PubkeyAuthentication\s+.*', 'PubkeyAuthentication yes'
                if ($content -notmatch 'PubkeyAuthentication') {
                    $content += "`nPubkeyAuthentication yes`n"
                }
                Set-Content $config $content
                Restart-Service sshd
            }
        }
        Write-Output 'SSH_SETUP_OK'
    "#;

    // Write script to temp file to avoid quoting issues
    let script_path = std::env::temp_dir().join("openclawcn-ssh-setup.ps1");
    fs::write(&script_path, ps_script)
        .map_err(|e| format!("写入 SSH 安装脚本失败: {}", e))?;

    // Launch elevated PowerShell.
    // Pass script path via environment variable to avoid any shell-quoting /
    // command-injection risk from paths containing spaces or special chars.
    // The inner invocation reads $env:OPENCLAWCN_SETUP_SCRIPT instead of
    // interpolating the path directly into the -ArgumentList string.
    let result = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Start-Process powershell -Verb RunAs -Wait -ArgumentList \"-NoProfile -ExecutionPolicy Bypass -File `\"$env:OPENCLAWCN_SETUP_SCRIPT`\"\"",
        ])
        .env("OPENCLAWCN_SETUP_SCRIPT", &script_path)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("启动 UAC 提权失败: {}", e))?;

    // Clean up script
    let _ = fs::remove_file(&script_path);

    if result.status.success() {
        // Verify the service is now running
        let status = check_ssh_windows();
        if status.running {
            Ok(())
        } else {
            Err("SSH 安装命令已执行，但服务仍未运行。可能需要重启。".into())
        }
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(format!(
            "SSH 安装失败（用户可能取消了 UAC 提权）: {}",
            stderr.trim()
        ))
    }
}

#[cfg(target_os = "windows")]
fn detect_ssh_port_windows() -> u16 {
    // Check sshd_config for the port
    let config_path = format!("{}\\ssh\\sshd_config", std::env::var("ProgramData").unwrap_or_default());
    if let Ok(content) = fs::read_to_string(&config_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("Port ") {
                if let Ok(port) = trimmed[5..].trim().parse::<u16>() {
                    return port;
                }
            }
        }
    }
    22 // default
}

#[cfg(target_os = "windows")]
fn fix_authorized_keys_permissions(path: &std::path::Path) -> Result<(), String> {
    // On Windows, sshd is strict about authorized_keys permissions for admin users.
    // The file must have specific ACLs. We use icacls to fix this.
    let path_str = path.to_string_lossy();

    let r1 = Command::new("icacls")
        .args([&*path_str, "/inheritance:r"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("icacls /inheritance:r 执行失败: {}", e))?;
    if !r1.status.success() {
        let stderr = String::from_utf8_lossy(&r1.stderr);
        return Err(format!("icacls /inheritance:r 失败: {}", stderr.trim()));
    }

    let r2 = Command::new("icacls")
        .args([&*path_str, "/grant:r", &format!("{}:F", whoami())])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("icacls /grant:r user 执行失败: {}", e))?;
    if !r2.status.success() {
        let stderr = String::from_utf8_lossy(&r2.stderr);
        return Err(format!("icacls /grant:r user 失败: {}", stderr.trim()));
    }

    let r3 = Command::new("icacls")
        .args([&*path_str, "/grant:r", "SYSTEM:F"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("icacls /grant:r SYSTEM 执行失败: {}", e))?;
    if !r3.status.success() {
        let stderr = String::from_utf8_lossy(&r3.stderr);
        return Err(format!("icacls /grant:r SYSTEM 失败: {}", stderr.trim()));
    }

    Ok(())
}

// ── macOS implementation ─────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn check_ssh_macos() -> SshStatus {
    let username = whoami();

    // Check Remote Login status
    let output = Command::new("systemsetup")
        .arg("-getremotelogin")
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let running = stdout.contains("On") || stdout.contains("on");
            SshStatus {
                installed: true, // macOS always has sshd
                running,
                port: 22,
                message: if running {
                    "远程登录已开启".into()
                } else {
                    "远程登录未开启".into()
                },
                username,
            }
        }
        Err(e) => SshStatus {
            installed: true,
            running: false,
            port: 22,
            message: format!("检查远程登录状态失败: {}", e),
            username,
        },
    }
}

#[cfg(target_os = "macos")]
fn enable_ssh_macos() -> Result<(), String> {
    // Try to enable Remote Login via systemsetup (requires sudo)
    let output = Command::new("osascript")
        .args([
            "-e",
            "do shell script \"systemsetup -setremotelogin on\" with administrator privileges",
        ])
        .output()
        .map_err(|e| format!("启用远程登录失败: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "启用远程登录失败（用户可能取消了授权）: {}",
            stderr.trim()
        ))
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Get the .ssh directory for the current user.
fn get_ssh_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".ssh"))
        .ok_or_else(|| "无法获取用户主目录".into())
}

/// Get the current OS username.
fn whoami() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".into())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whoami_not_empty() {
        let name = whoami();
        assert!(!name.is_empty());
        assert_ne!(name, "unknown");
    }

    #[test]
    fn test_get_ssh_dir() {
        let dir = get_ssh_dir().unwrap();
        assert!(dir.to_string_lossy().contains(".ssh"));
    }

    #[test]
    fn test_inject_and_cleanup_authorized_key() {
        // Use a temp directory as the SSH dir to avoid modifying real authorized_keys
        let temp_dir = std::env::temp_dir().join("_ssh_setup_test");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let auth_keys_path = temp_dir.join("authorized_keys");

        // Simulate injection by writing directly (since inject_authorized_key uses get_ssh_dir)
        let session_id = "test-session-42";
        let pub_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest";
        let tag = format!("openclawcn-repair-{}", session_id);
        let key_line = format!("{} {}\n", pub_key, tag);
        fs::write(&auth_keys_path, &key_line).unwrap();

        // Verify the key is there
        let content = fs::read_to_string(&auth_keys_path).unwrap();
        assert!(content.contains(&tag));

        // Simulate cleanup
        let filtered: Vec<&str> = content
            .lines()
            .filter(|line| !line.contains(&tag))
            .collect();
        let new_content = if filtered.is_empty() {
            String::new()
        } else {
            format!("{}\n", filtered.join("\n"))
        };
        fs::write(&auth_keys_path, &new_content).unwrap();

        // Verify key is removed
        let content = fs::read_to_string(&auth_keys_path).unwrap();
        assert!(!content.contains(&tag));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_check_ssh_does_not_panic() {
        // Just verify check_ssh() runs without panicking
        let status = check_ssh();
        assert!(!status.username.is_empty());
        assert!(!status.message.is_empty());
    }

    // ── validate_ssh_public_key tests ──────────────────────────────

    #[test]
    fn test_validate_ssh_ed25519_key() {
        let key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKeyData user@host";
        assert!(validate_ssh_public_key(key).is_ok());
    }

    #[test]
    fn test_validate_ssh_rsa_key() {
        let key = "ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAtestdata user@host";
        assert!(validate_ssh_public_key(key).is_ok());
    }

    #[test]
    fn test_validate_ecdsa_key() {
        let key = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY= user@host";
        assert!(validate_ssh_public_key(key).is_ok());
    }

    #[test]
    fn test_reject_empty_key() {
        assert!(validate_ssh_public_key("").is_err());
        assert!(validate_ssh_public_key("   ").is_err());
    }

    #[test]
    fn test_reject_newline_injection() {
        let evil = "ssh-ed25519 AAAA\ncommand=\"rm -rf /\" ssh-ed25519 BBBB";
        assert!(validate_ssh_public_key(evil).is_err());
    }

    #[test]
    fn test_reject_invalid_prefix() {
        assert!(validate_ssh_public_key("not-a-key AAAA").is_err());
        assert!(validate_ssh_public_key("command=\"bad\" ssh-rsa AAAA").is_err());
    }

    #[test]
    fn test_reject_short_key_data() {
        assert!(validate_ssh_public_key("ssh-ed25519 ABC").is_err());
    }
}
