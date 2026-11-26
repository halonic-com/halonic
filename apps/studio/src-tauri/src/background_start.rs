//! The start at login (B1 step 6c, design note D9, security review HAL-14212
//! section 5). The login item (`login_item.rs`) starts Halonic with exactly
//! `--background`: no window opens, and the shell starts engines for the
//! workspaces open at the last Quit (`last_quit.rs`), never for a folder an
//! argument names. Each one opens again only as `reopen_folder` would open
//! it, so a folder that is gone, changed or no longer a workspace is
//! skipped, and its engine then checks trust as every engine does (D5).
//!
//! No invisible background engine: without a tray the user sees, a start at
//! login exits. On Linux a tray can build with nothing showing, so there it
//! exits too, until the shell can tell (`tray_status::keeps_running_in_tray`).
//! An ordinary start opens the window whatever the tray does.

use std::path::{Path, PathBuf};
use std::thread;

use halonic_git_guard::OpenedFolders;
use halonic_login_item::BACKGROUND_ARGUMENT;
use halonic_profile::{ProfileFolder, join_path};
use halonic_trust_grant::{FolderPlace, PickedFolders, TrustRefusal, TrustState};
use tauri::{AppHandle, Manager, Runtime};

use crate::git::GitState;
use crate::profile::cli_profile;
use crate::tray_status::keeps_running_in_tray;

/// What makes a folder a workspace, as New workspace reads it.
const WORKSPACE_MARKER: &str = "workspace.yaml";

/// Whether `arguments`, the program's name first, are exactly a start at
/// login: one argument, `--background`. Anything else is an ordinary start.
pub fn requested<S: AsRef<str>>(arguments: &[S]) -> bool {
    matches!(arguments, [_, flag] if flag.as_ref() == BACKGROUND_ARGUMENT)
}

/// Opens the window a start asks for (`focused_apps`), with the windows open
/// at the last quit (`open_windows_track`), or none for a start at login.
/// Answers whether it is one.
pub fn open_window<R: Runtime, S: AsRef<str>>(
    app: &AppHandle<R>,
    arguments: &[S],
) -> tauri::Result<bool> {
    if requested(arguments) {
        return Ok(true);
    }
    crate::open_windows_track::open(app, crate::focused_apps::requested(arguments))?;
    Ok(false)
}

/// Whether a start at login may keep running with no window on `os`: only
/// with a tray that was built and that the user sees there.
pub fn stays_in_background(tray_built: bool, os: &str) -> bool {
    tray_built && keeps_running_in_tray(os)
}

/// After the tray started: a start at login exits without a tray the user
/// sees, or starts the engines of the workspaces open at the last Quit, off
/// the main thread, since each start waits for its engine.
pub fn after_tray<R: Runtime>(app: &AppHandle<R>, background: bool, tray_built: bool) {
    if !background {
        return;
    }
    if !stays_in_background(tray_built, std::env::consts::OS) {
        halonic_shell_log::record(
            "background start",
            "no tray the user sees, so a start at login doesn't run in the background",
        );
        crate::engines::close_unrecorded(app);
        app.exit(0);
        return;
    }
    let app = app.clone();
    thread::spawn(move || start_recorded(&app));
}

fn start_recorded<R: Runtime>(app: &AppHandle<R>) {
    let profile = match cli_profile(app) {
        Ok(profile) => profile,
        Err(problem) => {
            skipped_all(problem);
            return;
        }
    };
    let list = match crate::trust::picked_folders(app) {
        Ok(list) => list,
        Err(refusal) => {
            skipped_all(format_args!("{refusal:?}"));
            return;
        }
    };
    let locations = crate::last_quit::read(Path::new(&open_at_quit_file(&profile)));
    // A Quit before they all started records the ones still waiting too.
    crate::engines::waiting_to_start(app, &locations);
    let folders = app.state::<GitState>().folders();
    let state = app.state::<TrustState>();
    start_each(
        &locations,
        |location| {
            let place = |real: &Path| crate::profile_place::folder_place(app, real);
            let reopened = reopen_workspace(&state, &folders, &list, place, location);
            if reopened.is_err() {
                crate::engines::not_waiting(app, location);
            }
            reopened
        },
        |workspace, location| {
            if let Err(refusal) = crate::engines::start_in_background(app, workspace, location) {
                halonic_shell_log::record(
                    "background start",
                    format_args!("an engine didn't start: {refusal}"),
                );
            }
        },
    );
}

fn skipped_all(reason: impl std::fmt::Display) {
    halonic_shell_log::record(
        "background start",
        format_args!("no profile, so no engine starts: {reason}"),
    );
}

/// Starts each of `locations` that `reopen` opens again, with `start`; a
/// location it refuses is skipped, with the reason in the log.
pub fn start_each(
    locations: &[String],
    mut reopen: impl FnMut(&str) -> Result<PathBuf, TrustRefusal>,
    mut start: impl FnMut(&Path, &str),
) {
    for location in locations {
        match reopen(location) {
            Ok(workspace) => start(&workspace, location),
            Err(refusal) => halonic_shell_log::record(
                "background start",
                format_args!("a workspace open at the last Quit is skipped: {refusal:?}"),
            ),
        }
    }
}

/// Opens `location` again as `reopen_folder` does, if it is still a
/// workspace, and gives back its real path. Refused as `TrustState::reopen`
/// refuses, or as `not_workspace` when it holds no `workspace.yaml`.
pub fn reopen_workspace(
    state: &TrustState,
    folders: &OpenedFolders,
    list: &PickedFolders,
    place: impl FnOnce(&Path) -> FolderPlace,
    location: &str,
) -> Result<PathBuf, TrustRefusal> {
    // A first look, so a folder that plainly isn't a workspace doesn't move
    // up the picked list as a reopen moves it.
    if !Path::new(location).join(WORKSPACE_MARKER).is_file() {
        return Err(not_workspace(location));
    }
    state.reopen(folders, list, place, location)?;
    let real = folders.check(Path::new(location)).map_err(|_| {
        TrustRefusal::new("folder_unreadable", format!("{location:?} can't be read"))
    })?;
    // What decides is the folder that opened, which may have changed since
    // the first look. It stays open, as a picked folder Studio reopens does;
    // only its engine doesn't start.
    if !real.join(WORKSPACE_MARKER).is_file() {
        return Err(not_workspace(location));
    }
    Ok(real)
}

fn not_workspace(location: &str) -> TrustRefusal {
    TrustRefusal::new("not_workspace", format!("{location:?} isn't a workspace"))
}

/// Quit: records `locations` for the next start at login. A list that can't
/// be written is logged; Halonic quits anyway.
pub fn record_open_at_quit<R: Runtime>(app: &AppHandle<R>, locations: &[String]) {
    let recorded = cli_profile(app)
        .map_err(|problem| problem.to_string())
        .and_then(|profile| {
            crate::last_quit::record(Path::new(&open_at_quit_file(&profile)), locations)
                .map_err(|error| error.to_string())
        });
    if let Err(problem) = recorded {
        halonic_shell_log::record(
            "background start",
            format_args!("the workspaces open at Quit weren't recorded: {problem}"),
        );
    }
}

fn open_at_quit_file(profile: &ProfileFolder) -> String {
    join_path(
        profile.platform,
        &profile.root,
        &["studio", crate::last_quit::FILE_NAME],
    )
}

#[cfg(test)]
#[path = "background_start_tests.rs"]
mod tests;
