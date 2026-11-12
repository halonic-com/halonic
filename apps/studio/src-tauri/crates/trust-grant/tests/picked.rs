//! The picked folders the shell remembers across restarts (HAL-6637), on
//! real folders in a scratch folder. Requirement `trust-grants`.

use std::fs;
use std::path::{Path, PathBuf};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_grant::{MAX_PICKED_FOLDERS, PickedFolders, TrustState};
use halonic_trust_store::FileTrustStore;
use serde_json::json;

/// Folders of its own for one test, under the system's temporary folder,
/// removed when the test ends: `work/acme/hubs`, `work/other` and a profile.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("picked-folders-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        for folder in ["work/acme/hubs", "work/other", "profile"] {
            fs::create_dir_all(root.join(folder)).expect("the scratch folders can be created");
        }
        Self(root)
    }

    fn path(&self, folder: &str) -> PathBuf {
        self.0.join(folder)
    }

    fn location(&self, folder: &str) -> String {
        let canonical = fs::canonicalize(self.path(folder)).expect("the folder exists");
        plain_path(&canonical)
            .into_string()
            .expect("a Unicode path")
    }

    fn list_file(&self) -> PathBuf {
        self.path("profile/studio/picked-folders.json")
    }

    fn list(&self) -> PickedFolders {
        PickedFolders::new(self.list_file())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// One run of the shell: what it holds in memory starts empty each time,
/// as after a restart; only the list file in the profile carries over.
struct Shell {
    state: TrustState,
    folders: OpenedFolders,
}

impl Shell {
    fn start() -> Self {
        Self {
            state: TrustState::default(),
            folders: OpenedFolders::new(),
        }
    }

    /// Picks `folder` in the dialog and remembers it, as `pick_folder` does.
    fn pick(&self, scratch: &Scratch, folder: &str) -> String {
        self.state
            .pick_remembered(&self.folders, &scratch.list(), || {
                Some(scratch.path(folder))
            })
            .expect("picking a folder works")
            .expect("a folder was picked")
    }

    fn reopen(&self, scratch: &Scratch, location: &str) -> Result<(), &'static str> {
        self.state
            .reopen(&self.folders, &scratch.list(), location)
            .map_err(|refusal| refusal.kind())
    }

    fn forget(&self, scratch: &Scratch, location: &str) {
        self.state
            .forget(&self.folders, &scratch.list(), location)
            .expect("forgetting works");
    }

    fn is_open(&self, location: &str) -> bool {
        self.folders.check(Path::new(location)).is_ok()
    }
}

#[test]
fn trust_grants_reopen_a_picked_folder_after_a_restart() {
    let scratch = Scratch::new("restart");
    let acme = Shell::start().pick(&scratch, "work/acme");

    let shell = Shell::start();
    assert!(!shell.is_open(&acme));
    assert_eq!(shell.reopen(&scratch, &acme), Ok(()));
    assert!(shell.is_open(&acme));
    // A reopened folder counts as picked: a grant inside it needs no question.
    let hubs = scratch.location("work/acme/hubs");
    let store = FileTrustStore::new(scratch.path("profile/trust"));
    let granted = shell.state.grant(
        &store,
        &shell.folders,
        &json!({"location": hubs, "pins": {}}),
        |_| panic!("no question inside a picked folder"),
    );
    assert!(granted.is_ok());
}

#[test]
fn trust_grants_refuse_to_reopen_a_folder_the_person_never_picked() {
    let scratch = Scratch::new("never-picked");
    Shell::start().pick(&scratch, "work/acme");

    let shell = Shell::start();
    // Neither another folder nor a folder inside the picked one is in the list.
    for folder in ["work/other", "work/acme/hubs"] {
        let location = scratch.location(folder);
        assert_eq!(
            shell.reopen(&scratch, &location),
            Err("not_picked"),
            "{folder}"
        );
        assert!(!shell.is_open(&location), "{folder}");
    }
}

#[cfg(unix)]
#[test]
fn trust_grants_refuse_to_reopen_a_picked_folder_a_link_was_swapped_into() {
    let scratch = Scratch::new("swapped-link");
    let acme = Shell::start().pick(&scratch, "work/acme");
    let acme_path = scratch.path("work/acme");
    fs::remove_dir_all(&acme_path).expect("the folder can be removed");
    std::os::unix::fs::symlink(scratch.path("work/other"), &acme_path)
        .expect("the link can be made");

    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &acme), Err("folder_changed"));
    assert!(!shell.is_open(&acme));
    assert!(!shell.is_open(&scratch.location("work/other")));
    // The entry stays, so the person can pick the folder again.
    assert_eq!(scratch.list().locations(), [acme]);
}

#[cfg(unix)]
#[test]
fn trust_grants_refuse_to_reopen_a_folder_deleted_and_made_again() {
    let scratch = Scratch::new("made-again");
    let acme = Shell::start().pick(&scratch, "work/acme");
    // Hold the old folder's inode elsewhere, so the new one can't reuse it.
    fs::rename(scratch.path("work/acme"), scratch.path("work/old-acme"))
        .expect("the folder can be moved");
    fs::create_dir(scratch.path("work/acme")).expect("the folder can be made again");

    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &acme), Err("folder_changed"));
    assert!(!shell.is_open(&acme));
}

#[test]
fn trust_grants_tell_a_missing_picked_folder_apart_from_a_refused_one() {
    let scratch = Scratch::new("missing");
    let acme = Shell::start().pick(&scratch, "work/acme");
    fs::remove_dir_all(scratch.path("work/acme")).expect("the folder can be removed");

    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &acme), Err("folder_missing"));
    assert_eq!(scratch.list().locations(), [acme]);
}

#[test]
fn trust_grants_refuse_to_reopen_a_forgotten_folder_and_close_it() {
    let scratch = Scratch::new("forget");
    let shell = Shell::start();
    let acme = shell.pick(&scratch, "work/acme");
    let store = FileTrustStore::new(scratch.path("profile/trust"));
    let record = json!({"location": acme, "pins": {}});
    store.grant(&record).expect("the record is saved");

    shell.forget(&scratch, &acme);
    assert!(!shell.is_open(&acme));
    assert!(scratch.list().locations().is_empty());
    // Forgetting a Recent row doesn't take the folder's trust away.
    assert!(store.get(&acme).expect("the record can be read").is_some());
    // Forgetting again, or a folder never picked, is no error.
    shell.forget(&scratch, &acme);
    shell.forget(&scratch, &scratch.location("work/other"));

    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &acme), Err("not_picked"));
    assert!(!shell.is_open(&acme));
}

#[test]
fn trust_grants_read_a_damaged_list_as_empty() {
    let scratch = Scratch::new("damaged");
    let acme = Shell::start().pick(&scratch, "work/acme");
    let damaged = [
        "{ not json".to_owned(),
        json!({"version": 2, "folders": [{"location": acme}]}).to_string(),
        json!({"folders": [{"location": acme}]}).to_string(),
    ];
    for text in damaged {
        fs::write(scratch.list_file(), &text).expect("the file can be written");
        let shell = Shell::start();
        assert!(scratch.list().locations().is_empty(), "{text}");
        assert_eq!(shell.reopen(&scratch, &acme), Err("not_picked"), "{text}");
        assert!(!shell.is_open(&acme), "{text}");
    }
    // The next pick writes a good list over the damaged one.
    let other = Shell::start().pick(&scratch, "work/other");
    assert_eq!(scratch.list().locations(), [other]);
}

#[cfg(unix)]
#[test]
fn trust_grants_refuse_to_reopen_an_entry_without_an_identity_on_unix() {
    let scratch = Scratch::new("no-identity");
    let acme = scratch.location("work/acme");
    // Written by hand: the shell never writes an entry without one on Unix.
    let list = json!({"version": 1, "folders": [{"location": acme}]});
    fs::create_dir_all(scratch.path("profile/studio")).expect("the folder can be made");
    fs::write(scratch.list_file(), list.to_string()).expect("the file can be written");

    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &acme), Err("folder_changed"));
    assert!(!shell.is_open(&acme));
    assert_eq!(scratch.list().locations(), [acme]);
}

#[test]
fn trust_grants_read_a_list_longer_than_the_cap_capped() {
    let scratch = Scratch::new("long-list");
    let picked = Shell::start().pick(&scratch, "work/acme");
    let entry = fs::read_to_string(scratch.list_file()).expect("the list was written");
    let entry: serde_json::Value = serde_json::from_str(&entry).expect("the list is JSON");
    let entry = entry["folders"][0].clone();
    // Nine other entries first, then the real pick as the tenth.
    let mut folders: Vec<_> = (0..MAX_PICKED_FOLDERS)
        .map(|number| json!({"location": format!("/nowhere/{number}")}))
        .collect();
    folders.push(entry);
    let list = json!({"version": 1, "folders": folders});
    fs::write(scratch.list_file(), list.to_string()).expect("the file can be written");

    assert_eq!(scratch.list().locations().len(), MAX_PICKED_FOLDERS);
    let shell = Shell::start();
    assert_eq!(shell.reopen(&scratch, &picked), Err("not_picked"));
    assert!(!shell.is_open(&picked));
}

#[test]
fn trust_grants_remember_the_most_recent_picks_only() {
    let scratch = Scratch::new("most-recent");
    let shell = Shell::start();
    let mut picked = Vec::new();
    for number in 0..=MAX_PICKED_FOLDERS {
        let folder = format!("work/many/{number}");
        fs::create_dir_all(scratch.path(&folder)).expect("the folder can be made");
        picked.push(shell.pick(&scratch, &folder));
    }
    // Picking a folder again moves it to the top, without a second entry.
    let again = shell.pick(&scratch, "work/many/5");

    let mut expected: Vec<String> = picked.iter().rev().cloned().collect();
    expected.retain(|location| *location != again);
    expected.insert(0, again);
    expected.truncate(MAX_PICKED_FOLDERS);
    assert_eq!(scratch.list().locations(), expected);
    assert!(!expected.contains(&picked[0]), "the oldest pick is dropped");
    // Reopening a folder moves it first too, as Recent moves its row.
    let reopened = picked[3].clone();
    assert_eq!(Shell::start().reopen(&scratch, &reopened), Ok(()));
    assert_eq!(scratch.list().locations()[0], reopened);
    assert_eq!(scratch.list().locations().len(), MAX_PICKED_FOLDERS);
    // No temporary file stays behind next to the list.
    let names: Vec<_> = fs::read_dir(scratch.path("profile/studio"))
        .expect("the folder exists")
        .map(|entry| entry.expect("an entry").file_name())
        .collect();
    assert_eq!(names, ["picked-folders.json"]);
}
