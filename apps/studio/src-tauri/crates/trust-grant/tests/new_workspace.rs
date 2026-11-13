//! Making a new workspace folder (HAL-8745) on real folders in a scratch
//! folder. Requirement `trust-grants`.

use std::fs;
use std::path::{Path, PathBuf};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_grant::{PickedFolders, TrustState};

/// Folders of its own for one test: `documents`, `projects`, `profile`.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("new-workspace-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for folder in ["documents", "projects", "profile/studio"] {
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

    fn list(&self) -> PickedFolders {
        PickedFolders::new(self.path("profile/studio/picked-folders.json"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

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

    fn choose_parent(&self, scratch: &Scratch, folder: &str) -> String {
        self.state
            .pick_parent(|| Some(scratch.path(folder)))
            .expect("choosing works")
            .expect("a folder was chosen")
    }

    fn create(&self, scratch: &Scratch, parent: &str, name: &str) -> Result<String, &'static str> {
        self.create_with(
            scratch,
            Some(&scratch.path("documents")),
            |_| false,
            parent,
            name,
        )
    }

    fn create_with(
        &self,
        scratch: &Scratch,
        documents: Option<&Path>,
        fenced: impl FnOnce(&Path) -> bool,
        parent: &str,
        name: &str,
    ) -> Result<String, &'static str> {
        self.state
            .create_workspace(
                &self.folders,
                &scratch.list(),
                documents,
                fenced,
                parent,
                name,
            )
            .map_err(|refusal| refusal.kind())
    }

    fn is_open(&self, location: &str) -> bool {
        self.folders.check(Path::new(location)).is_ok()
    }
}

#[test]
fn trust_grants_create_a_workspace_in_documents_and_open_it() {
    let scratch = Scratch::new("documents");
    let shell = Shell::start();
    let documents = scratch.location("documents");

    let made = shell
        .create(&scratch, &documents, " Acme ")
        .expect("it is made");

    assert_eq!(made, scratch.location("documents/Acme"));
    assert!(scratch.path("documents/Acme").is_dir());
    assert!(shell.is_open(&made));
    // It is remembered as a pick is, so it shows in Recent and reopens.
    assert_eq!(scratch.list().locations(), vec![made.clone()]);
    assert_eq!(
        Shell::start()
            .state
            .reopen(&OpenedFolders::new(), &scratch.list(), &made)
            .map_err(|r| r.kind()),
        Ok(())
    );
}

#[test]
fn trust_grants_create_a_workspace_in_a_parent_chosen_this_session() {
    let scratch = Scratch::new("chosen");
    let shell = Shell::start();
    let projects = shell.choose_parent(&scratch, "projects");

    let made = shell
        .create(&scratch, &projects, "Books")
        .expect("it is made");

    assert_eq!(made, scratch.location("projects/Books"));
    assert!(shell.is_open(&made));
}

#[test]
fn trust_grants_choosing_a_parent_neither_opens_nor_remembers_it() {
    let scratch = Scratch::new("parent-stays-closed");
    let shell = Shell::start();
    let projects = shell.choose_parent(&scratch, "projects");

    assert_eq!(projects, scratch.location("projects"));
    assert!(!shell.is_open(&projects));
    assert!(scratch.list().locations().is_empty());
    assert!(!scratch.path("profile/studio/picked-folders.json").exists());
    // A parent that wasn't chosen doesn't open either: no pick, no trust.
    let cancelled = shell.state.pick_parent(|| None).expect("cancelling works");
    assert_eq!(cancelled, None);
}

#[test]
fn trust_grants_refuse_a_parent_the_person_didnt_choose() {
    let scratch = Scratch::new("not-chosen");
    let shell = Shell::start();
    let projects = scratch.location("projects");

    assert_eq!(
        shell.create(&scratch, &projects, "Acme"),
        Err("parent_not_chosen")
    );
    assert!(!scratch.path("projects/Acme").exists());

    // Inside Documents isn't Documents; a chosen parent's child isn't chosen.
    fs::create_dir(scratch.path("documents/sub")).unwrap();
    let sub = scratch.location("documents/sub");
    assert_eq!(
        shell.create(&scratch, &sub, "Acme"),
        Err("parent_not_chosen")
    );
    // With no Documents folder, only chosen parents work.
    let documents = scratch.location("documents");
    assert_eq!(
        shell.create_with(&scratch, None, |_| false, &documents, "Acme"),
        Err("parent_not_chosen")
    );
    // A parent chosen in an earlier session is forgotten.
    Shell::start().choose_parent(&scratch, "projects");
    assert_eq!(
        shell.create(&scratch, &projects, "Acme"),
        Err("parent_not_chosen")
    );
}

#[cfg(unix)]
#[test]
fn trust_grants_compare_the_parents_real_path_not_its_text() {
    let scratch = Scratch::new("link-parent");
    let shell = Shell::start();
    let projects = shell.choose_parent(&scratch, "projects");
    // A link to the chosen folder is the chosen folder.
    std::os::unix::fs::symlink(scratch.path("projects"), scratch.path("alias")).unwrap();
    let alias = scratch.path("alias").display().to_string();
    assert_eq!(
        shell
            .create(&scratch, &alias, "Via link")
            .map(|made| made.starts_with(&projects)),
        Ok(true)
    );
    // A link to a folder that wasn't chosen isn't.
    std::os::unix::fs::symlink(scratch.path("profile"), scratch.path("to-profile")).unwrap();
    let to_profile = scratch.path("to-profile").display().to_string();
    assert_eq!(
        shell.create(&scratch, &to_profile, "Acme"),
        Err("parent_not_chosen")
    );
    // `..` goes the same way.
    let dotted = format!("{projects}/../profile");
    assert_eq!(
        shell.create(&scratch, &dotted, "Acme"),
        Err("parent_not_chosen")
    );
}

#[test]
fn trust_grants_refuse_a_parent_the_profile_holds() {
    let scratch = Scratch::new("profile-parent");
    let shell = Shell::start();
    let profile = shell.choose_parent(&scratch, "profile");
    let profile_path = fs::canonicalize(scratch.path("profile")).unwrap();

    let refused = shell.create_with(
        &scratch,
        None,
        |parent| parent.starts_with(&profile_path),
        &profile,
        "Acme",
    );

    assert_eq!(refused, Err("parent_private"));
    assert!(!scratch.path("profile/Acme").exists());
    assert!(!shell.is_open(&scratch.location("profile")));
}

#[test]
fn trust_grants_never_adopt_a_folder_that_exists() {
    let scratch = Scratch::new("exists");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();
    fs::write(scratch.path("documents/Mine/notes.txt"), "keep").unwrap();
    fs::write(scratch.path("documents/File"), "a file").unwrap();

    assert_eq!(shell.create(&scratch, &documents, "Mine"), Err("exists"));
    assert_eq!(shell.create(&scratch, &documents, "File"), Err("exists"));
    assert!(!shell.is_open(&scratch.location("documents/Mine")));
    assert!(scratch.list().locations().is_empty());
    assert_eq!(
        fs::read_to_string(scratch.path("documents/Mine/notes.txt")).unwrap(),
        "keep"
    );
}

#[test]
fn trust_grants_refuse_a_bad_name_before_touching_the_disk() {
    let scratch = Scratch::new("bad-name");
    let shell = Shell::start();
    let documents = scratch.location("documents");

    for name in ["", "..", "a/b", "a\\b", "CON", "x."] {
        assert_eq!(
            shell.create(&scratch, &documents, name),
            Err("name_invalid"),
            "{name:?}"
        );
    }
    assert_eq!(fs::read_dir(scratch.path("documents")).unwrap().count(), 0);
    assert!(!scratch.path("Acme").exists());
}

#[test]
fn trust_grants_refuse_a_parent_that_is_missing_or_a_file() {
    let scratch = Scratch::new("missing-parent");
    let shell = Shell::start();
    let missing = scratch.path("gone").display().to_string();
    assert_eq!(
        shell.create(&scratch, &missing, "Acme"),
        Err("folder_missing")
    );
    fs::write(scratch.path("file"), "x").unwrap();
    let file = scratch.path("file").display().to_string();
    assert_eq!(
        shell.create(&scratch, &file, "Acme"),
        Err("folder_unreadable")
    );
}

#[test]
fn trust_grants_creating_a_workspace_spares_a_grant_inside_it_the_question() {
    let scratch = Scratch::new("grant-inside");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    let made = shell.create(&scratch, &documents, "Acme").unwrap();
    fs::create_dir(scratch.path("documents/Acme/sub")).unwrap();
    let sub = scratch.location("documents/Acme/sub");
    let store = halonic_trust_store::FileTrustStore::new(scratch.path("profile/trust"));
    // The shell wrote no record for the new folder itself.
    assert!(store.get(&made).unwrap().is_none());
    let granted = shell.state.grant(
        &store,
        &shell.folders,
        &serde_json::json!({"location": sub, "pins": {}}),
        |_| panic!("no question inside a picked folder"),
    );
    assert!(granted.is_ok());
}
