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
//! has the second.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Instant;

use halonic_agent_host::{Handshake, engine_command::engine_command, executable_beside};
use halonic_engine_pipe::SandboxHost;
use halonic_engine_supervisor::{EngineProcess, LinkEnd, LinkWatcher, STOP_KILL_AFTER, Stopped};
use halonic_secret_broker::{SecretBroker, TrustRecord};
use halonic_trust_store::FileTrustStore;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Webview};

use crate::engine::EngineState;
use crate::engine_table::{AfterCrash, EngineTable};
use crate::git::GitState;
use crate::profile::cli_profile;
use crate::secrets::SecretsState;

/// The shell's engines. `starting` is held while one starts, so two
/// windows opening one workspace don't start two engines.
#[derive(Default)]
pub struct EnginesState {
    table: Mutex<EngineTable<EngineProcess>>,
    starting: Mutex<()>,
}

/// Why `engine_open` didn't connect the window: `folder_not_open`,
/// `profile_setting`, `engine_failed` or `io`, and a message for the log.
/// The page then runs its workspace's engine itself, as before.
#[derive(Debug, Serialize)]
pub struct EngineOpenRefusal {
    kind: &'static str,
    message: String,
}

fn refusal(kind: &'static str, message: impl std::fmt::Display) -> EngineOpenRefusal {
    EngineOpenRefusal {
        kind,
        message: message.to_string(),
    }
}

/// Connects the window to the engine of `workspace`, a folder it opened,
/// starting the engine first when none runs. Answers once the engine's
/// handshake is in, or with a refusal.
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
        .map_err(|_| refusal("folder_not_open", "the window hasn't opened that folder"))?;
    let state = app.state::<EnginesState>();
    let _starting = lock(&state.starting);
    let running = lock(&state.table)
        .serve(&workspace, window)
        .map(|engine| engine.link().handshake().clone());
    let handshake = match running {
        Some(handshake) => handshake,
        None => {
            let launch_number = next_launch(&state, &workspace);
            let engine = start(app, &workspace, location, launch_number)?;
            let handshake = engine.link().handshake().clone();
            lock(&state.table).started(workspace, location.to_owned(), engine, window);
            handshake
        }
    };
    connect(app, window, handshake)
}

/// The number the next launch of `workspace` gets in the table, so its
/// watcher can name it.
fn next_launch(state: &EnginesState, workspace: &Path) -> u64 {
    lock(&state.table).launch(workspace) + 1
}

/// Starts the engine of `workspace` and tells it what it needs after the
/// handshake. Blocks until the handshake, up to a minute.
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
    // the window's trust dialog writes it.
    let trust = TrustRecord::new(
        FileTrustStore::new(PathBuf::from(profile.trust_folder())),
        location.to_owned(),
    );
    let broker = SecretBroker::new(app.state::<SecretsState>().host_keychain(), Arc::new(trust));
    let watcher = Arc::new(Watcher {
        app: app.clone(),
        workspace: workspace.to_owned(),
        launch,
    });
    let engine = EngineProcess::start(command, broker, watcher)
        .map_err(|error| refusal("engine_failed", error))?;
    let link = engine.link();
    let host = crate::agent_host::current_host(app);
    let pause = lock(&app.state::<EnginesState>().table).pause(workspace);
    // Failing to queue either means the link already ended; its watcher
    // takes it from there.
    let _ended = link.send_sandbox_host(host.as_ref().map(sandbox_host));
    let _ended = link.send_routine_pause(pause);
    Ok(engine)
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
    let _starting = lock(&state.starting);
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
            return;
        }
    };
    let handshake = engine.link().handshake().clone();
    let restarted = lock(&state.table).restarted(workspace, engine);
    match restarted {
        Ok((_, windows)) => {
            for window in windows {
                if connect(app, &window, handshake.clone()).is_err() {
                    halonic_shell_log::record("engine", "a window couldn't be reconnected");
                }
            }
        }
        // Quit came while it started.
        Err(engine) => {
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

/// Tells every engine where the sandbox host is now, or that none runs.
pub fn sandbox_host_changed<R: Runtime>(app: &AppHandle<R>, host: Option<&Handshake>) {
    if let Some(state) = app.try_state::<EnginesState>() {
        for engine in lock(&state.table).engines() {
            let _ended = engine.link().send_sandbox_host(host.map(sandbox_host));
        }
    }
}

/// Quit, or an update's restart: stops every engine at once, each with its
/// 15 seconds, and waits for them all.
pub fn stop_all<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<EnginesState>() else {
        return;
    };
    let engines = lock(&state.table).take_all();
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

/// The table and the start lock stay whole if a holder panicked.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
