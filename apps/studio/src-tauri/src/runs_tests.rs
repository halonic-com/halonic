//! Requirement `run-commands`: the run folder the commands work out, and
//! the answers they give the page.

use std::path::{Path, PathBuf};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};
use halonic_run_store::{AppendOutcome, RunStoreError};
use serde_json::json;

use super::{AppendAnswer, RunRefusal, runs_folder};

/// A workspace folder of its own for one test, removed when the test ends.
struct Workspace(PathBuf);

impl Workspace {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("run-commands-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the workspace can be created");
        Self(folder)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A profile under the system's temporary folder; nothing is created in it.
fn profile() -> ProfileFolder {
    let root = std::env::temp_dir().join("run-commands-profile");
    ProfileFolder {
        platform: Platform::current(),
        root: root
            .to_str()
            .expect("a Unicode temporary folder")
            .to_owned(),
    }
}

/// The runs folder `@halonicjs/profile` names for the workspace's real path.
fn expected_runs(workspace: &Path, deployment: Option<&str>) -> PathBuf {
    let real_path = std::fs::canonicalize(workspace).unwrap();
    let folders = profile()
        .workspace_folders(real_path.to_str().unwrap())
        .unwrap();
    PathBuf::from(folders.runs_folder(deployment).unwrap())
}

#[test]
fn run_commands_find_an_opened_workspace_s_runs_in_the_profile() {
    let workspace = Workspace::new("opened");
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();

    let runs = runs_folder(&opened, &profile(), workspace.path(), None);
    assert_eq!(runs, Ok(expected_runs(workspace.path(), None)));
    let deployment = runs_folder(&opened, &profile(), workspace.path(), Some("nightly"));
    assert_eq!(
        deployment,
        Ok(expected_runs(workspace.path(), Some("nightly")))
    );
    assert!(
        deployment
            .unwrap()
            .ends_with(Path::new("deployments/nightly/runs"))
    );
}

#[test]
fn run_commands_name_a_workspace_by_its_real_path() {
    // `<workspace>/sub/..` is the workspace: the CLI's realpath gives the
    // same folder, so both write the same runs.
    let workspace = Workspace::new("real-path");
    std::fs::create_dir_all(workspace.path().join("sub")).unwrap();
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();

    let roundabout = workspace.path().join("sub").join("..");
    assert_eq!(
        runs_folder(&opened, &profile(), &roundabout, None),
        Ok(expected_runs(workspace.path(), None))
    );
}

#[test]
fn run_commands_refuse_a_workspace_that_isn_t_opened() {
    let workspace = Workspace::new("not-opened");
    let refused = runs_folder(&OpenedFolders::new(), &profile(), workspace.path(), None);
    let refusal = refused.expect_err("nothing is opened");
    assert_eq!(refusal.kind, "folder_not_open");
    assert!(
        refusal.message.ends_with("is not an opened folder"),
        "{refusal:?}"
    );

    let missing = workspace.path().join("missing");
    let refused = runs_folder(&OpenedFolders::new(), &profile(), &missing, None);
    assert_eq!(
        refused.expect_err("it doesn't exist").kind,
        "folder_not_open"
    );
}

#[test]
fn run_commands_refuse_a_deployment_id_the_profile_doesn_t_allow() {
    let workspace = Workspace::new("deployment");
    let opened = OpenedFolders::new();
    opened.open(workspace.path()).unwrap();
    for deployment in ["../other", "Nightly", "nul", ""] {
        let refused = runs_folder(&opened, &profile(), workspace.path(), Some(deployment));
        let refusal = refused.expect_err(deployment);
        assert_eq!(refusal.kind, "invalid_deployment", "{deployment:?}");
    }
}

#[test]
fn run_commands_answer_an_append_as_the_page_reads_it() {
    let stored = AppendOutcome::Appended {
        last_seq: 2,
        snapshot_error: None,
        release_error: None,
    };
    let answer = serde_json::to_value(AppendAnswer::from_outcome("r1", stored)).unwrap();
    assert_eq!(answer, json!({"ok": true, "lastSeq": 2}));

    let conflict = AppendOutcome::Conflict { last_seq: 3 };
    let answer = serde_json::to_value(AppendAnswer::from_outcome("r1", conflict)).unwrap();
    assert_eq!(
        answer,
        json!({"ok": false, "reason": "conflict", "lastSeq": 3})
    );
}

#[test]
fn run_commands_give_a_snapshot_error_with_the_append_and_keep_an_unreleased_lock_out() {
    let full = || RunStoreError::Io {
        message: "No space left on device".to_owned(),
    };
    let stored = AppendOutcome::Appended {
        last_seq: 2,
        snapshot_error: Some(full()),
        release_error: Some(full()),
    };
    let answer = serde_json::to_value(AppendAnswer::from_outcome("r1", stored)).unwrap();
    // The lock is logged, not answered: the lines are stored, so the page
    // must not try again.
    assert_eq!(
        answer,
        json!({"ok": true, "lastSeq": 2, "snapshotError": "No space left on device"})
    );
}

#[test]
fn run_commands_refuse_with_the_store_s_kind_and_words() {
    let refusal = RunRefusal::from(RunStoreError::InvalidRunId {
        run_id: "../r1".to_owned(),
    });
    let refusal = serde_json::to_value(refusal).unwrap();
    assert_eq!(refusal["kind"], "invalid_run_id");
    assert!(
        refusal["message"]
            .as_str()
            .unwrap()
            .starts_with("Unsafe run id")
    );
}
