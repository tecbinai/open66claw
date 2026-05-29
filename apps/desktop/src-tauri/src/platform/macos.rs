#![cfg(target_os = "macos")]

use std::path::{Path, PathBuf};
use std::process::Command;

/// macOS: `app_dir/node/bin/node` (Unix FHS convention).
pub fn resolve_node_path(app_dir: &Path) -> PathBuf {
    app_dir.join("node").join("bin").join("node")
}

/// macOS: `~/Library/Logs/OpenClawCN/sidecar.log`.
pub fn resolve_log_path(_app_dir: &Path) -> PathBuf {
    let log_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("Library")
        .join("Logs")
        .join("OpenClawCN");
    log_dir.join("sidecar.log")
}

/// macOS: NODE_PATH follows Unix node layout.
/// Also prepend node/bin to PATH so `#!/usr/bin/env node` scripts (npm, npx) resolve correctly.
pub fn configure_node_env(command: &mut Command, app_dir: &Path) {
    command.env(
        "NODE_PATH",
        app_dir.join("node").join("lib").join("node_modules"),
    );
    // Prepend bundled node/bin to PATH so MCP child processes can find node via `env node`.
    let node_bin_dir = app_dir.join("node").join("bin");
    let current_path = std::env::var("PATH").unwrap_or_default();
    command.env(
        "PATH",
        format!("{}:{}", node_bin_dir.display(), current_path),
    );
}

/// macOS: no special process flags needed.
pub fn configure_process_flags(_command: &mut Command) {
    // No-op on macOS.
}

/// macOS: open a directory in Finder.
pub fn open_directory(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    Command::new("open")
        .arg(path)
        .spawn()?;
    Ok(())
}

/// macOS: open Finder with the specified file selected.
/// Uses `open -R` to reveal the file in Finder.
pub fn open_file_in_explorer(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if path.exists() {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()?;
    } else if let Some(parent) = path.parent() {
        Command::new("open")
            .arg(parent)
            .spawn()?;
    }
    Ok(())
}
