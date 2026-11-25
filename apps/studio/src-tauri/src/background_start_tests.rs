//! Tests for `studio.src-tauri.background-start`. Each name starts with
//! `background_start_` until the trace check reads `cargo test`.

use std::fs;
use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_trust_grant::{FolderPlace, PickedFolders, TrustState};
use tauri::Manager;

use super::*;
use crate::last_quit;

/// A folder of its own under the system's temporary folder, removed when
/// the test ends, pass or fail.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "halonic-background-start-{name}-{}",
            std::process::id()
        ));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder");
        Self(folder)
    }

    fn folder(&self, name: &str, workspace: bool) -> PathBuf {
        let folder = self.0.join(name);
        fs::create_dir_all(&folder).expect("a folder");
        if workspace {
            fs::write(folder.join("workspace.yaml"), "name: acme\n").expect("workspace.yaml");
        }
        folder
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
    crate::shell(tauri::test::mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime")
}

#[test]
fn background_start_accepts_exactly_the_flag() {
    assert!(requested(&["Halonic", "--background"]));
    for arguments in [
        &["Halonic"][..],
        &["Halonic", "--background", "--background"],
        &["Halonic", "--background", "/acme"],
        &["Halonic", "--app", "inbox", "--background"],
        &["Halonic", "--background=1"],
        &["Halonic", "--Background"],
        &["--background"],
    ] {
        assert!(!requested(arguments), "{arguments:?}");
    }
}

#[test]
fn background_start_opens_no_window() {
    let app = mock_app();
    assert!(open_window(app.handle(), &["Halonic", "--background"]).expect("no window"));
    assert!(app.webview_windows().is_empty());
    assert!(!open_window(app.handle(), &["Halonic"]).expect("Studio's window"));
    assert_eq!(
        app.webview_windows().into_keys().collect::<Vec<_>>(),
        ["main"]
    );
}

#[test]
fn background_start_a_second_start_at_login_opens_nothing() {
    let app = mock_app();
    let arguments = ["Halonic".to_owned(), "--background".to_owned()];
    crate::focused_apps::started_again(app.handle(), &arguments);
    assert!(app.webview_windows().is_empty());
    crate::focused_apps::started_again(app.handle(), &arguments[..1]);
    assert_eq!(
        app.webview_windows().into_keys().collect::<Vec<_>>(),
        ["main"]
    );
}

/// Linux CI runs this with the tray library installed and without it: the
/// answer is the same, since a tray that builds may show nothing there.
#[test]
fn background_start_stays_only_with_a_tray_the_user_sees() {
    assert!(stays_in_background(true, "windows"));
    assert!(stays_in_background(true, "macos"));
    assert!(!stays_in_background(false, "windows"));
    assert!(!stays_in_background(false, "macos"));
    assert!(!stays_in_background(true, "linux"));
    assert!(!stays_in_background(false, "linux"));
    assert!(!stays_in_background(
        crate::tray::start(mock_app().handle()),
        std::env::consts::OS
    ));
}

#[test]
fn background_start_records_the_open_workspaces_for_the_next_start() {
    let scratch = Scratch::new("record");
    let file = scratch.0.join("studio").join(last_quit::FILE_NAME);
    assert!(last_quit::read(&file).is_empty());
    let locations = ["/acme/one".to_owned(), "/acme/two".to_owned()];
    last_quit::record(&file, &locations).expect("recorded");
    assert_eq!(last_quit::read(&file), locations);
    last_quit::record(&file, &[]).expect("recorded");
    assert!(last_quit::read(&file).is_empty());
    let many: Vec<String> = (0..20).map(|n| format!("/acme/{n}")).collect();
    last_quit::record(&file, &many).expect("recorded");
    assert_eq!(
        last_quit::read(&file),
        &many[..halonic_trust_grant::MAX_PICKED_FOLDERS]
    );
}

#[test]
fn background_start_reads_a_damaged_list_as_none() {
    let scratch = Scratch::new("damaged");
    let file = scratch.0.join(last_quit::FILE_NAME);
    let padding = " ".repeat(70 * 1024);
    for text in [
        "not json".to_owned(),
        r#"{"version":2,"workspaces":["/acme"]}"#.to_owned(),
        r#"{"version":1,"workspaces":["/acme"],"also":["/evil"]}"#.to_owned(),
        r#"{"version":1,"workspaces":"/acme"}"#.to_owned(),
        format!(r#"{{"version":1,"workspaces":["/acme"]}}{padding}"#),
    ] {
        fs::write(&file, &text).expect("the file");
        assert!(last_quit::read(&file).is_empty(), "{text:.60}");
    }
}

/// The real path `reopen_workspace` gives back, as the picker answers it.
fn picked(state: &TrustState, list: &PickedFolders, folder: &Path) -> String {
    state
        .pick_remembered(
            &OpenedFolders::new(),
            list,
            |_| FolderPlace::Apart,
            || Some(folder.to_owned()),
        )
        .expect("picked")
        .expect("a location")
}

#[test]
fn background_start_starts_only_recorded_workspaces_still_there() {
    let scratch = Scratch::new("reopen");
    let list = PickedFolders::new(scratch.0.join("picked-folders.json"));
    let before_restart = TrustState::default();
    let workspace = picked(&before_restart, &list, &scratch.folder("acme", true));
    let not_workspace = picked(&before_restart, &list, &scratch.folder("notes", false));
    let gone_folder = scratch.folder("gone", true);
    let gone = picked(&before_restart, &list, &gone_folder);
    fs::remove_dir_all(&gone_folder).expect("removed");
    let never_picked = scratch.folder("other", true);
    let never_picked = never_picked.to_string_lossy().into_owned();
    let not_recorded = picked(&before_restart, &list, &scratch.folder("idle", true));

    let state = TrustState::default();
    let folders = OpenedFolders::new();
    let recorded = [workspace.clone(), not_workspace, gone, never_picked.clone()];
    let mut started = Vec::new();
    start_each(
        &recorded,
        |location| reopen_workspace(&state, &folders, &list, |_| FolderPlace::Apart, location),
        |real, location| started.push((real.to_owned(), location.to_owned())),
    );

    let real = fs::canonicalize(&workspace).expect("the workspace");
    assert_eq!(started, [(real.clone(), workspace)]);
    assert_eq!(folders.list(), [real]);
    assert!(folders.check(Path::new(&not_recorded)).is_err());
    assert!(folders.check(Path::new(&never_picked)).is_err());
}

#[test]
fn background_start_skips_a_folder_that_is_no_longer_a_workspace() {
    let scratch = Scratch::new("marker");
    let list = PickedFolders::new(scratch.0.join("picked-folders.json"));
    let folder = scratch.folder("acme", true);
    let location = picked(&TrustState::default(), &list, &folder);
    fs::remove_file(folder.join("workspace.yaml")).expect("removed");
    let folders = OpenedFolders::new();
    let refusal = reopen_workspace(
        &TrustState::default(),
        &folders,
        &list,
        |_| FolderPlace::Apart,
        &location,
    )
    .expect_err("not a workspace");
    assert_eq!(refusal.kind(), "not_workspace");
    assert!(folders.list().is_empty());
}
