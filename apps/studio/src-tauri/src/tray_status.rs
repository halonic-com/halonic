//! What the tray shows (B1 step 5), as the board approved it on HAL-14213:
//! the icon's state and the menu, worded as the card's "every state" render,
//! from the background engines' summary. Plain data, so tests need no tray.
//!
//! Not here yet: the status line's "next routine at 14:00" and "1 run needs
//! you", which wait on the engine's health reporting them (HAL-18279), and
//! Pause routines, which waits on HAL-17185.

use crate::engine_table::EnginesSummary;

/// The icon's state: the Halonic ring, with the state in its centre. Its
/// file is `icons/tray/<scheme>-<state>.rgba`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconState {
    /// The ring alone.
    Idle,
    /// A dot: runs in progress.
    Running,
    /// Pause bars: routines paused.
    Paused,
    /// "!": an engine crashed 3 times in 5 minutes.
    Problem,
}

/// Which drawing of the icon the desktop gets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconScheme {
    /// In colour: Windows, KDE and other Linux desktops.
    Colour,
    /// Black, as a template the menu bar recolours: macOS.
    Template,
    /// White, like GNOME's own top-bar icons.
    Symbolic,
}

impl IconScheme {
    /// The scheme for `os` (`std::env::consts::OS`) and, on Linux, the
    /// desktop in `XDG_CURRENT_DESKTOP`, such as `ubuntu:GNOME`.
    pub fn for_desktop(os: &str, desktop: Option<&str>) -> Self {
        if os == "macos" {
            return IconScheme::Template;
        }
        let gnome = desktop.is_some_and(|names| {
            names
                .split(':')
                .any(|name| name.eq_ignore_ascii_case("gnome"))
        });
        if os == "linux" && gnome {
            return IconScheme::Symbolic;
        }
        IconScheme::Colour
    }
}

/// A menu item's id, which the tray's click handler reads.
pub const OPEN: &str = "open";
/// The status lines' ids start with it (`status-0`, `status-1`): like Open
/// Halonic, they open the window.
pub const STATUS: &str = "status";
/// Try again, in the problem state: starts the stopped engines again.
pub const TRY_AGAIN: &str = "try-again";
/// Quit Halonic.
pub const QUIT: &str = "quit";

/// One line of the tray's menu.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MenuLine {
    /// An item: its id, its text, and whether it can be clicked.
    Item {
        id: String,
        text: String,
        enabled: bool,
    },
    /// A line between groups of items.
    Separator,
}

/// What the tray shows: its icon and its menu.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrayView {
    pub icon: IconState,
    pub menu: Vec<MenuLine>,
}

/// The tray for `summary`, or for Quit once it started (`quitting`).
pub fn tray_view(summary: EnginesSummary, quitting: bool) -> TrayView {
    let icon = icon_state(summary);
    if quitting {
        return TrayView {
            // The icon keeps its state; it goes when Halonic has quit.
            icon,
            menu: menu(&[quitting_line(summary.active_runs)], &[OPEN], false),
        };
    }
    let (status, actions): (Vec<String>, &[&str]) = if summary.problem {
        (
            vec![
                "Routines aren't running".to_owned(),
                "The background engine stopped 3 times".to_owned(),
            ],
            &[TRY_AGAIN, OPEN],
        )
    } else {
        (vec![status_line(summary)], &[OPEN])
    };
    TrayView {
        icon,
        menu: menu(&status, actions, true),
    }
}

fn icon_state(summary: EnginesSummary) -> IconState {
    if summary.problem {
        IconState::Problem
    } else if summary.paused {
        IconState::Paused
    } else if summary.active_runs > 0 {
        IconState::Running
    } else {
        IconState::Idle
    }
}

fn status_line(summary: EnginesSummary) -> String {
    let runs = runs_in_progress(summary.active_runs);
    match (summary.paused, runs) {
        (true, Some(runs)) => format!("Routines paused · {runs}"),
        (true, None) => "Routines paused".to_owned(),
        (false, Some(runs)) => runs,
        (false, None) => "Nothing running".to_owned(),
    }
}

fn runs_in_progress(active_runs: u32) -> Option<String> {
    match active_runs {
        0 => None,
        1 => Some("1 run in progress".to_owned()),
        runs => Some(format!("{runs} runs in progress")),
    }
}

fn quitting_line(active_runs: u32) -> String {
    match active_runs {
        0 => "Quitting…".to_owned(),
        1 => "Quitting… 1 run finishing its step".to_owned(),
        runs => format!("Quitting… {runs} runs finishing their step"),
    }
}

/// The status lines, the actions, then Quit Halonic, each group apart. In
/// the quitting state nothing can be clicked.
fn menu(status: &[String], actions: &[&str], enabled: bool) -> Vec<MenuLine> {
    let item = |id: &str, text: &str| MenuLine::Item {
        id: id.to_owned(),
        text: text.to_owned(),
        enabled,
    };
    let mut lines: Vec<MenuLine> = status
        .iter()
        .enumerate()
        .map(|(index, text)| item(&format!("{STATUS}-{index}"), text))
        .collect();
    lines.push(MenuLine::Separator);
    lines.extend(actions.iter().map(|id| item(id, action_text(id))));
    lines.push(MenuLine::Separator);
    lines.push(item(QUIT, "Quit Halonic"));
    lines
}

fn action_text(id: &str) -> &'static str {
    match id {
        TRY_AGAIN => "Try again",
        _ => "Open Halonic",
    }
}

/// Whether closing the window `label` hides it rather than closing it:
/// Studio's window, while the tray shows and Halonic isn't quitting. With no
/// tray, closing it quits as before (design note D9).
pub fn hides_on_close(label: &str, tray_shown: bool, quitting: bool) -> bool {
    label == crate::focused_apps::STUDIO_WINDOW && tray_shown && !quitting
}

/// Whether Halonic keeps running in the tray when an exit was asked with
/// `code`: only when the last window closed (no code, none left), not for
/// Quit, ⌘Q with windows open, or an update's restart.
pub fn stays_in_tray(
    code: Option<i32>,
    windows_left: usize,
    tray_shown: bool,
    quitting: bool,
) -> bool {
    code.is_none() && windows_left == 0 && tray_shown && !quitting
}

#[cfg(test)]
#[path = "tray_status_tests.rs"]
mod tests;
