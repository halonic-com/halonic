//! Listing, reading, writing and removing a workspace's files, as
//! `FolderDefinitionStore` in `fs-node` does. Requirement `workspace-files`;
//! these tests' names start with `workspace_files_`.

mod support;

use std::sync::{Arc, Barrier};
use std::thread;

use halonic_workspace_files::{
    FileError, WorkspaceFolder, WriteLocks, WriteOutcome, content_digest,
};
use support::Scratch;

#[test]
fn workspace_files_list_every_file_sorted_without_private_or_temporary_entries() {
    let scratch = Scratch::new("list");
    for path in [
        "agents/review.yaml",
        "hubs/b/hub.yaml",
        "hubs/a/hub.yaml",
        "a\u{10000}.yaml",
        "a\u{ffff}.yaml",
        ".git/config",
        ".env.local",
        "hubs/.studio/trust.json",
        "hubs/.halonic-write-0b5c6f4e-2a1d-4c3b-9e8f-7a6b5c4d3e2f.tmp",
    ] {
        scratch.put(path, "x");
    }
    std::fs::create_dir_all(scratch.at("empty/folder")).expect("an empty folder");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    assert_eq!(
        folder.list(None),
        // UTF-16 order: "g" before the surrogate of U+10000, and that before
        // U+FFFF, as JavaScript sorts them. By code point it would be the
        // other way round.
        Ok(vec![
            "agents/review.yaml".to_owned(),
            "a\u{10000}.yaml".to_owned(),
            "a\u{ffff}.yaml".to_owned(),
            "hubs/a/hub.yaml".to_owned(),
            "hubs/b/hub.yaml".to_owned(),
        ])
    );
    assert_eq!(
        folder.list(Some("hubs")),
        Ok(vec![
            "hubs/a/hub.yaml".to_owned(),
            "hubs/b/hub.yaml".to_owned()
        ])
    );
    assert_eq!(folder.list(Some("missing")), Ok(vec![]));
    assert_eq!(folder.list(Some("agents/review.yaml")), Ok(vec![]));
    let refused = folder.list(Some(".git")).map_err(|error| error.kind());
    assert_eq!(refused, Err("private_path"));
    let refused = folder
        .list(Some("hubs/../agents"))
        .map_err(|error| error.kind());
    assert_eq!(refused, Err("unsafe_path"));
}

#[test]
fn workspace_files_read_text_and_nothing_where_no_file_is() {
    let scratch = Scratch::new("read");
    scratch.put("agents/review.yaml", "name: review\n");
    scratch.put("agents/logo.png", [0x89, 0x50, 0xff, 0xfe]);
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    assert_eq!(
        folder.read("agents/review.yaml"),
        Ok(Some("name: review\n".to_owned()))
    );
    assert_eq!(folder.read("agents/missing.yaml"), Ok(None));
    assert_eq!(folder.read("agents"), Ok(None));
    assert_eq!(folder.read("agents/review.yaml/inside"), Ok(None));
    assert_eq!(
        folder.read("agents/logo.png"),
        Err(FileError::NotText {
            path: "agents/logo.png".to_owned()
        })
    );
    let refused = folder.read(".env").map_err(|error| error.kind());
    assert_eq!(refused, Err("private_path"));
}

#[test]
fn workspace_files_write_creating_folders_and_leaving_no_temporary_file() {
    let scratch = Scratch::new("write");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    let written = folder.write("hubs/a/hub.yaml", "name: a\n", None);
    assert_eq!(written, Ok(WriteOutcome::Written));
    let replaced = folder.write("hubs/a/hub.yaml", "name: b\n", None);
    assert_eq!(replaced, Ok(WriteOutcome::Written));
    assert_eq!(
        folder.read("hubs/a/hub.yaml"),
        Ok(Some("name: b\n".to_owned()))
    );
    assert_eq!(scratch.names_in("hubs/a"), ["hub.yaml"]);

    let refused = folder
        .write(".git/config", "x", None)
        .map_err(|error| error.kind());
    assert_eq!(refused, Err("private_path"));
    let refused = folder
        .write("hubs/a", "x", None)
        .map_err(|error| error.kind());
    assert_eq!(refused, Err("io"));
    let refused = folder
        .write("hubs/a/hub.yaml/x", "x", None)
        .map_err(|error| error.kind());
    assert_eq!(refused, Err("io"));
    assert!(!scratch.at(".git").exists());
}

#[test]
fn workspace_files_write_only_what_the_caller_expected_to_replace() {
    let scratch = Scratch::new("expected");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    let created = folder.write("a.yaml", "one\n", Some("absent"));
    assert_eq!(created, Ok(WriteOutcome::Written));
    let again = folder.write("a.yaml", "two\n", Some("absent"));
    assert_eq!(
        again,
        Ok(WriteOutcome::ChangedOnDisk {
            current: Some("one\n".to_owned())
        })
    );
    let stale = folder.write("a.yaml", "two\n", Some(&content_digest("zero\n")));
    assert_eq!(
        stale,
        Ok(WriteOutcome::ChangedOnDisk {
            current: Some("one\n".to_owned())
        })
    );
    let current = folder.write("a.yaml", "two\n", Some(&content_digest("one\n")));
    assert_eq!(current, Ok(WriteOutcome::Written));
    let gone = folder.write("b.yaml", "two\n", Some(&content_digest("one\n")));
    assert_eq!(gone, Ok(WriteOutcome::ChangedOnDisk { current: None }));
    assert_eq!(folder.read("a.yaml"), Ok(Some("two\n".to_owned())));
    assert_eq!(folder.read("b.yaml"), Ok(None));
}

#[test]
fn workspace_files_digest_text_as_content_digest_does() {
    // What Node's `crypto` gives for the UTF-8 bytes of "" and "é", as
    // `contentDigest` in `@halonicjs/std` does.
    assert_eq!(
        content_digest(""),
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(
        content_digest("\u{e9}"),
        "sha256:4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c"
    );
}

#[test]
fn workspace_files_let_one_of_two_writes_expecting_the_same_text_through() {
    let scratch = Scratch::new("race");
    scratch.put("a.yaml", "one\n");
    let locks = Arc::new(WriteLocks::default());
    let root = scratch.path().to_owned();
    let start = Arc::new(Barrier::new(8));
    let writers: Vec<_> = (0..8)
        .map(|writer| {
            let (locks, root, start) = (Arc::clone(&locks), root.clone(), Arc::clone(&start));
            thread::spawn(move || {
                let folder = WorkspaceFolder::new(root, &locks);
                start.wait();
                folder.write(
                    "a.yaml",
                    &format!("{writer}\n"),
                    Some(&content_digest("one\n")),
                )
            })
        })
        .collect();
    let outcomes: Vec<_> = writers
        .into_iter()
        .map(|writer| writer.join().expect("the writer finishes"))
        .collect();
    let written = outcomes
        .iter()
        .filter(|outcome| **outcome == Ok(WriteOutcome::Written))
        .count();
    assert_eq!(written, 1, "{outcomes:?}");
    assert_eq!(scratch.names_in(""), ["a.yaml"]);
}

#[test]
fn workspace_files_remove_a_file_and_take_a_missing_one_calmly() {
    let scratch = Scratch::new("remove");
    scratch.put("agents/review.yaml", "x");
    let locks = WriteLocks::default();
    let folder = WorkspaceFolder::new(scratch.path().to_owned(), &locks);

    assert_eq!(folder.remove("agents/review.yaml"), Ok(()));
    assert_eq!(folder.read("agents/review.yaml"), Ok(None));
    assert_eq!(folder.remove("agents/review.yaml"), Ok(()));
    assert_eq!(folder.remove("missing/a.yaml"), Ok(()));
    assert_eq!(folder.remove("agents"), Ok(()));
    assert!(scratch.at("agents").is_dir(), "a folder is left alone");
    let refused = folder.remove(".env").map_err(|error| error.kind());
    assert_eq!(refused, Err("private_path"));
}
