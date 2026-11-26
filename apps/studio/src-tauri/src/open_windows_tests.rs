//! Tests for `studio.src-tauri.open-windows`. Each name starts with what
//! it checks.

use std::fs;
use std::path::PathBuf;

use serde_json::json;

use super::*;

/// A folder of its own for one test, removed after it.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "halonic-open-windows-{name}-{}",
            std::process::id()
        ));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder");
        Self(folder)
    }

    fn file(&self) -> PathBuf {
        self.0.join("studio").join(FILE_NAME)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn window(label: &str, focused: bool, content: Option<&str>) -> OpenWindow {
    OpenWindow {
        label: label.to_owned(),
        focused,
        content: content.map(str::to_owned),
    }
}

const ALL_THREE: [(&str, bool); 3] = [("main", false), ("inbox", true), ("messenger", false)];

#[test]
fn open_windows_record_then_read_gives_the_same_windows() {
    let scratch = Scratch::new("round-trip");
    let file = scratch.file();
    assert!(read(&file).is_empty());
    let windows = [
        window("main", false, Some(r#"{"workspace":"/acme"}"#)),
        window("inbox", true, None),
        window("messenger", false, Some(r#"{"chat":"chat-1"}"#)),
    ];
    record(&file, &windows).expect("recorded");
    assert_eq!(read(&file), windows);
}

#[test]
fn open_windows_quit_with_three_windows_open_records_three() {
    let scratch = Scratch::new("quit");
    let file = scratch.file();
    let mut set = OpenSet::default();
    if let Some(list) = set.note(&ALL_THREE) {
        record(&file, &list).expect("recorded");
    }
    let quit = set.quit(&ALL_THREE);
    assert_eq!(quit, None, "nothing changed since the last write");
    // Quitting closes the windows one by one; none of that is written.
    assert_eq!(set.note(&[("main", false), ("messenger", false)]), None);
    assert_eq!(set.note(&[("main", false)]), None);
    assert_eq!(set.note(&[]), None);
    let labels: Vec<String> = read(&file).into_iter().map(|window| window.label).collect();
    assert_eq!(labels, ["main", "inbox", "messenger"]);
}

#[test]
fn open_windows_quit_writes_what_changed_since_the_last_write() {
    let mut set = OpenSet::default();
    set.note(&[("main", true)]);
    let quit = set.quit(&ALL_THREE).expect("the new windows are written");
    assert_eq!(quit.len(), 3);
}

#[test]
fn open_windows_the_last_window_closing_leaves_its_own_entry() {
    let mut set = OpenSet::default();
    assert!(set.note(&ALL_THREE).is_some());
    // The same windows again write nothing.
    assert_eq!(set.note(&ALL_THREE), None);
    // One closed by the user is dropped...
    let two = set
        .note(&[("main", false), ("inbox", true)])
        .expect("written");
    assert_eq!(two.len(), 2);
    // ...but none showing keeps what showed before.
    assert_eq!(set.note(&[]), None);
}

#[test]
fn open_windows_the_last_focused_app_window_stays_in_front_when_the_focus_leaves_them_all() {
    let mut set = OpenSet::default();
    let written = set.note(&ALL_THREE).expect("written");
    // A click on the tray, or another program, takes the focus from every
    // app window: nothing changed for the list.
    let unfocused = [("main", false), ("inbox", false), ("messenger", false)];
    assert_eq!(set.note(&unfocused), None);
    assert_eq!(set.quit(&unfocused), None);
    assert_eq!(
        opening_order(&written, None).last().map(String::as_str),
        Some("inbox")
    );
    // The focus moving to another app window is written.
    let mut set = OpenSet::from_recorded(&written);
    let moved = set
        .note(&[("main", true), ("inbox", false), ("messenger", false)])
        .expect("written");
    assert_eq!(
        opening_order(&moved, None).last().map(String::as_str),
        Some("main")
    );
}

#[test]
fn open_windows_a_first_window_opened_another_way_still_reopens_the_recorded_ones() {
    let recorded = [window("main", false, None), window("inbox", true, None)];
    let mut set = OpenSet::from_recorded(&recorded);
    // After a start at login, a notification's click opens the Messenger:
    // the list is kept up to date from the start...
    assert!(set.note(&[("messenger", true)]).is_some());
    // ...and the step that opens it still reopens the windows of the last quit.
    assert_eq!(set.first_open(), recorded);
    assert!(set.first_open().is_empty());
}

#[test]
fn open_windows_three_contents_of_escaped_characters_still_read_back() {
    let scratch = Scratch::new("escaped");
    let file = scratch.file();
    let content = "\u{1}".repeat(MAX_CONTENT_BYTES);
    let windows = [
        window("main", false, Some(&content)),
        window("inbox", true, Some(&content)),
        window("messenger", false, Some(&content)),
    ];
    record(&file, &windows).expect("recorded");
    assert_eq!(read(&file), windows);
}

#[test]
fn open_windows_helper_windows_are_never_written_or_read() {
    let scratch = Scratch::new("helpers");
    let file = scratch.file();
    let mut set = OpenSet::default();
    let list = set
        .note(&[
            ("main", true),
            ("ask", false),
            ("feedback", false),
            ("server-session-brief", false),
        ])
        .expect("written");
    assert_eq!(list, [window("main", true, None)]);
    // Only helper windows showing is as good as none.
    assert_eq!(set.note(&[("ask", true)]), None);
    // A file that lists them anyway reads without them.
    fs::create_dir_all(file.parent().expect("a folder")).expect("the folder");
    let text = json!({
        "version": 1,
        "windows": [
            {"label": "feedback", "focused": false},
            {"label": "inbox", "focused": true},
            {"label": "inbox", "focused": false},
            {"label": "ask", "focused": false}
        ]
    });
    fs::write(&file, text.to_string()).expect("written");
    assert_eq!(read(&file), [window("inbox", true, None)]);
}

#[test]
fn open_windows_a_damaged_file_reads_as_none() {
    let scratch = Scratch::new("damaged");
    let file = scratch.file();
    fs::create_dir_all(file.parent().expect("a folder")).expect("the folder");
    for text in [
        "not json".to_owned(),
        json!({"version": 2, "windows": [{"label": "main", "focused": true}]}).to_string(),
        json!({"version": 1, "windows": [], "more": true}).to_string(),
        " ".repeat(usize::try_from(MAX_FILE_BYTES).expect("small") + 1),
    ] {
        fs::write(&file, text).expect("written");
        assert!(read(&file).is_empty());
    }
}

#[test]
fn open_windows_content_over_2_kb_is_refused_and_never_cut_short() {
    let mut set = OpenSet::default();
    set.set_content("messenger", Some("chat-1".to_owned()))
        .expect("kept");
    let long = "x".repeat(MAX_CONTENT_BYTES + 1);
    assert_eq!(set.set_content("messenger", Some(long)), Err("too_long"));
    assert_eq!(set.content("messenger").as_deref(), Some("chat-1"));
    let full = "x".repeat(MAX_CONTENT_BYTES);
    set.set_content("messenger", Some(full.clone()))
        .expect("kept");
    assert_eq!(set.content("messenger"), Some(full));
    set.set_content("messenger", None).expect("forgotten");
    assert_eq!(set.content("messenger"), None);
}

#[test]
fn open_windows_content_from_a_helper_window_is_refused() {
    let mut set = OpenSet::default();
    for label in ["ask", "feedback", "server-session-brief", ""] {
        assert_eq!(
            set.set_content(label, Some("x".to_owned())),
            Err("not_an_app_window"),
            "{label:?}"
        );
    }
}

#[test]
fn open_windows_a_recorded_content_over_2_kb_opens_the_start_screen() {
    let long = "x".repeat(MAX_CONTENT_BYTES + 1);
    let kept = kept(vec![window("main", true, Some(&long))]);
    assert_eq!(kept, [window("main", true, None)]);
}

#[test]
fn open_windows_content_is_written_with_its_window_and_comes_back_at_start() {
    let mut set = OpenSet::default();
    set.note(&[("messenger", true)]);
    set.set_content("messenger", Some("chat-1".to_owned()))
        .expect("kept");
    let list = set
        .note(&[("messenger", true)])
        .expect("the content changed");
    assert_eq!(list, [window("messenger", true, Some("chat-1"))]);
    let started = OpenSet::from_recorded(&list);
    assert_eq!(started.content("messenger").as_deref(), Some("chat-1"));
    assert_eq!(started.content("inbox"), None);
}

#[test]
fn open_windows_reopen_once_per_run() {
    let recorded = [window("main", true, None)];
    let mut set = OpenSet::from_recorded(&recorded);
    assert_eq!(set.first_open(), recorded);
    assert!(set.first_open().is_empty());
}

#[test]
fn open_windows_the_switch_is_on_unless_saved_off() {
    assert!(reopens(None));
    assert!(reopens(Some(&json!(true))));
    assert!(reopens(Some(&json!("off"))));
    assert!(!reopens(Some(&json!(false))));
}

#[test]
fn open_windows_open_every_recorded_window_the_focused_one_last() {
    let recorded = [
        window("main", false, None),
        window("inbox", true, None),
        window("messenger", false, None),
    ];
    assert_eq!(
        opening_order(&recorded, None),
        ["main", "messenger", "inbox"]
    );
    // `--app messenger` puts the Messenger in front.
    assert_eq!(
        opening_order(&recorded, Some("messenger")),
        ["main", "inbox", "messenger"]
    );
    // A run's click asks for Studio's window by name: in front, though
    // the Inbox had the focus.
    assert_eq!(
        opening_order(&recorded[1..], Some("main")),
        ["inbox", "messenger", "main"]
    );
    // `--app inbox` opens the Inbox even when it wasn't open at quit.
    assert_eq!(
        opening_order(&[window("main", true, None)], Some("inbox")),
        ["main", "inbox"]
    );
}

#[test]
fn open_windows_with_none_focused_the_first_comes_to_the_front() {
    let recorded = [
        window("inbox", false, None),
        window("messenger", false, None),
    ];
    assert_eq!(opening_order(&recorded, None), ["messenger", "inbox"]);
}

#[test]
fn open_windows_content_commands_are_granted_to_the_app_windows_only_and_never_served() {
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/desktop-window-content.json"))
            .expect("the capability");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main", "inbox", "messenger"]));
    assert!(capability.get("remote").is_none());
    assert_eq!(
        capability["permissions"],
        json!(["allow-window-content-get", "allow-window-content-set"])
    );
}
