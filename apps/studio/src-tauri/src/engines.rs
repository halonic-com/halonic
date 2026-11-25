//! The shell runs one background engine per workspace (B1 step 5, design
//! note D7 and D10): `halonic-agent-host --engine`, beside the shell, never
//! in WSL. A window asks for its workspace's engine with `engine_open` before
//! the page looks for it, so the page never starts an engine of its own
//! while the shell's is still starting. The engine keeps running when the
//! window closes; Quit and an update's restart stop them all.
//!
//! A crashed engine starts again at most 3 times in 5 minutes; after that
//! the workspace is in the problem state until a window opens it again.
//! After every handshake the shell sends the sandbox host's connection and
//! the user's Pause routines: the engine starts no routine run before it
//! has the second. It sends them as the engine joins the table, under the
//! table's lock, so a sandbox host that starts meanwhile can't be missed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Instant;

use halonic_agent_host::{Handshake, engine_command::engine_command, executable_beside};
use halonic_engine_pipe::SandboxHost;
use halonic_engine_supervisor::{EngineProcess, LinkEnd, LinkWatcher, STOP_KILL_AFTER, Stopped};
use halonic_secret_broker::{SecretBroker, TrustRecord};
use halonic_trust_grant::MAX_PICKED_FOLDERS;
use halonic_trust_store::FileTrustStore;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::engine::EngineState;
use crate::engine_table::{AfterCrash, EngineTable, EnginesSummary};
use crate::git::GitState;
use crate::profile::cli_profile;
use crate::secrets::SecretsState;

/// The shell's engines. A workspace's lock in `starting` is held while its
/// engine starts, so two windows opening one workspace don't start two
/// engines, and a slow start holds up no other workspace.
#[derive(Default)]
pub struct EnginesState {
    table: Mutex<EngineTable<EngineProcess>>,
    starting: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

/// Why `engine_open` didn't connect the window: `folder_not_open`,
/// `profile_setting`, `engine_failed` (also when Halonic is quitting) or
/// `io`, and a message for the log. The page then runs its workspace's
/// engine itself, as before.
#[derive(Debug, Serialize)]
pub struct EngineOpenRefusal {
    kind: &'static str,
    message: String,
}

impl std::fmt::Display for EngineOpenRefusal {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.kind, self.message)
    }
}

fn refusal(kind: &'static str, message: impl std::fmt::Display) -> EngineOpenRefusal {
    EngineOpenRefusal {
        kind,
        message: message.to_string(),
    }
}

/// Connects the window to the engine of `workspace`, which must be a folder
/// the shell has opened (by any window) or a folder inside one, starting
/// the engine first when none runs. Answers once the engine's handshake is
/// in, or with a refusal.
///
/// One engine serves each real folder. A second window that opens the same
/// folder through another location (a link, another spelling) joins the
/// running engine, whose broker keeps checking the trust record of the
/// location the first window gave.
#[tauri::command]
pub async fn engine_open<R: Runtime>(
    webview: Webview<R>,
    workspace: String,
) -> Result<(), EngineOpenRefusal> {
    let app = webview.app_handle().clone();
    let window = webview.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || open(&app, &window, &workspace))
        .await
        .map_err(|error| refusal("io", error))?
}

fn open<R: Runtime>(
    app: &AppHandle<R>,
    window: &str,
    location: &str,
) -> Result<(), EngineOpenRefusal> {
    let workspace = app
        .state::<GitState>()
        .folders()
        .check(Path::new(location))
        .map_err(|_| refusal("folder_not_open", "the shell hasn't opened that folder"))?;
    let handshake = running_engine(app, &workspace, location, Some(window))?;
    connect(app, window, handshake)
}

/// A start at login (`background_start.rs`): starts the engine of
/// `workspace`, a folder the shell has opened, for `location`, with no
/// window, unless one runs already.
pub fn start_in_background<R: Runtime>(
    app: &AppHandle<R>,
    workspace: &Path,
    location: &str,
) -> Result<(), EngineOpenRefusal> {
    let started = running_engine(app, workspace, location, None).map(|_| ());
    // Started, running already or failed, it waits no more: a running
    // engine is in the table, and a failed one isn't open.
    not_waiting(app, location);
    started
}

/// A start at login is about to start the engines of `locations`: until
/// each has started or been given up, Quit records it as open.
pub fn waiting_to_start<R: Runtime>(app: &AppHandle<R>, locations: &[String]) {
    if let Some(state) = app.try_state::<EnginesState>() {
        lock(&state.table).waiting_to_start(locations);
    }
}

/// The start at login gave up `location`, or it started.
pub fn not_waiting<R: Runtime>(app: &AppHandle<R>, location: &str) {
    if let Some(state) = app.try_state::<EnginesState>() {
        lock(&state.table).not_waiting(location);
    }
}

/// The handshake of the engine of `workspace`, which now also serves
/// `window`, starting the engine first when none runs.
fn running_engine<R: Runtime>(
    app: &AppHandle<R>,
    workspace: &Path,
    location: &str,
    window: Option<&str>,
) -> Result<Handshake, EngineOpenRefusal> {
    let state = app.state::<EnginesState>();
    let start_lock = start_lock(&state, workspace);
    let _starting = lock(&start_lock);
    let running = {
        let mut table = lock(&state.table);
        let engine = match window {
            Some(window) => table.serve(workspace, window),
            None => table.engine(workspace),
        };
        engine.map(|engine| engine.link().handshake().clone())
    };
    if let Some(handshake) = running {
        return Ok(handshake);
    }
    let launch_number = next_launch(&state, workspace);
    let engine = start(app, workspace, location, launch_number)?;
    let handshake = engine.link().handshake().clone();
    join(&state, workspace.to_owned(), location, engine, window)?;
    // It may have left the problem state.
    crate::tray::refresh(app);
    Ok(handshake)
}

/// The start lock of `workspace`. Kept for the shell's life: one small
/// entry per workspace opened.
fn start_lock(state: &EnginesState, workspace: &Path) -> Arc<Mutex<()>> {
    let mut locks = lock(&state.starting);
    Arc::clone(locks.entry(workspace.to_owned()).or_default())
}

/// Puts a started engine in the table and tells it what it needs, or stops
/// it when Quit or an update's restart closed the table meanwhile.
fn join(
    state: &EnginesState,
    workspace: PathBuf,
    location: &str,
    engine: EngineProcess,
    window: Option<&str>,
) -> Result<(), EngineOpenRefusal> {
    let mut table = lock(&state.table);
    let joined = table.started(workspace.clone(), location.to_owned(), engine, window);
    match joined {
        Ok(_) => {
            after_handshake(&table, &workspace);
            Ok(())
        }
        Err(engine) => {
            drop(table);
            let _stopped = engine.stop(STOP_KILL_AFTER);
            Err(refusal("engine_failed", "Halonic is quitting"))
        }
    }
}

/// Sends the engine of `workspace` the sandbox host and its Pause routines.
/// Called with the table locked, so the host it sends is the latest.
fn after_handshake(table: &EngineTable<EngineProcess>, workspace: &Path) {
    let Some(engine) = table.engine(workspace) else {
        return;
    };
    let host = table.host().map(sandbox_host);
    // Failing to queue means the link already ended; its watcher takes it
    // from there.
    let _ended = engine
        .link()
        .send_after_handshake(host, table.pause(workspace));
}

/// The number the next launch of `workspace` gets in the table, so its
/// watcher can name it.
fn next_launch(state: &EnginesState, workspace: &Path) -> u64 {
    lock(&state.table).launch(workspace) + 1
}

/// Starts the engine of `workspace`. Blocks until the handshake, up to a
/// minute.
fn start<R: Runtime>(
    app: &AppHandle<R>,
    workspace: &Path,
    location: &str,
    launch: u64,
) -> Result<EngineProcess, EngineOpenRefusal> {
    let profile = cli_profile(app).map_err(|problem| refusal(problem.kind(), problem))?;
    let shell = std::env::current_exe().map_err(|error| refusal("io", error))?;
    let executable = executable_beside(&shell).map_err(|error| refusal("engine_failed", error))?;
    let command = engine_command(&executable, Path::new(&profile.root), workspace);
    // The broker answers only while this location has a trust record, as
    // the window's trust dialog writes it, and still leads to the folder the
    // engine runs in: a link pointed elsewhere later lends its trust to
    // nothing.
    let trust = TrustRecord::for_workspace(
        FileTrustStore::new(PathBuf::from(profile.trust_folder())),
        location.to_owned(),
        workspace.to_owned(),
    );
    let broker = SecretBroker::new(app.state::<SecretsState>().host_keychain(), Arc::new(trust));
    let watcher = Arc::new(Watcher {
        app: app.clone(),
        workspace: workspace.to_owned(),
        launch,
    });
    EngineProcess::start(command, broker, watcher).map_err(|error| refusal("engine_failed", error))
}

fn sandbox_host(handshake: &Handshake) -> SandboxHost<'_> {
    SandboxHost {
        url: handshake.url(),
        token: handshake.token(),
    }
}

fn connect<R: Runtime>(
    app: &AppHandle<R>,
    window: &str,
    handshake: Handshake,
) -> Result<(), EngineOpenRefusal> {
    app.state::<EngineState>()
        .connect(window, handshake)
        .map_err(|_| {
            refusal(
                "io",
                "the engine's state was left broken by an earlier failure",
            )
        })
}

fn disconnect<R: Runtime>(app: &AppHandle<R>, windows: impl IntoIterator<Item = String>) {
    let engine_state = app.state::<EngineState>();
    for window in windows {
        if engine_state.disconnect(&window).is_err() {
            halonic_shell_log::record("engine", "a window's engine couldn't be forgotten");
        }
    }
}

/// Hears how one launch's link ended. A crash is handled on a thread of its
/// own: a restart blocks until the new handshake.
struct Watcher<R: Runtime> {
    app: AppHandle<R>,
    workspace: PathBuf,
    launch: u64,
}

impl<R: Runtime> LinkWatcher for Watcher<R> {
    fn health_changed(&self) {
        crate::tray::refresh(&self.app);
    }

    fn ended(&self, end: LinkEnd) {
        if matches!(end, LinkEnd::Stopped { .. }) {
            return;
        }
        let (app, workspace, launch) = (self.app.clone(), self.workspace.clone(), self.launch);
        thread::spawn(move || crashed(&app, &workspace, launch));
    }
}

fn crashed<R: Runtime>(app: &AppHandle<R>, workspace: &Path, launch: u64) {
    let state = app.state::<EnginesState>();
    let start_lock = start_lock(&state, workspace);
    let _starting = lock(&start_lock);
    let (old, next) = lock(&state.table).crashed(workspace, launch, Instant::now());
    drop(old);
    match next {
        AfterCrash::Stale => {}
        AfterCrash::Problem { windows } => {
            halonic_shell_log::record(
                "engine",
                "it crashed 3 times in 5 minutes: not started again",
            );
            disconnect(app, windows);
        }
        AfterCrash::Restart { location, windows } => {
            disconnect(app, windows);
            halonic_shell_log::record("engine", "it ended unasked: starting it again");
            restart(app, &state, workspace, &location);
        }
    }
    crate::tray::refresh(app);
}

/// The tray's Try again: starts every engine in the problem state again,
/// with a fresh restart limit, and reconnects the windows it served.
pub fn try_again<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<EnginesState>();
    let stopped = lock(&state.table).try_again();
    for (workspace, location) in stopped {
        let start_lock = start_lock(&state, &workspace);
        let _starting = lock(&start_lock);
        restart(app, &state, &workspace, &location);
    }
    crate::tray::refresh(app);
}

/// The tray's Pause routines or Resume routines: every workspace's engine
/// hears it now, and every engine that starts later gets it after its
/// handshake.
pub fn pause_routines<R: Runtime>(app: &AppHandle<R>, paused: bool) {
    let state = app.state::<EnginesState>();
    let mut table = lock(&state.table);
    let (pause, engines) = table.set_pause_all(paused);
    for engine in engines {
        // Failing to queue means the link already ended; its watcher takes
        // it from there, and the next launch gets the pause.
        let _ended = engine.link().send_pause_routines(pause);
    }
    drop(table);
    crate::tray::refresh(app);
}

/// Every engine together, for the tray: runs in progress from each one's
/// latest health.
pub fn summary<R: Runtime>(app: &AppHandle<R>) -> EnginesSummary {
    let Some(state) = app.try_state::<EnginesState>() else {
        return EnginesSummary::default();
    };
    let table = lock(&state.table);
    table.summary(|engine| {
        engine
            .link()
            .health()
            .map_or(0, |health| health.active_runs)
    })
}

fn restart<R: Runtime>(app: &AppHandle<R>, state: &EnginesState, workspace: &Path, location: &str) {
    let launch = next_launch(state, workspace);
    let engine = match start(app, workspace, location, launch) {
        Ok(engine) => engine,
        Err(failure) => {
            halonic_shell_log::record(
                "engine",
                format_args!("it didn't start again: {}", failure.message),
            );
            // The tray says routines aren't running, and offers Try again.
            lock(&state.table).failed_to_restart(workspace);
            return;
        }
    };
    let handshake = engine.link().handshake().clone();
    let mut table = lock(&state.table);
    let restarted = table.restarted(workspace, engine);
    match restarted {
        Ok((_, windows)) => {
            after_handshake(&table, workspace);
            drop(table);
            for window in windows {
                if connect(app, &window, handshake.clone()).is_err() {
                    halonic_shell_log::record("engine", "a window couldn't be reconnected");
                }
            }
        }
        // Quit came while it started.
        Err(engine) => {
            drop(table);
            let _stopped = engine.stop(STOP_KILL_AFTER);
        }
    }
}

/// `window` closed. Its workspace's engine keeps running (design note D7).
pub fn window_closed<R: Runtime>(app: &AppHandle<R>, window: &str) {
    if let Some(state) = app.try_state::<EnginesState>() {
        lock(&state.table).close_window(window);
    }
    disconnect(app, [window.to_owned()]);
}

/// Notes where the sandbox host is now, or that none runs, for engines that
/// start later, and tells every running engine.
pub fn sandbox_host_changed<R: Runtime>(app: &AppHandle<R>, host: Option<&Handshake>) {
    let Some(state) = app.try_state::<EnginesState>() else {
        return;
    };
    let mut table = lock(&state.table);
    table.set_host(host.cloned());
    for engine in table.engines() {
        let _ended = engine.link().send_sandbox_host(host.map(sandbox_host));
    }
}

/// Quit, or an update's restart: records the workspaces open now for the
/// next start at login, then stops every engine at once, each with its
/// 15 seconds, and waits for them all. An engine still starting is stopped
/// as it finishes (the table is closed), and none starts after.
pub fn stop_all<R: Runtime>(app: &AppHandle<R>) {
    // Halonic is exiting: a redraw would wait on the main thread, which may
    // be the one stopping the engines.
    crate::tray::stop_redrawing(app);
    let Some(state) = app.try_state::<EnginesState>() else {
        return;
    };
    let mut table = lock(&state.table);
    let open = table.open_at_quit(MAX_PICKED_FOLDERS);
    let engines = table.take_all();
    drop(table);
    if let Some(locations) = open {
        crate::background_start::record_open_at_quit(app, &locations);
    }
    let stopping: Vec<_> = engines
        .into_iter()
        .map(|(engine, windows)| {
            disconnect(app, windows);
            thread::spawn(move || engine.stop(STOP_KILL_AFTER))
        })
        .collect();
    for stop in stopping {
        if !matches!(stop.join(), Ok(Stopped::Exited)) {
            halonic_shell_log::record("engine", "it didn't stop in time and was killed");
        }
    }
}

/// A start at login that exits without running: closes the table, so the
/// exit doesn't record an empty list over the last Quit's.
pub fn close_unrecorded<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<EnginesState>() {
        drop(lock(&state.table).take_all());
    }
}

/// The table and the start locks stay whole if a holder panicked.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
