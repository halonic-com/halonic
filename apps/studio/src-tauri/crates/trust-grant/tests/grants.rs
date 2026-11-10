//! The rules for which folder a grant may open, on real folders in a
//! scratch folder. Requirement `trust-grants`.

use std::fs;
use std::path::{MAIN_SEPARATOR, Path, PathBuf};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_grant::{TrustState, question_text};
use halonic_trust_store::FileTrustStore;
use serde_json::{Value, json};

/// Folders of its own for one test, under the system's temporary folder,
/// removed when the test ends: `work/acme/hubs`, `work/acme-evil` and
/// `work/other/skills`, and a profile for the records.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root = std::env::temp_dir().join(format!("trust-grants-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        for folder in ["work/acme/hubs", "work/acme-evil", "work/other/skills"] {
            fs::create_dir_all(root.join(folder)).expect("the scratch folders can be created");
        }
        Self(root)
    }

    fn path(&self, folder: &str) -> PathBuf {
        self.0.join(folder)
    }

    /// A folder's location as a grant must give it: canonical, in plain form.
    fn location(&self, folder: &str) -> String {
        let canonical = fs::canonicalize(self.path(folder)).expect("the folder exists");
        plain_path(&canonical)
            .into_string()
            .expect("a Unicode path")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// The shell's trust state, its store and its opened folders, after the
/// person picked `work/acme` in the folder dialog.
struct Shell {
    scratch: Scratch,
    state: TrustState,
    store: FileTrustStore,
    folders: OpenedFolders,
}

impl Shell {
    fn with_acme_picked(name: &str) -> Self {
        let scratch = Scratch::new(name);
        let state = TrustState::default();
        let folders = OpenedFolders::new();
        let picked = state
            .pick(&folders, || Some(scratch.path("work/acme")))
            .expect("picking a folder works");
        assert_eq!(picked, Some(scratch.location("work/acme")));
        let store = FileTrustStore::new(scratch.path("profile").join("trust"));
        Self {
            scratch,
            state,
            store,
            folders,
        }
    }

    fn location(&self, folder: &str) -> String {
        self.scratch.location(folder)
    }

    /// Grants `record`, answering the question with `answer`. Gives the
    /// refusal's kind, if any, and the questions the shell asked.
    fn grant_record(
        &self,
        record: &Value,
        answer: bool,
    ) -> (Result<(), &'static str>, Vec<String>) {
        let mut asked = Vec::new();
        let result = self
            .state
            .grant(&self.store, &self.folders, record, |question| {
                asked.push(question.to_owned());
                answer
            });
        (result.map_err(|refusal| refusal.kind()), asked)
    }

    fn grant(&self, location: &str, answer: bool) -> (Result<(), &'static str>, Vec<String>) {
        self.grant_record(&record(location), answer)
    }

    fn revoke(&self, location: &str) {
        self.state
            .revoke(&self.store, &self.folders, location)
            .expect("revoking works");
    }

    fn is_open(&self, location: &str) -> bool {
        self.folders.check(Path::new(location)).is_ok()
    }

    fn is_saved(&self, location: &str) -> bool {
        self.store
            .get(location)
            .expect("the record can be read")
            .is_some()
    }
}

fn record(location: &str) -> Value {
    json!({"location": location, "pins": {}})
}

#[test]
fn trust_grants_grant_a_folder_inside_a_picked_one_without_asking() {
    let shell = Shell::with_acme_picked("inside-picked");
    let hubs = shell.location("work/acme/hubs");
    let (result, asked) = shell.grant(&hubs, false);
    assert_eq!(result, Ok(()));
    assert!(asked.is_empty(), "{asked:?}");
    assert!(shell.is_saved(&hubs));
    assert!(shell.is_open(&hubs));
}

#[test]
fn trust_grants_ask_about_any_other_folder_showing_its_path() {
    let shell = Shell::with_acme_picked("other-folder");
    for folder in ["work/other", "work/acme-evil"] {
        let location = shell.location(folder);
        assert!(
            !shell.is_open(&location),
            "{folder} is open before the grant"
        );
        let (result, asked) = shell.grant(&location, true);
        assert_eq!(result, Ok(()), "{folder}");
        assert_eq!(asked, [question_text(&location)], "{folder}");
        assert!(shell.is_saved(&location), "{folder}");
        assert!(shell.is_open(&location), "{folder}");
    }
}

#[test]
fn trust_grants_ask_again_inside_a_folder_a_grant_opened() {
    let shell = Shell::with_acme_picked("inside-granted");
    assert_eq!(shell.grant(&shell.location("work/other"), true).0, Ok(()));
    let skills = shell.location("work/other/skills");
    let (result, asked) = shell.grant(&skills, true);
    assert_eq!(result, Ok(()));
    assert_eq!(asked, [question_text(&skills)]);
}

#[test]
fn trust_grants_save_and_open_nothing_when_the_person_declines() {
    let shell = Shell::with_acme_picked("declined");
    let other = shell.location("work/other");
    let (result, asked) = shell.grant(&other, false);
    assert_eq!(result, Err("declined"));
    assert_eq!(asked.len(), 1);
    assert!(!shell.is_saved(&other));
    assert!(!shell.is_open(&other));
}

#[test]
fn trust_grants_refuse_a_location_that_isnt_canonical() {
    let shell = Shell::with_acme_picked("not-canonical");
    let acme = shell.location("work/acme");
    let mut locations = vec![
        format!("{acme}{MAIN_SEPARATOR}..{MAIN_SEPARATOR}other"),
        format!("{acme}{MAIN_SEPARATOR}.{MAIN_SEPARATOR}hubs"),
        format!("{acme}{MAIN_SEPARATOR}"),
        // Relative: the tests run in the package folder, which has `src`.
        "src".to_owned(),
    ];
    if cfg!(windows) {
        locations.push(format!(r"\\?\{acme}"));
        locations.push(acme.replace('\\', "/"));
    }
    for location in locations {
        let (result, asked) = shell.grant(&location, true);
        assert_eq!(result, Err("invalid_record"), "{location}");
        assert!(asked.is_empty(), "{location}: {asked:?}");
        assert!(!shell.is_saved(&location), "{location}");
    }
}

#[cfg(unix)]
#[test]
fn trust_grants_judge_a_link_by_where_it_leads() {
    let shell = Shell::with_acme_picked("links");
    // A link inside the picked folder to a folder outside it.
    let link = shell.scratch.path("work/acme/link");
    std::os::unix::fs::symlink(shell.scratch.path("work/other"), &link)
        .expect("the link can be made");
    let through_link = format!("{}/link", shell.location("work/acme"));
    assert_eq!(shell.grant(&through_link, true).0, Err("invalid_record"));
    assert!(!shell.is_open(&shell.location("work/other")));
    // Given where it leads, the shell asks, showing that folder.
    let other = shell.location("work/other");
    let (result, asked) = shell.grant(&other, true);
    assert_eq!(result, Ok(()));
    assert_eq!(asked, [question_text(&other)]);
}

/// Swaps the scratch folder `folder` for a link to `target`, as the page
/// could with `git switch` in a folder it may already run git in.
#[cfg(unix)]
fn swap_for_link(scratch: &Scratch, folder: &str, target: &str) {
    fs::remove_dir_all(scratch.path(folder)).expect("the folder is removed");
    std::os::unix::fs::symlink(scratch.path(target), scratch.path(folder))
        .expect("the link can be made");
}

#[cfg(unix)]
#[test]
fn trust_grants_open_the_checked_folder_even_if_a_link_is_swapped_in_while_asking() {
    let shell = Shell::with_acme_picked("swap-while-asking");
    fs::create_dir_all(shell.scratch.path("home")).expect("home can be made");
    let other = shell.location("work/other");
    let result = shell
        .state
        .grant(&shell.store, &shell.folders, &record(&other), |_| {
            swap_for_link(&shell.scratch, "work/other", "home");
            true
        });
    assert!(result.is_ok());
    assert!(!shell.is_open(&shell.location("home")));
}

#[cfg(unix)]
#[test]
fn trust_grants_revoke_the_folder_that_opened_even_if_a_link_is_swapped_in() {
    let shell = Shell::with_acme_picked("swap-before-revoke");
    let other = shell.location("work/other");
    assert_eq!(shell.grant(&other, true).0, Ok(()));
    swap_for_link(&shell.scratch, "work/other", "work/acme");
    shell.revoke(&other);
    assert!(!shell.is_saved(&other));
    // The picked folder the link leads to stays open and picked.
    let hubs = shell.location("work/acme/hubs");
    assert!(shell.is_open(&hubs));
    assert!(shell.grant(&hubs, true).1.is_empty());
    // And the folder that opened is closed.
    fs::remove_file(shell.scratch.path("work/other")).expect("the link is removed");
    fs::create_dir(shell.scratch.path("work/other")).expect("the folder is made again");
    assert!(!shell.is_open(&other));
}

#[test]
fn trust_grants_refuse_a_folder_that_doesnt_exist_or_is_a_file() {
    let shell = Shell::with_acme_picked("not-a-folder");
    let file = shell.scratch.path("work/acme/notes.md");
    fs::write(&file, "notes").expect("the file can be written");
    let missing = format!("{}{MAIN_SEPARATOR}missing", shell.location("work/acme"));
    let file = format!("{}{MAIN_SEPARATOR}notes.md", shell.location("work/acme"));
    for location in [missing, file, String::new()] {
        let (result, asked) = shell.grant(&location, true);
        assert_eq!(result, Err("folder_unreadable"), "{location}");
        assert!(asked.is_empty(), "{location}");
    }
}

#[test]
fn trust_grants_refuse_a_record_without_a_location_or_too_large() {
    let shell = Shell::with_acme_picked("bad-record");
    let hubs = shell.location("work/acme/hubs");
    let records = [
        json!({"pins": {}}),
        json!({"location": 7}),
        json!(hubs),
        json!({"location": hubs, "padding": "x".repeat(1024 * 1024)}),
    ];
    for record in records {
        assert_eq!(shell.grant_record(&record, true).0, Err("invalid_record"));
    }
    assert!(!shell.is_saved(&hubs));
}

#[test]
fn trust_grants_show_one_dialog_at_a_time() {
    let shell = Shell::with_acme_picked("one-dialog");
    let other = shell.location("work/other");
    let evil = shell.location("work/acme-evil");
    let hubs = shell.location("work/acme/hubs");
    let mut while_asking = Vec::new();
    let result = shell
        .state
        .grant(&shell.store, &shell.folders, &record(&other), |_| {
            // While the question is open, another question or the folder dialog
            // is refused at once; a grant that needs no question goes through.
            while_asking.push(shell.grant(&evil, true).0);
            let picked = shell
                .state
                .pick(&shell.folders, || panic!("no dialog while one is open"));
            while_asking.push(picked.map(|_| ()).map_err(|refusal| refusal.kind()));
            while_asking.push(shell.grant(&hubs, true).0);
            true
        });
    assert!(result.is_ok());
    assert_eq!(while_asking, [Err("busy"), Err("busy"), Ok(())]);
    assert!(!shell.is_saved(&evil));
    // Once the question is answered, the next one shows.
    let (result, asked) = shell.grant(&evil, true);
    assert_eq!(result, Ok(()));
    assert_eq!(asked.len(), 1);
}

#[test]
fn trust_grants_close_a_folder_when_its_trust_is_revoked() {
    let shell = Shell::with_acme_picked("revoke");
    let other = shell.location("work/other");
    assert_eq!(shell.grant(&other, true).0, Ok(()));
    shell.revoke(&other);
    assert!(!shell.is_open(&other));
    assert!(!shell.is_saved(&other));
    // Revoking a folder never granted is no error, and closes nothing else.
    shell.revoke(&shell.location("work/acme-evil"));
    assert!(shell.is_open(&shell.location("work/acme")));
    // A revoked picked folder is closed and no longer spares a question.
    shell.revoke(&shell.location("work/acme"));
    let hubs = shell.location("work/acme/hubs");
    assert!(!shell.is_open(&hubs));
    assert_eq!(shell.grant(&hubs, true).1.len(), 1);
}

#[test]
fn trust_grants_pick_nothing_when_the_person_cancels_the_dialog() {
    let shell = Shell::with_acme_picked("cancel-pick");
    let picked = shell.state.pick(&shell.folders, || None);
    assert_eq!(picked.map_err(|refusal| refusal.kind()), Ok(None));
    assert!(!shell.is_open(&shell.location("work/other")));
}
