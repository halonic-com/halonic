//! Exports one commit of a remote repository, files only (requirement
//! `git-export`, HAL-11571). The desktop's Add plugin dialog uses it for a
//! plugin given as a git address: the same steps as `exportCommit` in
//! `@halonicjs/adapter-git`, which the CLI's `halonic plugin add` uses, and
//! the same refusals.
//!
//! It is not a clone. The export makes an empty bare repository in a folder
//! of its own, fetches the one commit into it (depth 1, no tags, no
//! submodules), checks the commit's files against the limits, and writes
//! them without a `.git` folder, so nothing the repository carries (config,
//! hooks, attributes) can be read later. Every step is the runner's
//! hardened git, with no user config: no credential helper, no filter driver
//! and no excludes or attributes file, and ssh that asks no question. Only
//! `https://` and `ssh://` addresses are taken, and the caller can stop the
//! export at any time, which stops git and removes every folder it made.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::error::GitError;
use crate::export_check::{
    check_address, check_reference, is_full_commit_id, is_plain_reference, redact,
};
use crate::export_command::ExportPlace;
use crate::limited_run::{GitOutput, run_watched};
use crate::opened_folders::canonical;
use crate::runner::GitRunner;

/// How much an export may fetch and write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExportLimits {
    /// The most files the commit may have.
    pub max_entries: usize,
    /// The most bytes the files may have in all, and one file at most.
    pub max_bytes: u64,
    /// The most bytes the fetch may put in the export's folder, which is
    /// what git stores packed.
    pub max_fetch_bytes: u64,
}

impl Default for ExportLimits {
    fn default() -> Self {
        Self {
            max_entries: 2_000,
            max_bytes: 50 * 1024 * 1024,
            max_fetch_bytes: 100 * 1024 * 1024,
        }
    }
}

/// A commit exported into a folder of its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedCommit {
    /// The folder the export made, which holds only `files`. The caller
    /// removes it when it is done.
    pub work: PathBuf,
    /// The folder with the commit's files.
    pub files: PathBuf,
    /// The full id of the commit.
    pub commit: String,
    /// The remote's default branch, when no reference was named and the
    /// remote says which branch its `HEAD` is.
    pub branch: Option<String>,
}

/// Makes each export folder's name its own.
static EXPORTS: AtomicU64 = AtomicU64::new(0);

/// How often the export looks at the size of its folder while git fetches.
const SIZE_CHECK_EVERY: Duration = Duration::from_millis(200);

/// The folder an export works in, removed when dropped unless it is kept.
struct Work {
    folder: PathBuf,
    keep: bool,
}

impl Drop for Work {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.folder);
        }
    }
}

impl GitRunner {
    /// Puts the files of one commit of the repository at `address` into a
    /// new folder under `parent`, which is made if it is missing.
    /// `reference` is a branch, a tag or a full commit id; `None` is the
    /// remote's `HEAD`, whose branch is looked up first and fetched by name.
    /// Either way, the commit is resolved to its full id before anything is
    /// written. `cancel` stops the export when it is set: git is stopped
    /// and the folders are removed.
    ///
    /// An address or reference that is refused is refused before git is
    /// started. The files are checked against `limits` before they are
    /// written, so a small fetch can't grow into a large folder.
    pub fn export_commit(
        &self,
        address: &str,
        reference: Option<&str>,
        parent: &Path,
        limits: ExportLimits,
        cancel: &AtomicBool,
    ) -> Result<ExportedCommit, GitError> {
        self.export_with(address, reference, parent, limits, cancel, None)
    }

    /// [`Self::export_commit`] with the program git starts for `ssh://`,
    /// which the tests use to reach a repository on this computer.
    pub(crate) fn export_with(
        &self,
        address: &str,
        reference: Option<&str>,
        parent: &Path,
        limits: ExportLimits,
        cancel: &AtomicBool,
        ssh: Option<&Path>,
    ) -> Result<ExportedCommit, GitError> {
        check_address(address)?;
        let reference = reference.unwrap_or("HEAD");
        check_reference(reference)?;
        self.check_hooks_for_export()?;
        let deadline = Instant::now() + self.limits().network_timeout;
        let mut work = make_work_folder(parent)?;
        let steps = Steps {
            address,
            runner: self,
            work: &work.folder,
            deadline,
            cancel,
            limits,
            ssh,
        };
        let (commit, branch) = steps.fetch(address, reference)?;
        steps.check_size(&commit)?;
        let files = steps.write_files(&commit)?;
        let _ = fs::remove_dir_all(work.folder.join("repository"));
        let _ = fs::remove_file(work.folder.join("index"));
        work.keep = true;
        Ok(ExportedCommit {
            work: work.folder.clone(),
            files,
            commit,
            branch,
        })
    }
}

/// A new, empty folder under `parent`, readable by this user alone.
fn make_work_folder(parent: &Path) -> Result<Work, GitError> {
    fs::create_dir_all(parent).map_err(io_error)?;
    let parent = canonical(parent)?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let name = format!(
        "export-{}-{}-{nanos}",
        std::process::id(),
        EXPORTS.fetch_add(1, Ordering::SeqCst)
    );
    let folder = parent.join(name);
    // Only Unix sets a mode.
    #[cfg_attr(not(unix), allow(unused_mut))]
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&folder).map_err(io_error)?;
    Ok(Work {
        folder,
        keep: false,
    })
}

/// The git steps of one export, in its work folder.
struct Steps<'a> {
    address: &'a str,
    runner: &'a GitRunner,
    work: &'a Path,
    deadline: Instant,
    cancel: &'a AtomicBool,
    limits: ExportLimits,
    ssh: Option<&'a Path>,
}

impl Steps<'_> {
    fn repository(&self) -> PathBuf {
        self.work.join("repository")
    }

    /// Runs one git step. The step stops when the caller cancels, when the
    /// deadline passes, and when the repository passes the fetch limit.
    fn git(
        &self,
        place: &ExportPlace<'_>,
        args: &[&str],
        step: &'static str,
    ) -> Result<GitOutput, GitError> {
        if self.cancel.load(Ordering::SeqCst) {
            return Err(GitError::Cancelled);
        }
        let mut command = self.runner.export_command(self.work, place, self.ssh);
        command.args(args);
        let mut last_check = Instant::now();
        let mut watch = || {
            if self.cancel.load(Ordering::SeqCst) {
                return Some(GitError::Cancelled);
            }
            if last_check.elapsed() >= SIZE_CHECK_EVERY {
                last_check = Instant::now();
                if folder_size_over(&self.repository(), self.limits.max_fetch_bytes) {
                    return Some(GitError::ExportTooLarge);
                }
            }
            None
        };
        let output = run_watched(
            &mut command,
            self.deadline,
            self.runner.limits().max_output_bytes,
            &mut watch,
        )?;
        if output.code == Some(0) {
            Ok(output)
        } else {
            Err(GitError::ExportFailed {
                step,
                message: redact(&String::from_utf8_lossy(&output.stderr), self.address),
            })
        }
    }

    /// Sets up the empty repository and fetches the commit into it.
    /// Answers the commit's full id and the remote's default branch.
    fn fetch(&self, address: &str, reference: &str) -> Result<(String, Option<String>), GitError> {
        let repository = self.repository();
        let repository_text = plain_text(&repository)?;
        self.git(
            &ExportPlace::default(),
            &[
                "init",
                "--quiet",
                "--bare",
                "--template=",
                "--",
                repository_text.as_str(),
            ],
            "set up",
        )?;
        let place = ExportPlace {
            git_dir: Some(&repository),
            work_tree: Some(self.work),
            index: None,
        };
        let branch = if reference == "HEAD" {
            self.remote_head_branch(&place, address)?
        } else {
            None
        };
        let fetched = branch.as_deref().unwrap_or(reference);
        self.git(
            &place,
            &[
                "fetch",
                "--quiet",
                "--depth=1",
                "--no-tags",
                "--no-recurse-submodules",
                "--upload-pack=git-upload-pack",
                "--",
                address,
                fetched,
            ],
            "fetch the commit",
        )?;
        let resolved = self.git(
            &place,
            &["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"],
            "find the commit",
        )?;
        // Nothing reads it again, and it holds the address.
        let _ = fs::remove_file(repository.join("FETCH_HEAD"));
        let commit = String::from_utf8_lossy(&resolved.stdout).trim().to_owned();
        if !is_full_commit_id(&commit) {
            return Err(GitError::ExportFailed {
                step: "find the commit",
                message: "git didn't give a full commit id".to_owned(),
            });
        }
        Ok((commit, branch))
    }

    /// The branch the remote's `HEAD` points at, such as `main`, or `None`
    /// when the remote doesn't say or names one a caller couldn't name.
    fn remote_head_branch(
        &self,
        place: &ExportPlace<'_>,
        address: &str,
    ) -> Result<Option<String>, GitError> {
        let listed = self.git(
            place,
            &["ls-remote", "--symref", "--", address, "HEAD"],
            "reach the repository",
        )?;
        let listing = String::from_utf8_lossy(&listed.stdout);
        Ok(listing.lines().find_map(|line| {
            let name = line
                .strip_prefix("ref: refs/heads/")?
                .strip_suffix("\tHEAD")?;
            is_plain_reference(name).then(|| name.to_owned())
        }))
    }

    /// Refuses a commit with more files or bytes than the limits, from its
    /// listing, before any file is written.
    fn check_size(&self, commit: &str) -> Result<(), GitError> {
        let repository = self.repository();
        let place = ExportPlace {
            git_dir: Some(&repository),
            work_tree: Some(self.work),
            index: None,
        };
        let listed = self
            .git(
                &place,
                &["ls-tree", "-r", "-l", "-z", commit],
                "list the files",
            )
            // A listing past the output limit is a commit with too many files.
            .map_err(|error| match error {
                GitError::OutputTooLarge => GitError::ExportTooLarge,
                other => other,
            })?;
        let mut entries = 0usize;
        let mut bytes = 0u64;
        for entry in listed
            .stdout
            .split(|byte| *byte == 0)
            .filter(|e| !e.is_empty())
        {
            entries += 1;
            // `<mode> <type> <id> <size>\t<path>`; a submodule has `-`.
            let header = entry
                .split(|byte| *byte == b'\t')
                .next()
                .unwrap_or_default();
            let size = String::from_utf8_lossy(header)
                .split_whitespace()
                .nth(3)
                .and_then(|size| size.parse::<u64>().ok())
                .unwrap_or(0);
            if size > self.limits.max_bytes {
                return Err(GitError::ExportTooLarge);
            }
            bytes = bytes.saturating_add(size);
            if entries > self.limits.max_entries || bytes > self.limits.max_bytes {
                return Err(GitError::ExportTooLarge);
            }
        }
        Ok(())
    }

    /// Writes the commit's files into `files` in the work folder, and
    /// checks that no `.git` came with them.
    fn write_files(&self, commit: &str) -> Result<PathBuf, GitError> {
        let repository = self.repository();
        let index = self.work.join("index");
        let place = ExportPlace {
            git_dir: Some(&repository),
            work_tree: Some(self.work),
            index: Some(&index),
        };
        self.git(&place, &["read-tree", commit], "read the commit")?;
        let files = self.work.join("files");
        fs::create_dir(&files).map_err(io_error)?;
        let mut prefix = String::from("--prefix=");
        prefix.push_str(&plain_text(&files)?);
        prefix.push('/');
        self.git(
            &place,
            &["checkout-index", "--all", prefix.as_str()],
            "write the files",
        )?;
        check_no_git_folder(&files)?;
        Ok(files)
    }
}

fn io_error(error: std::io::Error) -> GitError {
    GitError::Io {
        message: error.to_string(),
    }
}

fn plain_text(path: &Path) -> Result<String, GitError> {
    crate::opened_folders::plain_path(path)
        .into_string()
        .map_err(|_| GitError::Io {
            message: "a folder's path isn't valid Unicode".to_owned(),
        })
}

/// Refuses a `.git` at the top of the export, in any case.
fn check_no_git_folder(files: &Path) -> Result<(), GitError> {
    for entry in fs::read_dir(files).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
        {
            return Err(GitError::ExportFailed {
                step: "write the files",
                message: "the export has a .git in it, which Halonic doesn't allow".to_owned(),
            });
        }
    }
    Ok(())
}

/// Whether the files under `folder` (the export's `repository/`, so the
/// files written at check-out don't count as fetched) add up to more than `limit` bytes.
/// Links are counted as themselves and never followed.
fn folder_size_over(folder: &Path, limit: u64) -> bool {
    let mut total = 0u64;
    let mut pending = vec![folder.to_path_buf()];
    while let Some(next) = pending.pop() {
        // A folder that is gone or unreadable adds nothing.
        let Ok(entries) = fs::read_dir(&next) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(seen) = fs::symlink_metadata(entry.path()) else {
                continue;
            };
            if seen.is_dir() {
                pending.push(entry.path());
            } else {
                total = total.saturating_add(seen.len());
                if total > limit {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(test)]
#[path = "export_tests.rs"]
mod tests;
