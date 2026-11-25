//! Tests for `studio.src-tauri.engine-lifetime`. Each name starts with
//! `engine_lifetime_` until the trace check reads `cargo test`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{AfterCrash, EngineTable, EnginesSummary, PauseSet};

fn acme() -> PathBuf {
    PathBuf::from("acme")
}

fn windows(labels: &[&str]) -> HashSet<String> {
    labels.iter().map(|label| (*label).to_owned()).collect()
}

#[test]
fn engine_lifetime_one_engine_serves_every_window_of_a_workspace() {
    let mut table = EngineTable::default();
    table
        .started(acme(), "acme".into(), "first launch", Some("main"))
        .unwrap();

    assert_eq!(table.serve(&acme(), "code"), Some(&"first launch"));
    assert_eq!(table.serve(Path::new("other"), "main"), None);
    let (_, next) = table.crashed(&acme(), 1, Instant::now());
    assert_eq!(
        next,
        AfterCrash::Restart {
            location: "acme".into(),
            windows: windows(&["main", "code"]),
        }
    );
}

#[test]
fn engine_lifetime_restarts_three_times_then_stays_down() {
    let mut table = EngineTable::default();
    let start = Instant::now();
    let mut launch = table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();
    for minute in 0..3 {
        let now = start + Duration::from_secs(60 * minute);
        let (crashed, next) = table.crashed(&acme(), launch, now);
        assert_eq!(crashed, Some(launch));
        assert!(matches!(next, AfterCrash::Restart { .. }));
        launch = table.restarted(&acme(), launch + 1).unwrap().0;
    }

    let (_, next) = table.crashed(&acme(), launch, start + Duration::from_secs(4 * 60));

    assert_eq!(
        next,
        AfterCrash::Problem {
            windows: windows(&["main"])
        }
    );
    assert_eq!(
        table.serve(&acme(), "main"),
        None,
        "nothing runs in the problem state"
    );
    table
        .started(acme(), "acme".into(), 9, Some("main"))
        .unwrap();
    let (_, again) = table.crashed(&acme(), 5, start + Duration::from_secs(4 * 60));
    assert!(
        matches!(again, AfterCrash::Restart { .. }),
        "opening it again gives a new limit"
    );
}

#[test]
fn engine_lifetime_ignores_word_about_an_old_or_stopped_launch() {
    let mut table = EngineTable::default();
    let first = table
        .started(acme(), "acme".into(), "first", Some("main"))
        .unwrap();
    let _first_crash = table.crashed(&acme(), first, Instant::now());
    let (second, _) = table.restarted(&acme(), "second").unwrap();

    assert_eq!(
        table.crashed(&acme(), first, Instant::now()),
        (None, AfterCrash::Stale)
    );
    assert_eq!(table.take_all(), vec![("second", windows(&["main"]))]);
    assert_eq!(
        table.crashed(&acme(), second, Instant::now()),
        (None, AfterCrash::Stale)
    );
    assert_eq!(
        table.restarted(&acme(), "third"),
        Err("third"),
        "Quit came first"
    );
}

#[test]
fn engine_lifetime_closed_window_leaves_the_engine_running() {
    let mut table = EngineTable::default();
    table
        .started(acme(), "acme".into(), "engine", Some("main"))
        .unwrap();

    table.close_window("main");

    assert_eq!(table.engines().collect::<Vec<_>>(), vec![&"engine"]);
    assert_eq!(table.take_all(), vec![("engine", HashSet::new())]);
}

#[test]
fn engine_lifetime_an_engine_that_finishes_starting_after_quit_is_given_back() {
    let mut table = EngineTable::default();
    table
        .started(acme(), "acme".into(), "running", Some("main"))
        .unwrap();

    let stopped = table.take_all();

    assert_eq!(stopped, vec![("running", windows(&["main"]))]);
    assert_eq!(
        table.started(PathBuf::from("other"), "other".into(), "late", Some("code")),
        Err("late"),
        "Quit closed the table while it started"
    );
    assert_eq!(table.engines().count(), 0);
}

#[test]
fn engine_lifetime_a_fresh_workspace_is_not_paused() {
    let table = EngineTable::<()>::default();
    assert!(!table.pause(&acme()).is_paused());
}

/// HAL-17185: the pause the user set reaches every launch's handshake: a
/// restart after a crash, and a window opening the workspace again after
/// the problem state, both get it from the table.
#[test]
fn engine_lifetime_the_pause_stays_through_crashes_and_restarts() {
    let mut table = EngineTable::default();
    let start = Instant::now();
    let launch = table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();
    assert_eq!(
        table.set_pause(&acme(), true),
        PauseSet::Sent(&1),
        "the running engine hears it"
    );

    let mut launch = launch;
    for minute in 0..3 {
        let now = start + Duration::from_secs(60 * minute);
        let (_, next) = table.crashed(&acme(), launch, now);
        assert!(matches!(next, AfterCrash::Restart { .. }));
        assert!(
            table.pause(&acme()).is_paused(),
            "kept between a crash and its restart"
        );
        launch = table.restarted(&acme(), launch + 1).unwrap().0;
        assert!(
            table.pause(&acme()).is_paused(),
            "the restart's handshake gets it"
        );
    }
    let (_, next) = table.crashed(&acme(), launch, start + Duration::from_secs(3 * 60));
    assert!(matches!(next, AfterCrash::Problem { .. }));
    table
        .started(acme(), "acme".into(), 9, Some("code"))
        .unwrap();
    assert!(
        table.pause(&acme()).is_paused(),
        "opening it again keeps it"
    );

    assert_eq!(table.set_pause(&acme(), false), PauseSet::Sent(&9));
    assert!(!table.pause(&acme()).is_paused());
}

/// HAL-18433: a caller can tell a dropped pause (no launch yet) from a kept
/// one (crashed, restart pending).
#[test]
fn engine_lifetime_pausing_with_no_engine_running() {
    let mut table = EngineTable::default();
    assert_eq!(
        table.set_pause(&acme(), true),
        PauseSet::NoWorkspace,
        "no launch yet"
    );
    assert!(!table.pause(&acme()).is_paused(), "nothing to keep it on");

    let launch = table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();
    let _ = table.crashed(&acme(), launch, Instant::now());
    assert_eq!(
        table.set_pause(&acme(), true),
        PauseSet::Kept,
        "between a crash and its restart"
    );
    table.restarted(&acme(), 2).unwrap();
    assert!(
        table.pause(&acme()).is_paused(),
        "the restart's handshake gets it"
    );
}

/// Crashes the engine of `acme` until it is in the problem state.
fn into_problem(table: &mut EngineTable<u32>, start: Instant) {
    let mut launch = table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();
    for minute in 0..4 {
        let now = start + Duration::from_secs(60 * minute);
        let (_, next) = table.crashed(&acme(), launch, now);
        if matches!(next, AfterCrash::Problem { .. }) {
            return;
        }
        launch = table.restarted(&acme(), 1).unwrap().0;
    }
    panic!("no problem state after 4 crashes");
}

/// `studio.src-tauri.tray`: what the tray shows of every engine together.
#[test]
fn tray_summary_adds_runs_and_shows_a_problem() {
    let mut table = EngineTable::default();
    table
        .started(PathBuf::from("other"), "other".into(), 2, Some("code"))
        .unwrap();
    assert_eq!(
        table.summary(|runs| *runs),
        EnginesSummary {
            active_runs: 2,
            paused: false,
            problem: false,
        }
    );

    into_problem(&mut table, Instant::now());

    let summary = table.summary(|runs| *runs);
    assert!(summary.problem);
    assert_eq!(summary.active_runs, 2, "only the running engine counts");
    assert_eq!(
        EngineTable::<u32>::default().summary(|runs| *runs),
        EnginesSummary::default()
    );
}

/// `studio.src-tauri.tray`: Try again gives back the stopped workspaces
/// with a fresh restart limit, once.
#[test]
fn tray_try_again_starts_the_problem_workspaces_again() {
    let mut table = EngineTable::default();
    let start = Instant::now();
    into_problem(&mut table, start);

    assert_eq!(table.try_again(), vec![(acme(), "acme".to_owned())]);
    assert!(
        table.try_again().is_empty(),
        "no longer in the problem state"
    );
    assert!(!table.summary(|runs| *runs).problem);
    let (launch, windows_to_connect) = table.restarted(&acme(), 7).unwrap();
    assert_eq!(windows_to_connect, windows(&["main"]));
    let (_, next) = table.crashed(&acme(), launch, start + Duration::from_secs(5 * 60));
    assert!(matches!(next, AfterCrash::Restart { .. }), "a fresh limit");
}

/// `studio.src-tauri.tray`: Pause routines covers every workspace, and the
/// ones opened after it, until the user resumes.
#[test]
fn tray_pause_routines_covers_every_workspace_and_later_ones() {
    let mut table = EngineTable::default();
    table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();

    let (pause, engines) = table.set_pause_all(true);
    assert!(pause.is_paused());
    assert_eq!(engines, vec![&1]);
    assert!(table.summary(|runs| *runs).paused);
    table
        .started(PathBuf::from("other"), "other".into(), 2, Some("code"))
        .unwrap();
    assert!(
        table.pause(Path::new("other")).is_paused(),
        "opened after it"
    );

    let (resumed, _) = table.set_pause_all(false);
    assert!(!resumed.is_paused());
    assert!(!table.pause(&acme()).is_paused());
}

/// `studio.src-tauri.tray`: a restart that doesn't start leaves the
/// workspace in the problem state, so the tray offers Try again.
#[test]
fn tray_a_failed_restart_is_a_problem() {
    let mut table = EngineTable::default();
    let launch = table
        .started(acme(), "acme".into(), 1, Some("main"))
        .unwrap();
    let _crash = table.crashed(&acme(), launch, Instant::now());

    table.failed_to_restart(&acme());

    assert!(table.summary(|runs| *runs).problem);
    assert_eq!(table.try_again(), vec![(acme(), "acme".to_owned())]);
}

/// `studio.src-tauri.background-start`: a start at login serves no window,
/// and Quit lists every workspace once, the problem ones too, then nothing.
#[test]
fn background_start_records_every_open_workspace_once() {
    let mut table = EngineTable::default();
    into_problem(&mut table, Instant::now());
    table
        .started(PathBuf::from("other"), "other".into(), 2, None)
        .unwrap();
    assert_eq!(
        table.open_at_quit(9),
        Some(vec!["acme".to_owned(), "other".to_owned()])
    );
    let taken = table.take_all();
    assert_eq!(taken, vec![(2, HashSet::new())]);
    assert_eq!(table.open_at_quit(9), None);
}

/// `studio.src-tauri.background-start`: a Quit while the start at login is
/// still starting engines records the workspaces waiting to start too, but
/// not one it skipped or failed to start.
#[test]
fn background_start_quit_during_start_records_the_waiting_workspaces() {
    let mut table = EngineTable::default();
    table.waiting_to_start(&["acme".to_owned(), "gone".to_owned(), "notes".to_owned()]);
    table.started(acme(), "acme".into(), 1, None).unwrap();
    table.not_waiting("gone");
    assert_eq!(
        table.open_at_quit(9),
        Some(vec!["acme".to_owned(), "notes".to_owned()])
    );
}

/// `studio.src-tauri.background-start`: over the cap, Quit keeps the
/// newest workspaces, the ones still waiting to start counting as oldest,
/// then sorts them.
#[test]
fn background_start_the_cap_keeps_the_newest() {
    let mut table = EngineTable::default();
    table.waiting_to_start(&["0-waiting".to_owned()]);
    for (engine, name) in ["c", "b", "a"].into_iter().enumerate() {
        table
            .started(PathBuf::from(name), name.into(), engine, None)
            .unwrap();
    }
    assert_eq!(
        table.open_at_quit(2),
        Some(vec!["a".to_owned(), "b".to_owned()])
    );
}
