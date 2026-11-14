//! Looking into a folder that exists and opening it after the shell asks
//! (HAL-8859), on real folders in a scratch folder. Requirement `trust-grants`.

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
