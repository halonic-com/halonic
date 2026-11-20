//! Requirement `start-status`: the timer, the phases and one cause per way
//! a start fails, then the commands against stand-in hosts.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use halonic_agent_host::{AgentHostError, StartCause};
use serde_json::{Value, json};
use tauri::Manager;
use tauri::test::mock_app;

use super::{
    FailureCause, StartFailure, StartPhase, StartProgress, StartReport, StartState, engine_ready,
    start_status,
};
use crate::agent_host::AgentHostState;

/// Long enough for a script to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// What a stand-in host prints to its error output: a path, as a real
/// host's errors can hold.
const ERROR_OUTPUT: &str = "acme-private-folder/secret-project";

fn seconds(count: u64) -> Duration {
    Duration::from_secs(count)
}

/// A progress whose page loaded at `loaded`.
fn loaded_at(loaded: Instant) -> StartProgress {
    let progress = StartProgress::default();
    progress.page_loaded(loaded);
    progress
}

#[test]
fn start_status_says_still_starting_at_30_s_and_fails_at_60_s_after_the_page_loaded() {
    let loaded = Instant::now();
    let progress = loaded_at(loaded);
    progress.engine_ready(loaded + seconds(5));

    let report = progress.report(loaded + seconds(29));
    assert_eq!(report.state, StartState::Starting);
    assert_eq!(report.phase, StartPhase::EngineReady);
    assert_eq!(report.seconds, 29);
    assert_eq!(
        progress.report(loaded + seconds(30)).state,
        StartState::StillStarting
    );
    let report = progress.report(loaded + seconds(60));
    assert_eq!(report.state, StartState::Failed);
    assert_eq!(report.cause, Some(FailureCause::TimedOut));
    assert_eq!(report.exit_code, None);
}

#[test]
fn start_status_goes_through_the_phases_to_ready() {
    let loaded = Instant::now();
    let progress = loaded_at(loaded);
    assert_eq!(progress.report(loaded).phase, StartPhase::PageLoaded);
    progress.engine_ready(loaded);
    assert_eq!(progress.report(loaded).phase, StartPhase::EngineReady);
    progress.wsl_ready();
    assert_eq!(progress.report(loaded).phase, StartPhase::WslReady);
    progress.host_started();
    let report = progress.report(loaded + seconds(1));
    assert_eq!(report.state, StartState::Ready);
    assert_eq!(report.phase, StartPhase::HostStarted);
    assert_eq!(report.cause, None);
}

#[test]
fn start_status_is_ready_when_the_host_starts_after_the_page_gave_up() {
    let loaded = Instant::now();
    let progress = loaded_at(loaded);
    progress.engine_ready(loaded);
    assert_eq!(
        progress.report(loaded + seconds(61)).state,
        StartState::Failed
    );
    progress.host_started();
    assert_eq!(
        progress.report(loaded + seconds(62)).state,
        StartState::Ready
    );
}

#[test]
fn start_status_names_the_cause_of_each_failed_start() {
    let cases = [
        (
            AgentHostError::Start(StartCause::Missing, String::new()),
            FailureCause::Missing,
            None,
        ),
        (
            AgentHostError::Start(StartCause::Blocked, String::new()),
            FailureCause::Blocked,
            None,
        ),
        (
            AgentHostError::Start(StartCause::Other, String::new()),
            FailureCause::Other,
            None,
        ),
        (
            AgentHostError::Exited(Some(3)),
            FailureCause::Stopped,
            Some(3),
        ),
        (AgentHostError::Exited(None), FailureCause::Stopped, None),
        (
            AgentHostError::TimedOut(seconds(60)),
            FailureCause::TimedOut,
            None,
        ),
        (
            AgentHostError::Handshake(String::new()),
            FailureCause::Broken,
            None,
        ),
    ];
    for (error, cause, exit_code) in cases {
        let loaded = Instant::now();
        let progress = loaded_at(loaded);
        progress.engine_ready(loaded);
        progress.host_failed(StartFailure::from(&error));
        let report = progress.report(loaded + seconds(1));
        assert_eq!(report.state, StartState::Failed, "{error:?}");
        assert_eq!(report.cause, Some(cause), "{error:?}");
        assert_eq!(report.exit_code, exit_code, "{error:?}");
    }
}

#[test]
fn start_status_names_the_wsl_causes() {
    for cause in [
        FailureCause::WslMissing,
        FailureCause::DistroMissing,
        FailureCause::WslFailed,
    ] {
        let loaded = Instant::now();
        let progress = loaded_at(loaded);
        progress.engine_ready(loaded);
        progress.host_failed(StartFailure::of(cause));
        assert_eq!(progress.report(loaded).cause, Some(cause));
    }
}

#[test]
fn start_status_starts_the_timer_again_on_a_new_try_after_a_failure() {
    let loaded = Instant::now();
    let progress = loaded_at(loaded);
    progress.engine_ready(loaded);
    progress.host_failed(StartFailure::of(FailureCause::Missing));

    let retried = loaded + seconds(70);
    progress.engine_ready(retried);
    let report = progress.report(retried + seconds(1));
    assert_eq!(report.state, StartState::Starting);
    assert_eq!(report.cause, None);
    assert_eq!(report.seconds, 1);
}

#[test]
fn start_status_forgets_the_last_start_when_the_page_loads() {
    let loaded = Instant::now();
    let progress = loaded_at(loaded);
    progress.engine_ready(loaded);
    progress.host_failed(StartFailure::of(FailureCause::Blocked));

    let reloaded = loaded + seconds(10);
    progress.page_loaded(reloaded);
    let report = progress.report(reloaded);
    assert_eq!(report.state, StartState::Starting);
    assert_eq!(report.phase, StartPhase::PageLoaded);
    assert_eq!(report.seconds, 0);
}

/// What a stand-in host does.
enum StandIn {
    /// Prints a handshake, then waits until its input closes.
    Serves,
    /// Prints [`ERROR_OUTPUT`] to its error output and exits with code 3.
    FailsWithErrorOutput,
}

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

fn stand_in(what: &StandIn) -> Command {
    let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
    let name = format!("halonic-start-status-{}-{number}", std::process::id());
    write_script(std::env::temp_dir().join(name), what)
}

const HANDSHAKE: &str =
    r#"{"url":"http://127.0.0.1:49152","token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234"}"#;

/// Runs through `sh` rather than as a program of its own: executing a file
/// just written can fail with "text file busy" while another test thread
/// starts a process.
#[cfg(unix)]
fn write_script(base: PathBuf, what: &StandIn) -> Command {
    let body = match what {
        StandIn::Serves => format!("printf '%s\\n' '{HANDSHAKE}'\ncat > /dev/null"),
        StandIn::FailsWithErrorOutput => format!("printf '%s\\n' '{ERROR_OUTPUT}' >&2\nexit 3"),
    };
    let path = base.with_extension("sh");
    std::fs::write(&path, format!("{body}\n")).expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

#[cfg(windows)]
fn write_script(base: PathBuf, what: &StandIn) -> Command {
    // `findstr` reads its input until it closes.
    let body = match what {
        StandIn::Serves => format!("echo {HANDSHAKE}\r\nfindstr \"^\" >nul"),
        StandIn::FailsWithErrorOutput => format!("echo {ERROR_OUTPUT} 1>&2\r\nexit /b 3"),
    };
    let path = base.with_extension("cmd");
    std::fs::write(&path, format!("@echo off\r\n{body}\r\n")).expect("write the script");
    Command::new(path)
}

/// Calls `engine_ready` on a shell whose host is `what`, then polls
/// `start_status` until the start is ready or has failed.
fn start_with(what: StandIn) -> StartReport {
    let app = mock_app();
    app.manage(AgentHostState::with_command(move || stand_in(&what)));
    let handle = app.handle().clone();
    handle
        .state::<AgentHostState>()
        .progress
        .page_loaded(Instant::now());
    engine_ready(handle.clone());
    let deadline = Instant::now() + WAIT;
    loop {
        let report = start_status(handle.clone());
        if matches!(report.state, StartState::Ready | StartState::Failed) {
            return report;
        }
        assert!(Instant::now() < deadline, "the start ended: {report:?}");
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[test]
fn start_status_is_ready_once_the_page_says_its_engine_is_and_the_host_serves() {
    let report = start_with(StandIn::Serves);
    assert_eq!(
        serde_json::to_value(report).expect("serializes"),
        json!({
            "state": "ready",
            "phase": "host_started",
            "cause": null,
            "exitCode": null,
            "seconds": report.seconds,
        })
    );
}

#[test]
fn start_status_keeps_the_exit_code_and_holds_nothing_of_the_hosts_error_output() {
    let report = start_with(StandIn::FailsWithErrorOutput);
    let answer = serde_json::to_value(report).expect("serializes");
    assert_eq!(
        answer,
        json!({
            "state": "failed",
            "phase": "engine_ready",
            "cause": "stopped",
            "exitCode": 3,
            "seconds": report.seconds,
        })
    );
    let text = answer.to_string();
    assert!(!text.contains("acme"), "{text}");
    assert!(!text.contains("secret-project"), "{text}");
    let Value::Object(fields) = answer else {
        panic!("an object");
    };
    assert_eq!(fields.len(), 5);
}
