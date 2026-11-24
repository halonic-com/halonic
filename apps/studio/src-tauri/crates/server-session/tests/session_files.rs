//! The brief and the launcher on disk: made new, with their modes set as
//! they're made, in a private folder, and never through a link.
#![cfg(unix)]

use std::fs;
use std::io::ErrorKind;
use std::os::unix::fs::{PermissionsExt, symlink};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, SystemTime};

use halonic_server_session::{
    FOLDER_NAME, brief_file_name, create_private_file, launcher_file_name, prepare_folder,
    sweep_old_files, write_session_files,
};

static NEXT_FOLDER: AtomicU32 = AtomicU32::new(0);

/// A fresh, empty folder of the system's temporary folder, removed when
/// the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let number = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
        let folder = std::env::temp_dir().join(format!(
            "halonic-server-session-{name}-{}-{number}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("make the folder");
        Self(folder)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn mode(path: &Path) -> u32 {
    fs::symlink_metadata(path)
        .expect("the file is there")
        .permissions()
        .mode()
        & 0o777
}

#[test]
fn launch_makes_the_folder_0700_and_the_files_0600_and_0700() {
    let scratch = Scratch::new("modes");
    let folder = prepare_folder(&scratch.0.join("data")).expect("the folder is made");
    assert_eq!(folder, scratch.0.join("data").join(FOLDER_NAME));
    assert_eq!(mode(&folder), 0o700);
    let files = write_session_files(&folder, "HAL-1234", "Task: brief\n", "#!/bin/sh\n")
        .expect("the files are written");
    let brief = folder.join(brief_file_name("HAL-1234"));
    assert_eq!(mode(&brief), 0o600);
    assert_eq!(mode(files.launcher()), 0o700);
    assert_eq!(
        files.launcher(),
        folder.join(launcher_file_name("HAL-1234"))
    );
    assert_eq!(fs::read_to_string(&brief).expect("read"), "Task: brief\n");
    files.remove().expect("the files are removed");
    assert!(!brief.exists() && !files.launcher().exists());
}

#[test]
fn launch_refuses_a_link_in_a_files_place_and_leaves_its_target_alone() {
    let scratch = Scratch::new("link");
    let target = scratch.0.join("elsewhere");
    fs::write(&target, "kept").expect("write the target");
    let file = scratch.0.join(brief_file_name("HAL-1234"));
    symlink(&target, &file).expect("make the link");
    let error = create_private_file(&file, "Task: brief\n", 0o600).expect_err("refused");
    assert_eq!(error.kind(), ErrorKind::AlreadyExists);
    assert_eq!(fs::read_to_string(&target).expect("read"), "kept");
}

#[test]
fn launch_replaces_a_file_left_by_an_earlier_launch() {
    let scratch = Scratch::new("left");
    let folder = prepare_folder(&scratch.0).expect("the folder is made");
    fs::write(folder.join(brief_file_name("HAL-1234")), "old").expect("an old brief");
    let files = write_session_files(&folder, "HAL-1234", "new", "#!/bin/sh\n").expect("written");
    let brief = folder.join(brief_file_name("HAL-1234"));
    assert_eq!(fs::read_to_string(&brief).expect("read"), "new");
    assert_eq!(mode(&brief), 0o600);
    files.remove().expect("removed");
}

#[test]
fn launch_refuses_a_folder_that_is_a_link_or_open_to_others() {
    let scratch = Scratch::new("folder");
    let real = scratch.0.join("real");
    fs::create_dir(&real).expect("make a folder");
    fs::set_permissions(&real, fs::Permissions::from_mode(0o700)).expect("mode");
    let data = scratch.0.join("data");
    fs::create_dir(&data).expect("make the data folder");
    symlink(&real, data.join(FOLDER_NAME)).expect("make the link");
    let error = prepare_folder(&data).expect_err("a link is refused");
    assert_eq!(error.kind(), ErrorKind::PermissionDenied);

    let open = scratch.0.join("open");
    fs::create_dir_all(open.join(FOLDER_NAME)).expect("make the folder");
    fs::set_permissions(open.join(FOLDER_NAME), fs::Permissions::from_mode(0o777)).expect("mode");
    let error = prepare_folder(&open).expect_err("an open folder is refused");
    assert_eq!(error.kind(), ErrorKind::PermissionDenied);
}

#[test]
fn launch_sweeps_only_old_files_named_like_ours() {
    let scratch = Scratch::new("sweep");
    for name in ["brief-HAL-1.md", "run-HAL-1.sh", "notes.txt"] {
        fs::write(scratch.0.join(name), "x").expect("write");
    }
    let hour = Duration::from_secs(3600);
    // Nothing is old yet.
    sweep_old_files(&scratch.0, hour, SystemTime::now()).expect("swept");
    assert!(scratch.0.join("brief-HAL-1.md").exists());
    // Two hours on, ours are old; the other file stays.
    let later = SystemTime::now() + 2 * hour;
    sweep_old_files(&scratch.0, hour, later).expect("swept");
    assert!(!scratch.0.join("brief-HAL-1.md").exists());
    assert!(!scratch.0.join("run-HAL-1.sh").exists());
    assert!(scratch.0.join("notes.txt").exists());
}
