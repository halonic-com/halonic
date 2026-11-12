//! A pretend Windows for the helper's steps, shared by the test files.
#![allow(dead_code)]

use halonic_sandbox_elevate::{
    FOLDER, Hashes, Machine, PROGRAM, RUNTIME_SHIPPED, SRT_WIN, Value, Verb, run, sha256_hex,
};
use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};

pub const SHIPPED: &[u8] = b"srt-win as shipped";
pub const SWAPPED: &[u8] = b"srt-win from someone else";
pub const RUNTIME_BYTES: &[u8] = b"the pinned C++ runtime";
pub const HELPER: &[u8] = b"helper";
/// The publisher the pretend release is signed by.
pub const PUBLISHER: &str = "Halonic";

pub fn app() -> PathBuf {
    PathBuf::from("user-app-folder")
}

pub fn folder() -> PathBuf {
    PathBuf::from("program-files").join(FOLDER)
}

pub fn system() -> PathBuf {
    PathBuf::from("system32")
}

/// srt-win's arguments for a removal: the machine-wide half only, so the
/// helper never runs the user's half with administrator rights.
pub fn uninstall_step() -> Vec<String> {
    vec!["uninstall".into(), "--elevated-step".into()]
}

pub struct Pretend {
    pub elevated: bool,
    pub own: PathBuf,
    pub folder_fails: bool,
    pub exit: i32,
    /// [`SIGNER`](halonic_sandbox_elevate::SIGNER) as built in.
    pub signer: Option<&'static str>,
    /// Pairs of names that reach the same file or folder.
    pub same: Vec<(PathBuf, PathBuf)>,
    pub files: RefCell<BTreeMap<PathBuf, Vec<u8>>>,
    /// Files written that Users can't open yet.
    pub private: RefCell<BTreeSet<PathBuf>>,
    /// Every file written, in order.
    pub written: RefCell<Vec<PathBuf>>,
    /// Every file shared with Users, in order.
    pub shared: RefCell<Vec<PathBuf>>,
    pub runs: RefCell<Vec<(PathBuf, Vec<String>, PathBuf)>>,
    pub environments: RefCell<Vec<Vec<(&'static str, OsString)>>>,
    pub protected: RefCell<Vec<PathBuf>>,
    pub deleted: RefCell<Vec<PathBuf>>,
    pub entry: RefCell<Option<Vec<(&'static str, Value)>>>,
}

impl Pretend {
    /// A helper started from `from`, with `srt_win` next to it.
    pub fn new(from: PathBuf, srt_win: Option<&[u8]>) -> Self {
        let mut files = BTreeMap::new();
        files.insert(from.join(PROGRAM), HELPER.to_vec());
        if let Some(bytes) = srt_win {
            files.insert(from.join(SRT_WIN), bytes.to_vec());
            files.insert(from.join(RUNTIME_SHIPPED), RUNTIME_BYTES.to_vec());
        }
        Pretend {
            elevated: true,
            own: from.join(PROGRAM),
            folder_fails: false,
            exit: 0,
            signer: Some(PUBLISHER),
            same: Vec::new(),
            files: RefCell::new(files),
            private: RefCell::new(BTreeSet::new()),
            written: RefCell::new(Vec::new()),
            shared: RefCell::new(Vec::new()),
            runs: RefCell::new(Vec::new()),
            environments: RefCell::new(Vec::new()),
            protected: RefCell::new(Vec::new()),
            deleted: RefCell::new(Vec::new()),
            entry: RefCell::new(None),
        }
    }

    pub fn run(&self, verb: Verb) -> i32 {
        let (srt_win, runtime) = (sha256_hex(SHIPPED), sha256_hex(RUNTIME_BYTES));
        let hashes = Hashes {
            srt_win: &srt_win,
            runtime: &runtime,
        };
        run(verb, self, hashes, self.signer)
    }

    pub fn file(&self, path: PathBuf) -> Option<Vec<u8>> {
        self.files.borrow().get(&path).cloned()
    }

    pub fn ran(&self) -> Vec<(PathBuf, Vec<String>, PathBuf)> {
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
    fn program_data(&self) -> io::Result<PathBuf> {
        Ok(PathBuf::from("program-data"))
    }
    fn public(&self) -> io::Result<PathBuf> {
        Ok(PathBuf::from("public"))
    }
    fn windows_folder(&self) -> io::Result<PathBuf> {
        Ok(PathBuf::from("C:windows"))
    }
    fn system_folder(&self) -> io::Result<PathBuf> {
        Ok(system())
    }
    fn own_path(&self) -> io::Result<PathBuf> {
        Ok(self.own.clone())
    }
    fn protect_folder(&self, folder: &Path) -> io::Result<()> {
        if self.folder_fails {
            Err(io::Error::other("denied"))
        } else {
            self.protected.borrow_mut().push(folder.to_path_buf());
            Ok(())
        }
    }
    fn write_private(&self, to: &Path, bytes: &[u8]) -> io::Result<()> {
        self.files
            .borrow_mut()
            .insert(to.to_path_buf(), bytes.to_vec());
        self.private.borrow_mut().insert(to.to_path_buf());
        self.written.borrow_mut().push(to.to_path_buf());
        Ok(())
    }
    fn share(&self, file: &Path) -> io::Result<()> {
        self.private.borrow_mut().remove(file);
        self.shared.borrow_mut().push(file.to_path_buf());
        Ok(())
    }
    fn same_file(&self, one: &Path, other: &Path) -> bool {
        one == other
            || self
                .same
                .iter()
                .any(|(a, b)| (a == one && b == other) || (a == other && b == one))
    }
    /// Only the helper as shipped is signed.
    fn signer(&self, file: &Path) -> Option<String> {
        (self.file(file.to_path_buf()).as_deref() == Some(HELPER)).then(|| PUBLISHER.into())
    }
    fn read(&self, file: &Path) -> io::Result<Vec<u8>> {
        self.file(file.to_path_buf())
            .ok_or(io::ErrorKind::NotFound.into())
    }
    fn exists(&self, file: &Path) -> bool {
        self.files.borrow().contains_key(file)
    }
    fn run(
        &self,
        program: &Path,
        args: &[&str],
        folder: &Path,
        environment: &[(&'static str, OsString)],
    ) -> io::Result<i32> {
        self.environments.borrow_mut().push(environment.to_vec());
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
        self.deleted.borrow_mut().push(path.to_path_buf());
        self.files.borrow_mut().remove(path);
        self.private.borrow_mut().remove(path);
    }
}
