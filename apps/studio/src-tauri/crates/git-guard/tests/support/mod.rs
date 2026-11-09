//! Temporary folders and a ready runner for the tests that run real git.

// Each test file is its own crate and uses only part of this module.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use halonic_git_guard::{GitOutput, GitRunner, OpenedFolders, find_git};

/// A folder under the system's temporary folder, removed when dropped.
pub struct TemporaryFolder {
    path: PathBuf,
}

impl TemporaryFolder {
    pub fn new() -> Self {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|time| time.as_nanos())
            .unwrap_or_default();
        let name = format!(
            "halonic-git-guard-{}-{}-{}",
            std::process::id(),
            nanos,
            COUNTER.fetch_add(1, Ordering::SeqCst)
        );
        let path = std::env::temp_dir().join(name);
        std::fs::create_dir_all(&path).expect("the temporary folder is created");
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Creates a subfolder and returns its path.
    pub fn folder(&self, relative: &str) -> PathBuf {
        let folder = self.path.join(relative);
        std::fs::create_dir_all(&folder).expect("the folder is created");
        folder
    }
}

impl Drop for TemporaryFolder {
    fn drop(&mut self) {
        // Cleaning up is best effort: a failure here must not hide the
        // test's own result.
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// A sandbox with a runner, an empty hooks folder and one opened folder,
/// `acme`.
pub struct Sandbox {
    pub temporary: TemporaryFolder,
    pub runner: GitRunner,
    pub folders: OpenedFolders,
    pub acme: PathBuf,
}

impl Sandbox {
    pub fn new() -> Self {
        let temporary = TemporaryFolder::new();
        let path = std::env::var_os("PATH").unwrap_or_default();
        let git = find_git(&path).expect("the tests need git on the PATH");
        let runner =
            GitRunner::new(git, &temporary.path().join("empty-hooks")).expect("the runner starts");
        let folders = OpenedFolders::new();
        let acme = temporary.folder("acme");
        folders.open(&acme).expect("acme opens");
        Self {
            temporary,
            runner,
            folders,
            acme,
        }
    }

    /// Runs an allowed call in the `acme` folder.
    pub fn git(&self, call: &str) -> Result<GitOutput, halonic_git_guard::GitError> {
        self.git_in(&self.acme, call)
    }

    pub fn git_in(
        &self,
        folder: &Path,
        call: &str,
    ) -> Result<GitOutput, halonic_git_guard::GitError> {
        let args: Vec<String> = call.split(' ').map(str::to_owned).collect();
        self.runner.run(&self.folders, folder, &args)
    }

    /// `git init` in `acme`, with a made-up committer in the repository's
    /// own config, so commits work without any global config.
    pub fn init_repository(&self) {
        let output = self.git("init -b main").expect("init runs");
        assert_eq!(
            output.code,
            Some(0),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        self.append_config("[user]\n\tname = Acme Tester\n\temail = tester@acme.example\n");
    }

    pub fn append_config(&self, text: &str) {
        let config = self.acme.join(".git").join("config");
        let mut contents = std::fs::read_to_string(&config).expect("the config reads");
        contents.push_str(text);
        std::fs::write(&config, contents).expect("the config writes");
    }

    pub fn write(&self, relative: &str, text: &str) {
        let file = self.acme.join(relative);
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).expect("the folder is created");
        }
        std::fs::write(file, text).expect("the file writes");
    }

    /// Runs an allowed call that must succeed, and returns its stdout.
    pub fn git_ok(&self, call: &str) -> String {
        self.git_ok_in(&self.acme, call)
    }

    pub fn git_ok_in(&self, folder: &Path, call: &str) -> String {
        let output = self
            .git_in(folder, call)
            .unwrap_or_else(|error| panic!("{call}: {error}"));
        assert_eq!(
            output.code,
            Some(0),
            "{call}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// A shell command that leaves the mark `name` when it runs, the way a
    /// program planted in a repository would.
    pub fn planted(&self, name: &str) -> String {
        format!("touch '{}'", self.mark(name).display())
    }

    /// An executable script that leaves the mark `name` and passes its
    /// input through, for keys that take a program's path.
    #[cfg(unix)]
    pub fn planted_script(&self, name: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let script = self.temporary.path().join(format!("{name}.sh"));
        let text = format!("#!/bin/sh\n{}\ncat\n", self.planted(name));
        std::fs::write(&script, text).expect("the script writes");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))
            .expect("the script is executable");
        script
    }

    pub fn mark(&self, name: &str) -> PathBuf {
        self.temporary.path().join(format!("{name}.ran"))
    }

    /// Whether any planted program left its mark.
    pub fn marks(&self) -> Vec<String> {
        let mut marks: Vec<String> = std::fs::read_dir(self.temporary.path())
            .expect("the temporary folder reads")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".ran"))
            .collect();
        marks.sort();
        marks
    }
}

/// Text as a quoted config value. A config file reads `\` as an escape,
/// so a Windows path written as it is breaks the file.
pub fn config_value(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

/// A path as a quoted config value.
pub fn config_path(path: &Path) -> String {
    config_value(&path.to_string_lossy())
}

/// Runs git directly, not through the runner, to set a test up: no
/// hardening, and local remotes allowed.
pub fn plain_git(folder: &Path, args: &[&str]) -> std::process::Output {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let mut command = Command::new(find_git(&path).expect("the tests need git on the PATH"));
    for (name, _) in std::env::vars_os() {
        if name
            .to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("GIT_")
        {
            command.env_remove(name);
        }
    }
    command
        .current_dir(folder)
        .args([
            "-c",
            "user.name=Acme Tester",
            "-c",
            "user.email=tester@acme.example",
        ])
        .args([
            "-c",
            "protocol.file.allow=always",
            "-c",
            "init.defaultBranch=main",
        ])
        .args(args)
        .output()
        .expect("git runs")
}

/// [`plain_git`] for a step that must succeed.
pub fn plain_git_ok(folder: &Path, args: &[&str]) {
    let output = plain_git(folder, args);
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
