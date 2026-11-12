//! The updater (HAL-1206, flow-install-update section 4): checks the release
//! page for a newer Halonic, downloads it in the background, and installs it
//! on "Restart to update" or when Halonic quits. `tauri-plugin-updater` does
//! the network work and checks the signature against the key built into the
//! app; `halonic-update-state` decides when to check and what to show; this
//! file joins them and keeps the record in `<profile>/updates/updater.json`.
//!
//! The local Studio page reads the status with `update_status`, follows it
//! with `update_watch` and acts with the other `update_*` commands
//! (capabilities/desktop-updates.json); the served Studio gets none. The
//! download is in `updates_download.rs`. Nothing
//! here blocks the window: checks run on their own thread or task, and a
//! failure only changes the status and the log (C58).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use halonic_update_state::{
    CHECK_TIME_LIMIT, CheckFailure, CheckResult, FIRST_CHECK_AFTER, JustUpdated, RecordRead,
    StartOutcome, UpdateState, UpdateStatus, UpdaterRecord, Version, check_due, notes_url,
    read_record, record_text,
};
use tauri::async_runtime::JoinHandle;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

#[path = "updates_download.rs"]
mod download;
use download::start_download;

#[path = "updates_way_back.rs"]
mod way_back;
use way_back::{log_way_back, prove_started};

/// How often the background thread asks whether a check is due.
const TICK: Duration = Duration::from_secs(60);

/// The installer switch that makes our template reopen Halonic (HAL-1139).
/// "Restart to update" passes it; installing at quit doesn't.
const RELAUNCH: &str = "/RELAUNCH";

/// The updater, one per app.
#[derive(Default)]
pub struct Updates {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    current: String,
    record: UpdaterRecord,
    /// False when the record is a newer Halonic's or couldn't be read: the
    /// file is then never written.
    writable: bool,
    file: Option<PathBuf>,
    checking: bool,
    checked_this_run: bool,
    state: Option<UpdateState>,
    just_updated: Option<JustUpdated>,
    /// What the last check found.
    found: Option<Update>,
    /// The downloaded installer, its signature checked. Kept for this
    /// session only: after a crash the next check downloads it again.
    ready: Option<(Update, Vec<u8>)>,
    download: Option<JoinHandle<()>>,
    /// The pages following the status, by window label.
    watchers: Vec<(String, Channel<UpdateStatus>)>,
}

impl Inner {
    fn status(&self) -> UpdateStatus {
        UpdateStatus {
            current: self.current.clone(),
            automatic: self.record.automatic,
            checking: self.checking,
            last_checked: self.record.last_checked,
            just_updated: self.just_updated.clone(),
            state: self.state.clone().unwrap_or(UpdateState::NeverChecked),
        }
    }

    /// Sends the status to every page following it, and forgets those that
    /// have gone.
    fn notify(&mut self) {
        let status = self.status();
        self.watchers
            .retain(|(_, channel)| channel.send(status.clone()).is_ok());
    }

    fn save(&self) {
        let Some(file) = self.file.as_deref().filter(|_| self.writable) else {
            return;
        };
        if let Err(error) = write_over(file, &record_text(&self.record)) {
            eprintln!("updates: {} can't be written: {error}", file.display());
        }
    }

    /// A download runs or has finished: a check doesn't replace that state.
    fn busy(&self) -> bool {
        self.download.is_some() || self.ready.is_some()
    }
}

fn lock<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, Inner> {
    let updates = app.state::<Updates>().inner();
    updates
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Starts the updater on its own thread: it reads the record, looks at the
/// last install (flow 4.6), then runs the automatic checks. The profile is
/// found there too, since that may ask the login shell (HAL-5545), so none
/// of it is on the start-up path. The shell calls it once the window is open.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    lock(app).current = app.package_info().version.to_string();
    let app = app.clone();
    let ready = Instant::now();
    let started = std::thread::Builder::new()
        .name("halonic-updates".to_owned())
        .spawn(move || {
            load(&app);
            prove_started(&app);
            background(&app, ready);
        });
    if let Err(error) = started {
        eprintln!("updates: the checks can't start: {error}");
    }
}

fn load<R: Runtime>(app: &AppHandle<R>) {
    let file = match crate::profile::cli_profile(app) {
        Ok(profile) => Some(
            Path::new(&profile.root)
                .join("updates")
                .join("updater.json"),
        ),
        Err(error) => {
            eprintln!("updates: no profile folder, so nothing is remembered: {error}");
            None
        }
    };
    let (record, writable) = read_file(file.as_deref());
    let mut inner = lock(app);
    inner.file = file;
    inner.record = record;
    inner.writable = writable;
    if let Some(current) = Version::parse(&inner.current.clone()) {
        let mut after = inner.record.clone();
        let outcome = after.after_start(&current);
        // The install record stays until this version has proved it starts
        // (`prove_started`): a version that opens but whose host doesn't
        // answer must still count as not installed once the way back runs.
        if !matches!(outcome, StartOutcome::Updated(_)) {
            inner.record = after;
        }
        match outcome {
            StartOutcome::Updated(updated) => inner.just_updated = Some(updated),
            StartOutcome::DidNotInstall {
                version,
                attempts,
                counted: true,
            } => eprintln!("updates: {version} didn't install ({attempts} tries)"),
            _ => {}
        }
        inner.state = Some(inner.record.starting_state(&current));
    }
    inner.save();
    inner.notify();
}

/// The record, and whether it may be written. A missing file gives the
/// defaults; one that can't be read or is a newer Halonic's is left alone.
fn read_file(file: Option<&Path>) -> (UpdaterRecord, bool) {
    let Some(file) = file else {
        return (UpdaterRecord::default(), false);
    };
    match std::fs::read_to_string(file) {
        Ok(text) => match read_record(&text) {
            RecordRead::Read(record) => (record, true),
            RecordRead::Newer => (UpdaterRecord::default(), false),
            RecordRead::Unreadable => (UpdaterRecord::default(), true),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (UpdaterRecord::default(), true)
        }
        Err(error) => {
            eprintln!("updates: {} can't be read: {error}", file.display());
            (UpdaterRecord::default(), false)
        }
    }
}

/// Writes `text` through a temporary file and a rename, so a crash leaves
/// the old record or the new one, never half of one.
fn write_over(file: &Path, text: &str) -> std::io::Result<()> {
    if let Some(folder) = file.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let temporary = file.with_extension("json.tmp");
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, file)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| {
            u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
        })
}

/// The automatic checks: the first one 10 s after the window is ready,
/// then whenever `check_due` says so.
fn background<R: Runtime>(app: &AppHandle<R>, ready: Instant) {
    std::thread::sleep(FIRST_CHECK_AFTER);
    loop {
        let due = {
            let inner = lock(app);
            check_due(
                inner.record.automatic,
                ready.elapsed(),
                inner.checked_this_run,
                inner.record.last_attempt,
                now(),
            )
        };
        if due {
            tauri::async_runtime::block_on(check(app));
        }
        std::thread::sleep(TICK);
    }
}

/// One check, with its 15-second limit and no retry. With automatic updates
/// on, an update it finds downloads at once, also after Check now (flow 4.3).
async fn check<R: Runtime>(app: &AppHandle<R>) {
    {
        let mut inner = lock(app);
        if inner.checking {
            return;
        }
        inner.checking = true;
        inner.checked_this_run = true;
        inner.record.last_attempt = Some(now());
        inner.save();
        inner.notify();
    }
    let result = match app.updater_builder().timeout(CHECK_TIME_LIMIT).build() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let mut inner = lock(app);
    inner.checking = false;
    match result {
        Ok(None) => {
            inner.record.last_checked = Some(now());
            inner.record.last_result = Some(CheckResult::UpToDate);
            inner.found = None;
            if !inner.busy() {
                inner.state = Some(UpdateState::UpToDate);
            }
        }
        Ok(Some(update)) => {
            let version = update.version.clone();
            inner.record.last_checked = Some(now());
            inner.record.last_result = Some(CheckResult::Available {
                version: version.clone(),
            });
            inner.found = Some(update);
            if !inner.busy() {
                inner.state = Some(available(&mut inner.record, version));
            }
        }
        Err(error) => {
            eprintln!("updates: the check failed: {error}");
            let reason = check_failure(&error);
            inner.record.last_result = Some(CheckResult::CantCheck { reason });
            if !inner.busy() {
                inner.state = Some(UpdateState::CantCheck { reason });
            }
        }
    }
    inner.save();
    inner.notify();
    let automatic = inner.record.automatic;
    drop(inner);
    if automatic {
        start_download(app);
    }
}

/// The state for a version the check found: available, unless its
/// signature failed too often.
fn available(record: &mut UpdaterRecord, version: String) -> UpdateState {
    let refused = Version::parse(&version).is_some_and(|parsed| !record.may_download(&parsed));
    match record.bad_signature.as_ref().filter(|_| refused) {
        Some(bad) => UpdateState::SignatureMismatch {
            attempts: bad.count,
            version,
        },
        None => UpdateState::Available {
            notes_url: notes_url(&version),
            version,
        },
    }
}

/// Why a check got no usable answer, by the updater's error type, never by
/// its message.
fn check_failure(error: &UpdaterError) -> CheckFailure {
    match error {
        UpdaterError::Reqwest(error) if error.is_connect() => CheckFailure::Offline,
        UpdaterError::Reqwest(error) if error.is_decode() || error.is_body() => {
            CheckFailure::Unreadable
        }
        UpdaterError::Serialization(_)
        | UpdaterError::Semver(_)
        | UpdaterError::TargetNotFound(_)
        | UpdaterError::TargetsNotFound(_) => CheckFailure::Unreadable,
        _ => CheckFailure::NoAnswer,
    }
}

/// Runs the ready installer: the record first, then the host stopped, then
/// the installer, which ends Halonic on Windows. `relaunch` reopens Halonic
/// afterwards. Answers why it couldn't, for the log.
fn install<R: Runtime>(app: &AppHandle<R>, relaunch: bool) -> Result<(), String> {
    let (update, bytes) = {
        let mut inner = lock(app);
        let Some((update, bytes)) = inner.ready.take() else {
            return Err("no update is ready".to_owned());
        };
        let current = inner.current.clone();
        inner.record.before_install(&update.version, &current);
        inner.save();
        log_way_back(&inner, &update.version);
        (update, bytes)
    };
    let mut builder = app.updater_builder();
    if relaunch {
        builder = builder.installer_arg(RELAUNCH);
    }
    let host_app = app.clone();
    let update = builder
        .on_before_exit(move || crate::agent_host::stop_host(&host_app))
        .build()
        .and_then(|updater| updater.restore_update(update.raw_json.clone()))
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "the update is no longer newer".to_owned())?;
    update.install(bytes).map_err(|error| error.to_string())
}

/// Installs a ready update when Halonic quits, without reopening it.
pub fn install_at_quit<R: Runtime>(app: &AppHandle<R>) {
    if lock(app).ready.is_none() {
        return;
    }
    if let Err(error) = install(app, false) {
        eprintln!("updates: the update didn't install at quit: {error}");
    }
}

/// Forgets the pages of `page` following the status, when it reloads or closes.
pub fn end_page_watches<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(updates) = app.try_state::<Updates>() {
        let mut inner = updates
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.watchers.retain(|(label, _)| label != page);
    }
}

/// The status, for About Halonic.
#[tauri::command]
pub fn update_status<R: Runtime>(app: AppHandle<R>) -> UpdateStatus {
    lock(&app).status()
}

/// Sends the status now and each time it changes, until the page reloads
/// or closes. A download reports at most twice a second.
#[tauri::command]
pub fn update_watch<R: Runtime>(webview: Webview<R>, on_status: Channel<UpdateStatus>) {
    let mut inner = lock(webview.app_handle());
    if on_status.send(inner.status()).is_ok() {
        inner.watchers.push((webview.label().to_owned(), on_status));
    }
}

/// "Check now": checks whatever the switch says, and answers when it ends.
#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>) -> UpdateStatus {
    check(&app).await;
    lock(&app).status()
}

/// "Download Halonic 0.1.1" and "Try again": downloads what the last check found.
#[tauri::command]
pub fn update_download<R: Runtime>(app: AppHandle<R>) -> UpdateStatus {
    start_download(&app);
    lock(&app).status()
}

/// "Cancel download": stops it and keeps nothing.
#[tauri::command]
pub fn update_cancel<R: Runtime>(app: AppHandle<R>) -> UpdateStatus {
    let mut inner = lock(&app);
    if let Some(task) = inner.download.take() {
        task.abort();
        let version = inner.found.as_ref().map(|found| found.version.clone());
        if let Some(version) = version {
            inner.state = Some(available(&mut inner.record, version));
        }
        inner.notify();
    }
    inner.status()
}

/// "Restart to update": installs the ready update and reopens Halonic. The
/// page asks about running runs first (flow 4.5); this doesn't ask. On
/// Windows the installer ends Halonic and reopens it; elsewhere the shell
/// restarts itself.
#[tauri::command]
pub fn update_restart<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    install(&app, true).inspect_err(|error| {
        eprintln!("updates: restart to update failed: {error}");
    })?;
    app.restart()
}

/// The "Update Halonic automatically" switch. Off: no update request at all
/// until the person presses Check now.
#[tauri::command]
pub fn update_set_automatic<R: Runtime>(app: AppHandle<R>, on: bool) -> UpdateStatus {
    let mut inner = lock(&app);
    inner.record.automatic = on;
    inner.save();
    inner.notify();
    inner.status()
}
