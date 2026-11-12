//! The helper's steps against a pretend Windows. Each test's name starts
//! with the requirement it proves (`sandbox_elevate_`).

use halonic_sandbox_elevate::{
    FOLDER, Machine, PROGRAM, SRT_WIN, Value, Verb, code, run, sha256_hex, uninstall_entry, verb,
};
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};

const SHIPPED: &[u8] = b"srt-win as shipped";
const SWAPPED: &[u8] = b"srt-win from someone else";

fn app() -> PathBuf {
    PathBuf::from("user-app-folder")
}

fn folder() -> PathBuf {
    PathBuf::from("program-files").join(FOLDER)
}

fn system() -> PathBuf {
    PathBuf::from("system32")
}

struct Pretend {
    elevated: bool,
    own: PathBuf,
    folder_fails: bool,
    exit: i32,
    files: RefCell<BTreeMap<PathBuf, Vec<u8>>>,
    runs: RefCell<Vec<(PathBuf, Vec<String>, PathBuf)>>,
    entry: RefCell<Option<Vec<(&'static str, Value)>>>,
}

impl Pretend {
    /// A helper started from `from`, with `srt_win` next to it.
    fn new(from: PathBuf, srt_win: Option<&[u8]>) -> Self {
        let mut files = BTreeMap::new();
        files.insert(from.join(PROGRAM), b"helper".to_vec());
        if let Some(bytes) = srt_win {
            files.insert(from.join(SRT_WIN), bytes.to_vec());
        }
        Pretend {
            elevated: true,
            own: from.join(PROGRAM),
            folder_fails: false,
            exit: 0,
            files: RefCell::new(files),
            runs: RefCell::new(Vec::new()),
            entry: RefCell::new(None),
        }
    }

    fn run(&self, verb: Verb) -> i32 {
        run(verb, self, &sha256_hex(SHIPPED))
    }

    fn file(&self, path: PathBuf) -> Option<Vec<u8>> {
        self.files.borrow().get(&path).cloned()
    }

    fn ran(&self) -> Vec<(PathBuf, Vec<String>, PathBuf)> {
        self.runs.borrow().clone()
    }
}

impl Machine for Pretend {
    fn elevated(&self) -> bool {
        self.elevated
    }
    fn program_files(&self) -> io::Result<PathBuf> {
        Ok(PathBuf::from("program-files"))
    }
    fn system_folder(&self) -> io::Result<PathBuf> {
        Ok(system())
    }
    fn own_path(&self) -> io::Result<PathBuf> {
        Ok(self.own.clone())
    }
    fn protect_folder(&self, _folder: &Path) -> io::Result<()> {
        if self.folder_fails {
            Err(io::Error::other("denied"))
        } else {
            Ok(())
        }
    }
    fn replace_file(&self, from: &Path, to: &Path) -> io::Result<()> {
        let bytes = self
            .file(from.to_path_buf())
            .ok_or(io::ErrorKind::NotFound)?;
        self.files.borrow_mut().insert(to.to_path_buf(), bytes);
        Ok(())
    }
    fn read(&self, file: &Path) -> io::Result<Vec<u8>> {
        self.file(file.to_path_buf())
            .ok_or(io::ErrorKind::NotFound.into())
    }
    fn exists(&self, file: &Path) -> bool {
        self.files.borrow().contains_key(file)
    }
    fn run(&self, program: &Path, args: &[&str], folder: &Path) -> io::Result<i32> {
        let args = args.iter().map(|arg| (*arg).to_string()).collect();
        self.runs
            .borrow_mut()
            .push((program.to_path_buf(), args, folder.to_path_buf()));
        Ok(self.exit)
    }
    fn write_entry(&self, values: &[(&'static str, Value)]) -> io::Result<()> {
        *self.entry.borrow_mut() = Some(values.to_vec());
        Ok(())
    }
    fn delete_entry(&self) -> io::Result<()> {
        *self.entry.borrow_mut() = None;
        Ok(())
    }
    fn delete(&self, path: &Path) {
        self.files.borrow_mut().remove(path);
    }
}

#[test]
fn sandbox_elevate_reads_one_fixed_verb_and_nothing_else() {
    let args = |list: &[&str]| list.iter().map(OsString::from).collect::<Vec<_>>();
    assert_eq!(verb(&args(&["setup"])), Some(Verb::SetUp));
    assert_eq!(verb(&args(&["remove"])), Some(Verb::Remove));
    assert_eq!(verb(&args(&[])), None);
    assert_eq!(verb(&args(&["setup", "--allow-loopback"])), None);
    assert_eq!(verb(&args(&["install"])), None);
    assert_eq!(verb(&args(&["SETUP"])), None);
}

#[test]
fn sandbox_elevate_sets_up_from_the_checked_copy_in_the_admin_only_folder() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::OK);
    // srt-win runs from the copy, with fixed arguments, in System32.
    assert_eq!(
        machine.ran(),
        vec![(folder().join(SRT_WIN), vec!["install".into()], system())]
    );
    assert_eq!(
        machine.file(folder().join(SRT_WIN)).as_deref(),
        Some(SHIPPED)
    );
    // The helper copies itself there for Installed apps.
    assert_eq!(
        machine.file(folder().join(PROGRAM)).as_deref(),
        Some(&b"helper"[..])
    );
    assert_eq!(
        machine.entry.borrow().clone(),
        Some(uninstall_entry(&folder()))
    );
}

#[test]
fn sandbox_elevate_refuses_a_swapped_srt_win_and_deletes_the_copy() {
    let machine = Pretend::new(app(), Some(SWAPPED));
    assert_eq!(machine.run(Verb::SetUp), code::WRONG_SRT_WIN);
    assert!(machine.ran().is_empty());
    assert_eq!(machine.file(folder().join(SRT_WIN)), None);
    assert_eq!(*machine.entry.borrow(), None);
}

#[test]
fn sandbox_elevate_stops_without_administrator_rights_rather_than_ask_twice() {
    let mut machine = Pretend::new(app(), Some(SHIPPED));
    machine.elevated = false;
    assert_eq!(machine.run(Verb::SetUp), code::NOT_ELEVATED);
    assert!(machine.ran().is_empty());
    assert_eq!(machine.file(folder().join(SRT_WIN)), None);
}

#[test]
fn sandbox_elevate_says_when_srt_win_or_the_folder_is_missing() {
    let machine = Pretend::new(app(), None);
    assert_eq!(machine.run(Verb::SetUp), code::NO_SRT_WIN);
    let mut machine = Pretend::new(app(), Some(SHIPPED));
    machine.folder_fails = true;
    assert_eq!(machine.run(Verb::SetUp), code::FOLDER);
    assert!(machine.ran().is_empty());
}

#[test]
fn sandbox_elevate_passes_srt_wins_exit_code_on_and_adds_no_entry_after_a_failure() {
    let mut machine = Pretend::new(app(), Some(SHIPPED));
    machine.exit = 12;
    assert_eq!(machine.run(Verb::SetUp), 12);
    assert_eq!(*machine.entry.borrow(), None);
}

#[test]
fn sandbox_elevate_removes_from_installed_apps_with_the_copy_it_left() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::OK);
    // Installed apps starts the copy in the admin-only folder.
    let mut from_installed_apps = Pretend::new(folder(), Some(SHIPPED));
    from_installed_apps.files = machine.files;
    from_installed_apps.entry = machine.entry;
    assert_eq!(from_installed_apps.run(Verb::Remove), code::OK);
    assert_eq!(
        from_installed_apps.ran(),
        vec![(folder().join(SRT_WIN), vec!["uninstall".into()], system())]
    );
    assert_eq!(*from_installed_apps.entry.borrow(), None);
    assert_eq!(from_installed_apps.file(folder().join(SRT_WIN)), None);
    assert_eq!(from_installed_apps.file(folder().join(PROGRAM)), None);
}

#[test]
fn sandbox_elevate_keeps_the_entry_when_srt_win_refuses_to_remove() {
    let mut machine = Pretend::new(app(), Some(SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::OK);
    machine.exit = 1;
    assert_eq!(machine.run(Verb::Remove), 1);
    assert_eq!(
        machine.entry.borrow().clone(),
        Some(uninstall_entry(&folder()))
    );
    assert_eq!(
        machine.file(folder().join(SRT_WIN)).as_deref(),
        Some(SHIPPED)
    );
}

#[test]
fn sandbox_elevate_names_halonic_in_installed_apps() {
    let entry = uninstall_entry(&folder());
    let text = |name: &str| {
        entry
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.clone())
    };
    assert_eq!(
        text("DisplayName"),
        Some(Value::Text("Halonic agent sandbox".into()))
    );
    assert_eq!(text("Publisher"), Some(Value::Text("Halonic".into())));
    assert_eq!(
        text("UninstallString"),
        Some(Value::Text(format!(
            "\"{}\" remove",
            folder().join(PROGRAM).display()
        )))
    );
}
