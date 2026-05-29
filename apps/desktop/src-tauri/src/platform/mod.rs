mod macos;
mod windows;

use std::path::{Path, PathBuf};
use std::process::Command;

// Re-export Windows Job Object handle type for use in sidecar.rs.
#[cfg(target_os = "windows")]
pub use windows::JobObjectHandle;

/// Create a Job Object for the child process and assign it.
/// When the returned handle is dropped, all processes in the job are killed.
/// Returns None on non-Windows or if creation fails (non-fatal).
#[cfg(target_os = "windows")]
pub fn create_job_for_child(child: &std::process::Child) -> Option<JobObjectHandle> {
    windows::create_job_for_child(child)
}

/// Returns the path to the bundled Node.js binary.
pub fn resolve_node_path(app_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        windows::resolve_node_path(app_dir)
    }
    #[cfg(target_os = "macos")]
    {
        macos::resolve_node_path(app_dir)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux fallback — same layout as macOS.
        app_dir.join("node").join("bin").join("node")
    }
}

/// Returns the path where sidecar logs should be written.
pub fn resolve_log_path(app_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        windows::resolve_log_path(app_dir)
    }
    #[cfg(target_os = "macos")]
    {
        macos::resolve_log_path(app_dir)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        app_dir.join("sidecar.log")
    }
}

/// Set NODE_PATH and any platform-specific environment variables.
pub fn configure_node_env(command: &mut Command, app_dir: &Path) {
    #[cfg(target_os = "windows")]
    {
        windows::configure_node_env(command, app_dir);
    }
    #[cfg(target_os = "macos")]
    {
        macos::configure_node_env(command, app_dir);
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        command.env("NODE_PATH", app_dir.join("node").join("lib").join("node_modules"));
    }
}

/// Apply platform-specific process creation flags.
pub fn configure_process_flags(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        windows::configure_process_flags(command);
    }
    #[cfg(target_os = "macos")]
    {
        macos::configure_process_flags(command);
    }
}

/// Open a file in the system file explorer with the file selected/highlighted.
pub fn open_file_in_explorer(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        windows::open_file_in_explorer(path)
    }
    #[cfg(target_os = "macos")]
    {
        macos::open_file_in_explorer(path)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux fallback — open parent directory
        if let Some(parent) = path.parent() {
            Command::new("xdg-open").arg(parent).spawn()?;
        }
        Ok(())
    }
}

/// Open a directory in the system file explorer.
pub fn open_directory(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        windows::open_directory(path)
    }
    #[cfg(target_os = "macos")]
    {
        macos::open_directory(path)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux fallback
        Command::new("xdg-open")
            .arg(path)
            .spawn()?;
        Ok(())
    }
}
