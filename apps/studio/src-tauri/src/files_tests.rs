//! The shapes the `fs_*` commands answer with, as `fileCommands` in
//! `packages/adapters/fs-tauri` reads them, and the opened-folder check.

use halonic_git_guard::OpenedFolders;
use halonic_workspace_files::{FileError, WatchMessage, WriteOutcome};
use serde_json::{Value, json};

use super::{FileRefusal, WatchEvent, WatchStart, WriteAnswer, workspace_root};

fn as_json(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("it serialises")
}

/// A folder of its own for one test, removed when the test ends.
struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("studio-files-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(folder.join("workspace/hubs")).expect("the scratch folder");
        Self(folder)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn files_refuse_a_workspace_that_is_not_opened() {
    let scratch = Scratch::new("opened");
    let workspace = scratch.0.join("workspace");
    let opened = OpenedFolders::new();

    let refusal = workspace_root(&opened, &workspace).expect_err("nothing is opened yet");
    assert_eq!(as_json(&refusal)["kind"], "folder_not_open");
    assert!(as_json(&refusal).get("path").is_none(), "{refusal:?}");

    opened.open(&workspace).expect("the folder opens");
    let root = workspace_root(&opened, &workspace.join("hubs")).expect("inside an opened folder");
    assert!(root.ends_with("hubs"), "{root:?}");
    let outside = workspace_root(&opened, &scratch.0).map_err(|refusal| refusal.kind);
    assert_eq!(outside, Err("folder_not_open"));
}

#[test]
fn files_answer_in_the_shapes_the_adapter_reads() {
    assert_eq!(
        as_json(WriteAnswer::from(WriteOutcome::Written)),
        json!({"status": "written"})
    );
    let changed = WriteAnswer::from(WriteOutcome::ChangedOnDisk { current: None });
    assert_eq!(
        as_json(changed),
        json!({"status": "changed-on-disk", "current": null})
    );
    let changed = WriteAnswer::from(WriteOutcome::ChangedOnDisk {
        current: Some("one\n".to_owned()),
    });
    assert_eq!(
        as_json(changed),
        json!({"status": "changed-on-disk", "current": "one\n"})
    );

    assert_eq!(as_json(WatchStart { watch_id: 7 }), json!({"watchId": 7}));
    let batch = WatchEvent::from(WatchMessage::Changed(vec!["a.yaml".to_owned()]));
    assert_eq!(
        as_json(batch),
        json!({"type": "changed", "paths": ["a.yaml"]})
    );
    let failed = WatchEvent::from(WatchMessage::Failed("gone".to_owned()));
    assert_eq!(
        as_json(failed),
        json!({"type": "failed", "message": "gone"})
    );
}

#[test]
fn files_name_the_unreadable_folder_and_only_then_a_path() {
    let unreadable = FileRefusal::from(FileError::FolderUnreadable {
        path: "hubs/locked".to_owned(),
        message: "permission denied".to_owned(),
    });
    let unreadable = as_json(unreadable);
    assert_eq!(unreadable["kind"], "folder_unreadable");
    assert_eq!(unreadable["path"], "hubs/locked");

    let root = as_json(FileRefusal::from(FileError::FolderUnreadable {
        path: String::new(),
        message: "permission denied".to_owned(),
    }));
    assert_eq!(root["path"], "", "the workspace itself is named too");

    for (error, kind) in [
        (
            FileError::NotText {
                path: "a.png".to_owned(),
            },
            "not_text",
        ),
        (
            FileError::LinkedPath {
                path: "linked/a.yaml".to_owned(),
            },
            "private_path",
        ),
    ] {
        let refusal = as_json(FileRefusal::from(error));
        assert_eq!(refusal["kind"], kind);
        assert!(refusal.get("path").is_none(), "{refusal}");
        assert!(refusal["message"].is_string(), "{refusal}");
    }
}
