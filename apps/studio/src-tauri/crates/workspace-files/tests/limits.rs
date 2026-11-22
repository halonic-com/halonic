//! How much of a workspace the shell reads: no file larger than
//! `MAX_READ_BYTES`, no folder deeper than `MAX_FOLDER_DEPTH`, and, on
//! Windows, no path that names another drive. Requirements `folder-reader`
//! and `workspace-files`.

mod support;

use std::fs::{self, File};

use halonic_workspace_files::{
    FileError, FolderReader, MAX_FOLDER_DEPTH, MAX_READ_BYTES, WorkspaceFolder, WriteLocks,
};
use support::Scratch;

/// A file of `size` bytes at `path`, made without writing them.
fn sized(scratch: &Scratch, path: &str, size: u64) {
    scratch.put(path, "");
    let file = File::options()
        .write(true)
        .open(scratch.at(path))
        .expect("the file opens");
    file.set_len(size).expect("the file takes its size");
}

/// Folders `d/d/…` nested `depth` deep, with `last.txt` in the deepest.
fn chain(scratch: &Scratch, depth: usize) -> String {
    let folders = vec!["d"; depth].join("/");
    scratch.put(&format!("{folders}/last.txt"), "deep");
    folders
}

fn is_io(error: &FileError, says: &str) -> bool {
    matches!(error, FileError::Io { message } if message.contains(says))
}

#[test]
fn folder_reader_reads_a_file_up_to_the_limit_and_refuses_a_larger_one() {
    let scratch = Scratch::new("limits-reader-size");
    sized(&scratch, "at-limit.bin", MAX_READ_BYTES);
    sized(&scratch, "over-limit.bin", MAX_READ_BYTES + 1);
    let reader = FolderReader::new(scratch.path().to_owned());

    let read = reader.read("at-limit.bin").expect("it reads");
    assert_eq!(read.map(|bytes| bytes.len() as u64), Some(MAX_READ_BYTES));
    let refused = reader.read("over-limit.bin").expect_err("it is refused");
    assert!(is_io(&refused, "larger than 64 MB"), "{refused:?}");
}

#[test]
fn workspace_files_refuse_to_read_a_file_larger_than_the_limit() {
    let scratch = Scratch::new("limits-files-size");
    sized(&scratch, "agents/huge.yaml", MAX_READ_BYTES + 1);
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    let refused = folder.read("agents/huge.yaml").expect_err("it is refused");
    assert!(is_io(&refused, "larger than 64 MB"), "{refused:?}");
}

#[test]
fn folder_reader_lists_folders_up_to_the_depth_limit_and_refuses_deeper() {
    let scratch = Scratch::new("limits-reader-depth");
    let deepest = chain(&scratch, MAX_FOLDER_DEPTH);
    let reader = FolderReader::new(scratch.path().to_owned());

    let entries = reader.entries(None, None, true).expect("it lists");
    assert!(
        entries
            .iter()
            .any(|entry| entry.path == format!("{deepest}/last.txt"))
    );

    fs::create_dir(scratch.at(&format!("{deepest}/d"))).expect("one folder deeper");
    let refused = reader.entries(None, None, true).expect_err("it is refused");
    assert!(is_io(&refused, "folders deep"), "{refused:?}");
}

#[test]
fn workspace_files_refuse_to_list_folders_deeper_than_the_limit() {
    let scratch = Scratch::new("limits-files-depth");
    let deepest = chain(&scratch, MAX_FOLDER_DEPTH);
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    assert_eq!(folder.list(None), Ok(vec![format!("{deepest}/last.txt")]));

    fs::create_dir(scratch.at(&format!("{deepest}/d"))).expect("one folder deeper");
    let refused = folder.list(None).expect_err("it is refused");
    assert!(is_io(&refused, "folders deep"), "{refused:?}");
}

#[cfg(windows)]
#[test]
fn folder_reader_refuses_a_path_that_names_a_drive() {
    let scratch = Scratch::new("limits-reader-drive");
    scratch.put("notes.txt", "inside");
    let reader = FolderReader::new(scratch.path().to_owned());
    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_owned());

    for path in [
        format!("{system_drive}/Windows/win.ini"),
        format!("notes/{system_drive}"),
        "notes.txt:stream".to_owned(),
    ] {
        let refused = reader.read(&path);
        assert!(
            matches!(refused, Err(FileError::UnsafePath { .. })),
            "{path}: {refused:?}"
        );
        let located = reader.location_of(Some(&path));
        assert!(
            matches!(located, Err(FileError::UnsafePath { .. })),
            "{path}: {located:?}"
        );
    }
}
