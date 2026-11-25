//! Tests for `studio.src-tauri.engine-lifetime`. Each name starts with
//! `engine_lifetime_` until the trace check reads `cargo test`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{AfterCrash, EngineTable};

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
        .started(acme(), "acme".into(), "first launch", "main")
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
    let mut launch = table.started(acme(), "acme".into(), 1, "main").unwrap();
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
    table.started(acme(), "acme".into(), 9, "main").unwrap();
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
        .started(acme(), "acme".into(), "first", "main")
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
        .started(acme(), "acme".into(), "engine", "main")
        .unwrap();

    table.close_window("main");

    assert_eq!(table.engines().collect::<Vec<_>>(), vec![&"engine"]);
    assert_eq!(table.take_all(), vec![("engine", HashSet::new())]);
}

#[test]
fn engine_lifetime_an_engine_that_finishes_starting_after_quit_is_given_back() {
    let mut table = EngineTable::default();
    table
        .started(acme(), "acme".into(), "running", "main")
        .unwrap();

    let stopped = table.take_all();

    assert_eq!(stopped, vec![("running", windows(&["main"]))]);
    assert_eq!(
        table.started(PathBuf::from("other"), "other".into(), "late", "code"),
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
    let launch = table.started(acme(), "acme".into(), 1, "main").unwrap();
    assert_eq!(
        table.set_pause(&acme(), true),
        Some(&1),
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
    table.started(acme(), "acme".into(), 9, "code").unwrap();
    assert!(
        table.pause(&acme()).is_paused(),
        "opening it again keeps it"
    );

    assert_eq!(table.set_pause(&acme(), false), Some(&9));
    assert!(!table.pause(&acme()).is_paused());
}

#[test]
fn engine_lifetime_pausing_with_no_engine_running() {
    let mut table = EngineTable::default();
    assert_eq!(table.set_pause(&acme(), true), None, "no launch yet");
    assert!(!table.pause(&acme()).is_paused(), "nothing to keep it on");

    let launch = table.started(acme(), "acme".into(), 1, "main").unwrap();
    let _ = table.crashed(&acme(), launch, Instant::now());
    assert_eq!(
        table.set_pause(&acme(), true),
        None,
        "between a crash and its restart"
    );
    table.restarted(&acme(), 2).unwrap();
    assert!(
        table.pause(&acme()).is_paused(),
        "the restart's handshake gets it"
    );
}
