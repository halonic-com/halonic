//! The `resource_report` command (HAL-11118): the numbers for the status
//! bar's resources item, in the shape of `EngineResourceReport` in
//! `packages/studio/shell` (`resource-report.ts`), which reads them.
//!
//! The command takes nothing from the page. The data folder is the profile
//! the CLI uses (`profile.rs`), never a path the page names, so the page
//! learns sizes and no locations.
//!
//! What the report says is what the shell can measure today:
//!
//! - `engineMemoryBytes` is the memory of this app's process. The desktop
//!   Studio runs its engine in the page, in the web view's process, so this
//!   is a lower bound: the web view's own processes are not counted.
//! - `childProcesses` is empty: no engine process starts one yet.
//! - `loadedModels` is left out, which the page reads as "not known", not
//!   as none loaded.

use std::io;
use std::path::{Path, PathBuf};

use halonic_resource_probe::{folder_size_bytes, free_disk_bytes, process_memory_bytes};
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::profile::cli_profile;

/// One process the engine started. None yet, so this is never built; the
/// list is in the report because the page requires it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildProcessUsage {
    name: String,
    memory_bytes: u64,
}

/// What the page's `readResourceReport` reads.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReport {
    engine_memory_bytes: u64,
    child_processes: Vec<ChildProcessUsage>,
    /// The size of the profile folder: run logs, caches and downloads.
    data_bytes: u64,
    /// The free space on the drive that holds the profile folder.
    free_disk_bytes: u64,
}

/// Why the report couldn't be made: a stable `kind` (`io`) and a message
/// for the log.
#[derive(Debug, Serialize)]
pub struct ResourceReportRefusal {
    kind: &'static str,
    message: String,
}

impl ResourceReportRefusal {
    fn io(error: impl std::fmt::Display) -> Self {
        Self {
            kind: "io",
            message: error.to_string(),
        }
    }
}

/// The report for a data folder. A failed read fails the report: the page
/// shows no numbers rather than made-up ones.
fn report_for(data_folder: &Path) -> io::Result<ResourceReport> {
    Ok(ResourceReport {
        engine_memory_bytes: process_memory_bytes()?,
        child_processes: Vec::new(),
        data_bytes: folder_size_bytes(data_folder)?,
        free_disk_bytes: free_disk_bytes(data_folder)?,
    })
}

/// The resource report of the app, for the status bar.
///
/// It walks the profile folder, so it runs on a worker thread.
#[tauri::command]
pub async fn resource_report<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ResourceReport, ResourceReportRefusal> {
    let profile = cli_profile(&app).map_err(ResourceReportRefusal::io)?;
    let data_folder = PathBuf::from(profile.root);
    tauri::async_runtime::spawn_blocking(move || report_for(&data_folder))
        .await
        .map_err(ResourceReportRefusal::io)?
        .map_err(ResourceReportRefusal::io)
}

#[cfg(test)]
#[path = "resource_report_tests.rs"]
mod tests;
