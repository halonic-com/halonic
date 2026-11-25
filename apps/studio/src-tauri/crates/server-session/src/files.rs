//! The brief and the launcher on the user's computer: in a folder the shell
//! makes itself, with a fixed name and mode `0700`, each file made new with
//! its mode set at creation (`0600` for the brief, `0700` for the launcher),
//! never by a later `chmod`. Making a file new (`O_CREAT|O_EXCL`) refuses a
//! link in its place, so no link can point a write elsewhere.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::launcher::{brief_file_name, launcher_file_name};

/// The folder's fixed name inside the app's data folder.
pub const FOLDER_NAME: &str = "server-session";

/// The brief's mode: only the user may read it.
const BRIEF_MODE: u32 = 0o600;

/// The launcher's and the folder's mode: only the user may run or open it.
const PRIVATE_RUN_MODE: u32 = 0o700;

/// The brief and the launcher written for one launch.
#[derive(Debug)]
pub struct SessionFiles {
    brief: PathBuf,
    launcher: PathBuf,
}

impl SessionFiles {
    /// The launcher, which the terminal opens.
    pub fn launcher(&self) -> &Path {
        &self.launcher
    }

    /// Removes both files, as after a launch that failed.
    ///
    /// # Errors
    ///
    /// A file that is there but can't be removed.
    pub fn remove(&self) -> io::Result<()> {
        remove_if_there(&self.brief)?;
        remove_if_there(&self.launcher)
    }
}

/// Removes a file, or a link in its place; fine when nothing is there.
fn remove_if_there(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// Gives a new file its mode as it's made. Windows has no modes: the app's
/// data folder is the user's own there.
#[cfg(unix)]
fn file_mode(options: &mut OpenOptions, mode: u32) {
    std::os::unix::fs::OpenOptionsExt::mode(options, mode);
}

#[cfg(not(unix))]
fn file_mode(_options: &mut OpenOptions, _mode: u32) {}

/// Gives a new folder its mode as it's made.
#[cfg(unix)]
fn folder_mode(builder: &mut DirBuilder, mode: u32) {
    std::os::unix::fs::DirBuilderExt::mode(builder, mode);
}

#[cfg(not(unix))]
fn folder_mode(_builder: &mut DirBuilder, _mode: u32) {}

/// Makes `path` new with `mode` and writes `text` to it. A file or a link
/// already there is refused, never followed.
///
/// # Errors
///
/// `AlreadyExists` when anything is at `path`, or the error of the write.
pub fn create_private_file(path: &Path, text: &str, mode: u32) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    file_mode(&mut options, mode);
    let mut file = options.open(path)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()
}

/// Whether the folder is a real folder, not a link, that only its owner
/// may open.
#[cfg(unix)]
fn is_private_folder(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.is_dir() && metadata.permissions().mode() & 0o077 == 0
}

#[cfg(not(unix))]
fn is_private_folder(metadata: &fs::Metadata) -> bool {
    metadata.is_dir()
}

/// Makes the folder inside `data` with mode `0700`, or takes the one
/// there, and checks it.
///
/// # Errors
///
/// `PermissionDenied` when the folder is a link, isn't a folder, or others
/// may open it; else the error of making it.
pub fn prepare_folder(data: &Path) -> io::Result<PathBuf> {
    fs::create_dir_all(data)?;
    let folder = data.join(FOLDER_NAME);
    let mut builder = DirBuilder::new();
    folder_mode(&mut builder, PRIVATE_RUN_MODE);
    match builder.create(&folder) {
        Err(error) if error.kind() != ErrorKind::AlreadyExists => return Err(error),
        _ => {}
    }
    if !is_private_folder(&fs::symlink_metadata(&folder)?) {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "the server-session folder isn't a private folder",
        ));
    }
    Ok(folder)
}

/// Whether the file just made has the folder's owner, so the folder is the
/// user's own and not one someone else made for them.
#[cfg(unix)]
fn same_owner(folder: &Path, file: &Path) -> io::Result<bool> {
    use std::os::unix::fs::MetadataExt;
    Ok(fs::symlink_metadata(folder)?.uid() == fs::symlink_metadata(file)?.uid())
}

#[cfg(not(unix))]
fn same_owner(_folder: &Path, _file: &Path) -> io::Result<bool> {
    Ok(true)
}

/// Writes the brief and the launcher for `task` into `folder`, which
/// [`prepare_folder`] made. A file left from an earlier launch is removed
/// first; if anything fails, neither file is left behind.
///
/// # Errors
///
/// The first file that can't be removed or made, or `PermissionDenied`
/// when the folder isn't the user's own.
pub fn write_session_files(
    folder: &Path,
    task: &str,
    brief: &str,
    launcher: &str,
) -> io::Result<SessionFiles> {
    let files = SessionFiles {
        brief: folder.join(brief_file_name(task)),
        launcher: folder.join(launcher_file_name(task)),
    };
    let written = write_both(folder, &files, brief, launcher);
    if written.is_err() {
        // The write's error is the one to report; a failed clean-up is
        // swept with the folder's old files at the next start.
        let _ = files.remove();
    }
    written.map(|()| files)
}

fn write_both(folder: &Path, files: &SessionFiles, brief: &str, launcher: &str) -> io::Result<()> {
    files.remove()?;
    create_private_file(&files.brief, brief, BRIEF_MODE)?;
    if !same_owner(folder, &files.brief)? {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "the server-session folder belongs to someone else",
        ));
    }
    create_private_file(&files.launcher, launcher, PRIVATE_RUN_MODE)
}

/// Removes briefs and launchers in `folder` last changed more than
/// `max_age` ago: what a launch that never ran left behind. Only regular
/// files named like ours are touched.
///
/// # Errors
///
/// The first old file that can't be removed, or the folder can't be read.
pub fn sweep_old_files(folder: &Path, max_age: Duration, now: SystemTime) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let name = entry.file_name();
        let ours = name
            .to_str()
            .is_some_and(|name| name.starts_with("brief-HAL-") || name.starts_with("run-HAL-"));
        let metadata = entry.metadata()?;
        let old = now
            .duration_since(metadata.modified()?)
            .is_ok_and(|age| age > max_age);
        if ours && metadata.is_file() && old {
            remove_if_there(&entry.path())?;
        }
    }
    Ok(())
}
