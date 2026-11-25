//! Tests for `studio.src-tauri.tray`. Each name starts with `tray_` until
//! the trace check reads `cargo test`. The texts are the board card's
//! (HAL-14213, "every state of the menu").

use super::*;

fn summary(active_runs: u32, paused: bool, problem: bool) -> EnginesSummary {
    EnginesSummary {
        active_runs,
        paused,
        problem,
    }
}

/// The menu's texts, with "-" for a separator and "(off)" after an item
/// that can't be clicked.
fn texts(view: &TrayView) -> Vec<String> {
    view.menu
        .iter()
        .map(|line| match line {
            MenuLine::Separator => "-".to_owned(),
            MenuLine::Item { text, enabled, .. } if !enabled => format!("{text} (off)"),
            MenuLine::Item { text, .. } => text.clone(),
        })
        .collect()
}

#[test]
fn tray_idle_and_running() {
    let idle = tray_view(summary(0, false, false), false);
    assert_eq!(idle.icon, IconState::Idle);
    assert_eq!(
        texts(&idle),
        [
            "Nothing running",
            "-",
            "Open Halonic",
            "Pause routines",
            "-",
            "Quit Halonic"
        ]
    );

    let one = tray_view(summary(1, false, false), false);
    assert_eq!(one.icon, IconState::Running);
    assert_eq!(texts(&one)[0], "1 run in progress");
    assert_eq!(
        texts(&tray_view(summary(2, false, false), false))[0],
        "2 runs in progress"
    );
}

#[test]
fn tray_paused_shows_the_bars_even_with_runs_going() {
    let paused = tray_view(summary(1, true, false), false);
    assert_eq!(paused.icon, IconState::Paused);
    assert_eq!(texts(&paused)[0], "Routines paused · 1 run in progress");
    assert_eq!(
        texts(&tray_view(summary(0, true, false), false))[0],
        "Routines paused"
    );
    assert_eq!(
        texts(&paused),
        [
            "Routines paused · 1 run in progress",
            "-",
            "Open Halonic",
            "Resume routines",
            "-",
            "Quit Halonic",
        ],
        "the card swaps Pause for Resume"
    );
}

#[test]
fn tray_problem_offers_try_again_and_comes_first() {
    let problem = tray_view(summary(2, true, true), false);
    assert_eq!(problem.icon, IconState::Problem);
    assert_eq!(
        texts(&problem),
        [
            "Routines aren't running",
            "The background engine stopped 3 times",
            "-",
            "Try again",
            "Open Halonic",
            "-",
            "Quit Halonic",
        ]
    );
    let ids: Vec<&str> = problem
        .menu
        .iter()
        .filter_map(|line| match line {
            MenuLine::Item { id, .. } => Some(id.as_str()),
            MenuLine::Separator => None,
        })
        .collect();
    assert_eq!(ids, ["status-0", "status-1", TRY_AGAIN, OPEN, QUIT]);
}

#[test]
fn tray_quitting_can_not_be_clicked() {
    let quitting = tray_view(summary(2, false, false), true);
    assert_eq!(quitting.icon, IconState::Running);
    assert_eq!(
        texts(&quitting),
        [
            "Quitting… 2 runs finishing their step (off)",
            "-",
            "Open Halonic (off)",
            "Pause routines (off)",
            "-",
            "Quit Halonic (off)",
        ]
    );
    assert_eq!(
        texts(&tray_view(summary(1, false, false), true))[0],
        "Quitting… 1 run finishing its step (off)"
    );
    assert_eq!(
        texts(&tray_view(summary(0, false, false), true))[0],
        "Quitting… (off)"
    );
}

#[test]
fn tray_icon_scheme_follows_the_desktop() {
    assert_eq!(IconScheme::for_desktop("windows", None), IconScheme::Colour);
    assert_eq!(IconScheme::for_desktop("macos", None), IconScheme::Template);
    assert_eq!(
        IconScheme::for_desktop("linux", Some("ubuntu:GNOME")),
        IconScheme::Symbolic
    );
    assert_eq!(
        IconScheme::for_desktop("linux", Some("KDE")),
        IconScheme::Colour
    );
    assert_eq!(IconScheme::for_desktop("linux", None), IconScheme::Colour);
}

#[test]
fn tray_closing_studio_hides_it_only_while_the_tray_shows() {
    assert!(hides_on_close("main", true, false));
    assert!(!hides_on_close("main", false, false), "no tray: it closes");
    assert!(!hides_on_close("main", true, true), "quitting: it closes");
    assert!(!hides_on_close("inbox", true, false), "other windows close");
}

#[test]
fn tray_keeps_halonic_running_only_after_the_last_window_closed() {
    assert!(stays_in_tray(None, 0, true, false));
    assert!(!stays_in_tray(Some(0), 0, true, false), "Quit Halonic");
    assert!(
        !stays_in_tray(None, 1, true, false),
        "⌘Q with a window open"
    );
    assert!(!stays_in_tray(None, 0, false, false), "no tray");
    assert!(!stays_in_tray(None, 0, true, true), "quitting");
}

#[test]
fn tray_keeps_halonic_running_only_where_a_built_tray_shows() {
    assert!(keeps_running_in_tray("windows"));
    assert!(keeps_running_in_tray("macos"));
    assert!(
        !keeps_running_in_tray("linux"),
        "GNOME can build a tray that shows nothing"
    );
}
