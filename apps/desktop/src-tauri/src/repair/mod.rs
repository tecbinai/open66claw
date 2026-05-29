pub mod ai_client;
pub mod diagnostics;
pub mod provider_discovery;
pub mod remote_tunnel;
pub mod repair_actions;
pub mod ssh_setup;

use std::path::PathBuf;

/// Resolve the application state directory. Shared helper used by all repair
/// sub-modules to avoid duplicating this logic.
///
/// Priority:
/// 1. `OPENCLAWCN_STATE_DIR` env var (explicit override)
/// 2. `OPENCLAWCN_HOME` env var + `.openclawcn` (portable mode)
/// 3. `~/.openclawcn` (default)
pub(crate) fn resolve_state_dir() -> PathBuf {
    if let Ok(val) = std::env::var("OPENCLAWCN_STATE_DIR") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(val) = std::env::var("OPENCLAWCN_HOME") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join(".openclawcn");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclawcn")
}

/// Global mutex to serialize tests that modify OPENCLAWCN_STATE_DIR env var.
/// Must be shared across all repair test modules to prevent race conditions.
#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
