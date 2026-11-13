//! The folder reader: it hides nothing, follows no link and opens no special
//! file. Requirement `folder-reader`; these tests' names start with
//! `folder_reader_`. Links and pipes are made on Unix, where CI can make them.

mod support;

use halonic_workspace_files::{EntryKind, Fence, FileError, FolderEntry, FolderReader};
use support::Scratch;

fn file(path: &str, size: u64) -> FolderEntry {
    FolderEntry {
        path: path.to_owned(),
        kind: EntryKind::File,
        size: Some(size),
    }
}

fn other(path: &str, kind: EntryKind) -> FolderEntry {
    FolderEntry {
        path: path.to_owned(),
        kind,
        size: None,
    }
}

fn paths(entries: Vec<FolderEntry>) -> Vec<String> {
    entries.into_iter().map(|entry| entry.path).collect()
}

#[test]
fn folder_reader_lists_everything_sorted_by_code_unit() {
    let scratch = Scratch::new("reader-list");
    scratch.put("a.txt", "a");
    scratch.put("B.txt", "bb");
    scratch.put("a-c", "abc");
    scratch.put("a/b", "abcd");
    scratch.put("ä.txt", "");
    scratch.put(".git/config", "[core]\n");
    scratch.put(".env", "MODE=demo\n");
    scratch.put(".halonic-write-1.tmp", "x");
    std::fs::create_dir(scratch.at("empty")).expect("a folder");
    let reader = FolderReader::new(scratch.path().to_owned());

    let entries = reader.entries(None, None, true).expect("it lists");
    assert_eq!(
        paths(entries.clone()),
        [
            ".env",
            ".git",
            ".git/config",
            ".halonic-write-1.tmp",
            "B.txt",
            "a",
            "a-c",
            "a.txt",
            "a/b",
            "empty",
            "ä.txt",
        ]
    );
    assert!(entries.contains(&file("a/b", 4)));
    assert!(entries.contains(&other("a", EntryKind::Folder)));
    assert_eq!(
        reader.read(".env"),
        Ok(Some(b"MODE=demo\n".to_vec())),
        "private names are read like any other"
    );
}

#[test]
fn folder_reader_lists_under_a_folder_and_nothing_for_a_missing_one_or_a_file() {
    let scratch = Scratch::new("reader-dir");
    scratch.put("acme/plugin.yaml", "id: acme\n");
    scratch.put("acme-two/x", "x");
    let reader = FolderReader::new(scratch.path().to_owned());

    let under = reader.entries(Some("acme"), None, true).expect("it lists");
    assert_eq!(paths(under), ["acme/plugin.yaml"]);
    assert_eq!(reader.entries(Some("missing"), None, true), Ok(vec![]));
    assert_eq!(
        reader.entries(Some("acme/plugin.yaml"), None, true),
        Ok(vec![])
    );
}

#[test]
fn folder_reader_stops_past_the_limit_and_can_stay_on_one_level() {
    let scratch = Scratch::new("reader-limit");
    for name in ["a", "b", "c", "d"] {
        scratch.put(name, "");
    }
    scratch.put("acme/backend/index.js", "");
    let reader = FolderReader::new(scratch.path().to_owned());

    assert_eq!(reader.entries(None, Some(2), true).map(|e| e.len()), Ok(3));
    assert_eq!(reader.entries(None, Some(7), true).map(|e| e.len()), Ok(7));
    let top = reader.entries(None, None, false).expect("it lists");
    assert_eq!(paths(top), ["a", "acme", "b", "c", "d"]);
    let acme = reader.entries(Some("acme"), None, false).expect("it lists");
    assert_eq!(paths(acme), ["acme/backend"]);
    assert_eq!(reader.entries(None, Some(1), false).map(|e| e.len()), Ok(2));
}

#[test]
fn folder_reader_reads_exact_bytes_and_nothing_for_a_missing_file_or_a_folder() {
    let scratch = Scratch::new("reader-bytes");
    scratch.put("one.bin", [0xff, 0xfe, 0x00, 0x80]);
    scratch.put("empty", "");
    scratch.put("acme/plugin.yaml", "id: acme\n");
    let reader = FolderReader::new(scratch.path().to_owned());

    assert_eq!(
        reader.read("one.bin"),
        Ok(Some(vec![0xff, 0xfe, 0x00, 0x80]))
    );
    assert_eq!(reader.read("empty"), Ok(Some(vec![])));
    assert_eq!(reader.read("missing"), Ok(None));
    assert_eq!(reader.read("acme"), Ok(None));
    assert_eq!(reader.read("acme/plugin.yaml/x"), Ok(None));
}

#[test]
fn folder_reader_refuses_every_unsafe_path_in_every_method() {
    let scratch = Scratch::new("reader-unsafe");
    scratch.put("a/b", "x");
    let reader = FolderReader::new(scratch.path().to_owned());
    for path in [
        "",
        "/etc/passwd",
        "a/../b",
        "a/./b",
        "a//b",
        "a\\b",
        "a\0b",
        "..",
    ] {
        let refused = |error: FileError| matches!(error, FileError::UnsafePath { .. });
        assert!(
            reader.entries(Some(path), None, true).is_err_and(refused),
            "{path:?}"
        );
        assert!(reader.read(path).is_err_and(refused), "{path:?}");
        assert!(
            reader.location_of(Some(path)).is_err_and(refused),
            "{path:?}"
        );
    }
}

#[test]
fn folder_reader_gives_the_real_location_of_the_folder_and_of_an_entry() {
    let scratch = Scratch::new("reader-location");
    scratch.put("acme/plugin.yaml", "id: acme\n");
    let reader = FolderReader::new(scratch.path().to_owned());

    let root = reader
        .location_of(None)
        .expect("it locates")
        .expect("it is there");
    let acme = reader
        .location_of(Some("acme"))
        .expect("it locates")
        .expect("it is there");
    assert_eq!(root, scratch.path().to_str().expect("Unicode"));
    assert_eq!(acme, scratch.at("acme").to_str().expect("Unicode"));
    assert_eq!(reader.location_of(Some("missing")), Ok(None));
}

#[test]
fn folder_reader_leaves_the_fence_out_and_refuses_it() {
    let scratch = Scratch::new("reader-fence");
    scratch.put("workspace/notes.txt", "n");
    scratch.put("workspace/profile/trust/record.json", "{}");
    let workspace = scratch.at("workspace");
    let fence = Fence::around(&workspace, &scratch.at("workspace/profile"));
    let reader = FolderReader::new(workspace.clone()).fenced(fence);

    let listed = reader.entries(None, None, true).expect("it lists");
    assert_eq!(paths(listed), ["notes.txt"]);
    let refused = |error: FileError| matches!(error, FileError::PrivatePath { .. });
    assert!(reader.read("profile/trust/record.json").is_err_and(refused));
    assert!(
        reader
            .entries(Some("profile"), None, true)
            .is_err_and(refused)
    );
    assert!(reader.location_of(Some("profile")).is_err_and(refused));

    let inside = FolderReader::new(scratch.at("workspace/profile")).fenced(Fence::around(
        &scratch.at("workspace/profile"),
        &scratch.at("workspace/profile"),
    ));
    assert!(inside.entries(None, None, true).is_err_and(refused));
    assert!(inside.location_of(None).is_err_and(refused));
}

#[cfg(unix)]
mod links {
    use std::os::unix::fs::symlink;
    use std::process::Command;

    use super::*;

    fn linked(name: &str) -> (Scratch, FolderReader) {
        let scratch = Scratch::new(name);
        scratch.put("real/secret.txt", "kept");
        scratch.put("acme/plugin.yaml", "id: acme\n");
        symlink("../real", scratch.at("acme/latest")).expect("a folder link");
        symlink("../real/secret.txt", scratch.at("acme/file-link")).expect("a file link");
        let reader = FolderReader::new(scratch.path().to_owned());
        (scratch, reader)
    }

    fn linked_path(error: FileError) -> bool {
        matches!(error, FileError::LinkedPath { .. })
    }

    #[test]
    fn folder_reader_lists_a_link_as_a_link_and_lists_nothing_through_it() {
        let (_scratch, reader) = linked("reader-links-list");
        let entries = reader.entries(Some("acme"), None, true).expect("it lists");
        assert_eq!(
            entries,
            [
                other("acme/file-link", EntryKind::Link),
                other("acme/latest", EntryKind::Link),
                file("acme/plugin.yaml", 9),
            ]
        );
    }

    #[test]
    fn folder_reader_refuses_to_read_list_or_locate_through_a_link() {
        let (_scratch, reader) = linked("reader-links-refuse");
        assert!(reader.read("acme/file-link").is_err_and(linked_path));
        assert!(
            reader
                .read("acme/latest/secret.txt")
                .is_err_and(linked_path)
        );
        assert!(
            reader
                .entries(Some("acme/latest"), None, true)
                .is_err_and(linked_path)
        );
        assert!(
            reader
                .location_of(Some("acme/latest"))
                .is_err_and(linked_path)
        );
        assert!(
            reader
                .location_of(Some("acme/latest/secret.txt"))
                .is_err_and(linked_path)
        );
    }

    #[test]
    fn folder_reader_lists_a_special_file_as_other_and_never_opens_it() {
        let scratch = Scratch::new("reader-special");
        std::fs::create_dir(scratch.at("acme")).expect("a folder");
        let made = Command::new("mkfifo")
            .arg(scratch.at("acme/socket"))
            .status();
        assert!(made.is_ok_and(|status| status.success()), "mkfifo");
        let reader = FolderReader::new(scratch.path().to_owned());

        let entries = reader.entries(Some("acme"), None, true).expect("it lists");
        assert_eq!(entries, [other("acme/socket", EntryKind::Other)]);
        let refused = reader.read("acme/socket");
        assert!(
            matches!(refused, Err(FileError::SpecialPath { .. })),
            "{refused:?}"
        );
    }
}
