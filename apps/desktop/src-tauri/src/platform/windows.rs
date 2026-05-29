#![cfg(target_os = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;

// ── Windows Job Object API (FFI) ────────────────────────────────────────
//
// Used to reliably kill the sidecar node.exe and ALL its descendant processes
// (MCP servers, workers, etc.) when the app exits.
//
// Background: `taskkill /T /PID` relies on ParentProcessId tree traversal,
// which breaks when intermediate processes (e.g. cmd.exe from cross-spawn)
// exit before their children. Job Objects solve this at the kernel level —
// all processes assigned to a job (and their descendants) are terminated
// atomically when the job handle is closed.

type HANDLE = *mut std::ffi::c_void;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
/// JobObjectExtendedLimitInformation class constant for SetInformationJobObject.
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;

#[repr(C)]
#[allow(non_snake_case)]
struct IO_COUNTERS {
    ReadOperationCount: u64,
    WriteOperationCount: u64,
    OtherOperationCount: u64,
    ReadTransferCount: u64,
    WriteTransferCount: u64,
    OtherTransferCount: u64,
}

#[repr(C)]
#[allow(non_snake_case)]
struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    PerProcessUserTimeLimit: i64,
    PerJobUserTimeLimit: i64,
    LimitFlags: u32,
    MinimumWorkingSetSize: usize,
    MaximumWorkingSetSize: usize,
    ActiveProcessLimit: u32,
    Affinity: usize,
    PriorityClass: u32,
    SchedulingClass: u32,
}

#[repr(C)]
#[allow(non_snake_case)]
struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
    IoInfo: IO_COUNTERS,
    ProcessMemoryLimit: usize,
    JobMemoryLimit: usize,
    PeakProcessMemoryUsed: usize,
    PeakJobMemoryUsed: usize,
}

extern "system" {
    fn CreateJobObjectW(lpJobAttributes: *mut std::ffi::c_void, lpName: *const u16) -> HANDLE;
    fn SetInformationJobObject(
        hJob: HANDLE,
        JobObjectInformationClass: u32,
        lpJobObjectInformation: *const std::ffi::c_void,
        cbJobObjectInformationLength: u32,
    ) -> i32;
    fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> i32;
    fn TerminateJobObject(hJob: HANDLE, uExitCode: u32) -> i32;
    fn CloseHandle(hObject: HANDLE) -> i32;
}

/// RAII wrapper for a Windows Job Object handle.
/// On Drop: terminates all processes in the job, then closes the handle.
pub struct JobObjectHandle {
    handle: HANDLE,
}

// SAFETY: HANDLE is a kernel object reference. It is safe to send between
// threads — the underlying OS object is reference-counted by the kernel.
unsafe impl Send for JobObjectHandle {}

impl Drop for JobObjectHandle {
    fn drop(&mut self) {
        if !self.handle.is_null() && self.handle != INVALID_HANDLE_VALUE {
            unsafe {
                // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE means closing the last
                // handle also kills all processes, but we call Terminate first
                // to be explicit.
                TerminateJobObject(self.handle, 1);
                CloseHandle(self.handle);
            }
            println!("[Sidecar] Job object closed, all child processes terminated");
        }
    }
}

/// Create a Windows Job Object and assign the given child process to it.
///
/// The Job Object is configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`:
/// when the returned handle is dropped, ALL processes in the job (including
/// grandchildren, great-grandchildren, etc.) are terminated by the OS kernel.
///
/// Returns `None` if any step fails (non-fatal — falls back to taskkill).
pub fn create_job_for_child(child: &std::process::Child) -> Option<JobObjectHandle> {
    use std::os::windows::io::AsRawHandle;

    // Step 1: Create an unnamed Job Object
    let job_handle = unsafe { CreateJobObjectW(std::ptr::null_mut(), std::ptr::null()) };
    if job_handle.is_null() || job_handle == INVALID_HANDLE_VALUE {
        eprintln!("[Sidecar] Failed to create job object");
        return None;
    }

    // Step 2: Configure JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    let set_ok = unsafe {
        SetInformationJobObject(
            job_handle,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if set_ok == 0 {
        eprintln!("[Sidecar] Failed to set job object information");
        unsafe { CloseHandle(job_handle); }
        return None;
    }

    // Step 3: Assign the child process to the job
    let process_handle = child.as_raw_handle() as HANDLE;
    let assign_ok = unsafe { AssignProcessToJobObject(job_handle, process_handle) };
    if assign_ok == 0 {
        eprintln!("[Sidecar] Failed to assign process to job object");
        unsafe { CloseHandle(job_handle); }
        return None;
    }

    println!("[Sidecar] Process assigned to job object (kill-on-close enabled)");
    Some(JobObjectHandle { handle: job_handle })
}

/// Windows: `app_dir/node/node.exe`
pub fn resolve_node_path(app_dir: &Path) -> PathBuf {
    app_dir.join("node").join("node.exe")
}

/// Windows: log file next to the executable.
pub fn resolve_log_path(app_dir: &Path) -> PathBuf {
    app_dir.join("sidecar.log")
}

/// Windows: NODE_PATH points to the node directory.
pub fn configure_node_env(command: &mut Command, app_dir: &Path) {
    command.env("NODE_PATH", app_dir.join("node"));
}

/// Windows: hide the console window spawned by the sidecar.
pub fn configure_process_flags(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

/// Windows: open a directory in Explorer.
pub fn open_directory(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    Command::new("explorer")
        .arg(path)
        .spawn()?;
    Ok(())
}

/// Windows: open Explorer with the specified file selected.
/// Uses `explorer /select,"path"` to highlight the file.
/// Falls back to opening the parent directory if the file doesn't exist.
pub fn open_file_in_explorer(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if path.exists() {
        Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()?;
    } else if let Some(parent) = path.parent() {
        // File doesn't exist yet — open the parent directory
        Command::new("explorer")
            .arg(parent)
            .spawn()?;
    }
    Ok(())
}
