//! Making a new workspace folder (HAL-8745) on real folders in a scratch
//! folder. Requirement `trust-grants`.

use std::fs;
use std::path::{Path, PathBuf};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_grant::{FolderProbe, PickedFolders, TrustState};

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

    fn probe(
        &self,
        scratch: &Scratch,
        parent: &str,
        name: &str,
    ) -> Result<FolderProbe, &'static str> {
        self.state
            .probe_workspace(Some(&scratch.path("documents")), |_| false, parent, name)
            .map_err(|refusal| refusal.kind())
    }

    fn open(
        &self,
        scratch: &Scratch,
        parent: &str,
        name: &str,
        ask: impl FnOnce(&str) -> bool,
    ) -> Result<Option<String>, &'static str> {
        self.open_with(scratch, |_| false, parent, name, ask)
    }

    fn open_with(
        &self,
        scratch: &Scratch,
        fenced: impl Fn(&Path) -> bool,
        parent: &str,
        name: &str,
        ask: impl FnOnce(&str) -> bool,
    ) -> Result<Option<String>, &'static str> {
        self.state
            .open_workspace(
                &self.folders,
                &scratch.list(),
                Some(&scratch.path("documents")),
                fenced,
                parent,
                name,
                ask,
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
fn trust_grants_refuse_a_name_that_is_the_profiles_own_folder() {
    let scratch = Scratch::new("profile-name");
    let shell = Shell::start();
    let projects = shell.choose_parent(&scratch, "projects");
    let profile_here = fs::canonicalize(scratch.path("projects"))
        .unwrap()
        .join("Cfg");

    let refused = shell.create_with(
        &scratch,
        None,
        |created| created == profile_here,
        &projects,
        "Cfg",
    );

    assert_eq!(refused, Err("parent_private"));
    assert!(!scratch.path("projects/Cfg").exists());
    assert!(!shell.is_open(&scratch.location("projects")));
}

#[test]
fn trust_grants_creating_a_workspace_opens_it_while_a_dialog_shows() {
    let scratch = Scratch::new("busy");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    let mut made = None;

    // A parent dialog is showing; the folder is still made and opened.
    let _ = shell.state.pick_parent(|| {
        made = Some(shell.create(&scratch, &documents, "Acme"));
        None
    });

    let made = made.unwrap().expect("it is made, not refused as busy");
    assert!(shell.is_open(&made));
    assert_eq!(scratch.list().locations(), vec![made]);
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

#[test]
fn trust_grants_probe_says_what_is_in_a_folder_by_its_names() {
    let scratch = Scratch::new("probe");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Empty")).unwrap();
    fs::create_dir(scratch.path("documents/Files")).unwrap();
    fs::write(scratch.path("documents/Files/notes.txt"), "keep").unwrap();
    fs::create_dir(scratch.path("documents/Work")).unwrap();
    fs::write(scratch.path("documents/Work/workspace.yaml"), "name: x").unwrap();
    fs::write(scratch.path("documents/Work/other.txt"), "y").unwrap();

    assert_eq!(
        shell.probe(&scratch, &documents, "Fresh"),
        Ok(FolderProbe::New)
    );
    assert_eq!(
        shell.probe(&scratch, &documents, "Empty"),
        Ok(FolderProbe::Empty)
    );
    assert_eq!(
        shell.probe(&scratch, &documents, "Files"),
        Ok(FolderProbe::Files)
    );
    assert_eq!(
        shell.probe(&scratch, &documents, "Work"),
        Ok(FolderProbe::Workspace)
    );
    // Looking opens nothing, remembers nothing and changes nothing.
    assert!(!shell.is_open(&scratch.location("documents/Work")));
    assert!(scratch.list().locations().is_empty());
    assert!(!scratch.path("documents/Fresh").exists());
}

#[test]
fn trust_grants_probe_answers_as_the_words_the_page_reads() {
    let words: Vec<String> = [
        FolderProbe::New,
        FolderProbe::Empty,
        FolderProbe::Files,
        FolderProbe::Workspace,
    ]
    .iter()
    .map(|probe| serde_json::to_string(probe).unwrap())
    .collect();
    assert_eq!(
        words,
        ["\"new\"", "\"empty\"", "\"files\"", "\"workspace\""]
    );
}

#[test]
fn trust_grants_probe_makes_the_checks_of_creating() {
    let scratch = Scratch::new("probe-checks");
    let shell = Shell::start();
    let projects = scratch.location("projects");
    let documents = scratch.location("documents");

    assert_eq!(
        shell.probe(&scratch, &projects, "Acme"),
        Err("parent_not_chosen")
    );
    assert_eq!(
        shell.probe(&scratch, &documents, "a/b"),
        Err("name_invalid")
    );
    let gone = scratch.path("gone").display().to_string();
    assert_eq!(shell.probe(&scratch, &gone, "Acme"), Err("folder_missing"));
    let chosen = shell.choose_parent(&scratch, "projects");
    assert_eq!(shell.probe(&scratch, &chosen, "Acme"), Ok(FolderProbe::New));
    let profile_here = fs::canonicalize(scratch.path("projects"))
        .unwrap()
        .join("Cfg");
    assert_eq!(
        shell
            .state
            .probe_workspace(None, |target| target == profile_here, &chosen, "Cfg")
            .map_err(|r| r.kind()),
        Err("parent_private")
    );
}

#[cfg(unix)]
#[test]
fn trust_grants_probe_never_follows_a_link_out_of_the_parent() {
    let scratch = Scratch::new("probe-link");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("projects/Secret")).unwrap();
    std::os::unix::fs::symlink(
        scratch.path("projects/Secret"),
        scratch.path("documents/Out"),
    )
    .unwrap();
    fs::write(scratch.path("documents/File"), "a file").unwrap();

    assert_eq!(shell.probe(&scratch, &documents, "Out"), Err("exists"));
    assert_eq!(shell.probe(&scratch, &documents, "File"), Err("exists"));
    assert_eq!(
        shell.open(&scratch, &documents, "Out", |_| panic!("no question")),
        Err("exists")
    );
}

#[test]
fn trust_grants_open_asks_the_trust_question_then_opens_and_remembers() {
    let scratch = Scratch::new("open");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();
    fs::write(scratch.path("documents/Mine/workspace.yaml"), "name: x").unwrap();
    let mine = scratch.location("documents/Mine");
    let mut shown = None;

    let opened = shell
        .open(&scratch, &documents, "Mine", |question| {
            // It is closed while the question shows.
            assert!(!shell.is_open(&mine));
            shown = Some(question.to_owned());
            true
        })
        .expect("it opens");

    assert_eq!(opened, Some(mine.clone()));
    assert_eq!(shown, Some(halonic_trust_grant::question_text(&mine)));
    assert!(shell.is_open(&mine));
    assert_eq!(scratch.list().locations(), vec![mine]);
    // No trust record is written.
    let store = halonic_trust_store::FileTrustStore::new(scratch.path("profile/trust"));
    assert!(store.get(&opened.unwrap()).unwrap().is_none());
}

#[test]
fn trust_grants_open_answers_null_when_the_person_says_no() {
    let scratch = Scratch::new("open-no");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();

    assert_eq!(
        shell.open(&scratch, &documents, "Mine", |_| false),
        Ok(None)
    );
    assert!(!shell.is_open(&scratch.location("documents/Mine")));
    assert!(scratch.list().locations().is_empty());
}

#[test]
fn trust_grants_open_refuses_before_asking() {
    let scratch = Scratch::new("open-refused");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    let projects = scratch.location("projects");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();
    fs::create_dir(scratch.path("projects/Mine")).unwrap();
    let no_question = |_: &str| -> bool { panic!("no question is asked") };

    assert_eq!(
        shell.open(&scratch, &projects, "Mine", no_question),
        Err("parent_not_chosen")
    );
    assert_eq!(
        shell.open(&scratch, &documents, "..", no_question),
        Err("name_invalid")
    );
    assert_eq!(
        shell.open(&scratch, &documents, "Nope", no_question),
        Err("folder_missing")
    );
    let mine = fs::canonicalize(scratch.path("documents"))
        .unwrap()
        .join("Mine");
    assert_eq!(
        shell.open_with(
            &scratch,
            |target| target == mine,
            &documents,
            "Mine",
            no_question
        ),
        Err("parent_private")
    );
}

#[test]
fn trust_grants_open_refuses_while_another_dialog_shows() {
    let scratch = Scratch::new("open-busy");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();
    let mut refused = None;

    let _ = shell.state.pick_parent(|| {
        refused = Some(shell.open(&scratch, &documents, "Mine", |_| panic!("no question")));
        None
    });

    assert_eq!(refused, Some(Err("busy")));
    // And the question holds the turn: a pick can't show over it.
    let mut pick = None;
    let _ = shell.open(&scratch, &documents, "Mine", |_| {
        pick = Some(shell.state.pick_parent(|| None).map_err(|r| r.kind()));
        false
    });
    assert_eq!(pick, Some(Err("busy")));
}

#[test]
fn trust_grants_open_refuses_a_folder_that_changed_while_the_question_showed() {
    let scratch = Scratch::new("open-changed");
    let shell = Shell::start();
    let documents = scratch.location("documents");
    fs::create_dir(scratch.path("documents/Mine")).unwrap();

    // Gone while the question showed.
    let gone = shell.open(&scratch, &documents, "Mine", |_| {
        fs::remove_dir(scratch.path("documents/Mine")).unwrap();
        true
    });
    assert_eq!(gone, Err("folder_changed"));

    // Replaced by a file.
    fs::create_dir(scratch.path("documents/Mine")).unwrap();
    let file = shell.open(&scratch, &documents, "Mine", |_| {
        fs::remove_dir(scratch.path("documents/Mine")).unwrap();
        fs::write(scratch.path("documents/Mine"), "now a file").unwrap();
        true
    });
    assert_eq!(file, Err("folder_changed"));
    fs::remove_file(scratch.path("documents/Mine")).unwrap();

    // Replaced by a link to another folder.
    #[cfg(unix)]
    {
        fs::create_dir(scratch.path("documents/Mine")).unwrap();
        let link = shell.open(&scratch, &documents, "Mine", |_| {
            fs::remove_dir(scratch.path("documents/Mine")).unwrap();
            std::os::unix::fs::symlink(scratch.path("projects"), scratch.path("documents/Mine"))
                .unwrap();
            true
        });
        assert_eq!(link, Err("folder_changed"));
        assert!(!shell.is_open(&scratch.location("projects")));
    }
    assert!(scratch.list().locations().is_empty());
}
