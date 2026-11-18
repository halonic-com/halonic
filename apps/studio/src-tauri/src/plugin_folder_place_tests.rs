//! Requirement `plugin-folder-place`: the one thing the shell writes into the
//! plugins folder for the page, whatever the page asks.

use std::path::PathBuf;

use super::{PlacedFile, Placement, check_plugin_name, decode_files, place_plugin};
use halonic_blob_store::base64url;

/// A folder of its own for one test, removed when the test ends. The
/// plugins folder is `profile/plugins` in it.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("plugin-place-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder");
        Self(std::fs::canonicalize(folder).expect("the real path"))
    }

    fn plugins(&self) -> PathBuf {
        self.0.join("profile").join("plugins")
    }

    fn profile_entries(&self) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(self.0.join("profile"))
            .map(|found| {
                found
                    .map(|entry| {
                        entry
                            .expect("an entry")
                            .file_name()
                            .to_string_lossy()
                            .into_owned()
                    })
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn files(list: &[(&str, &str)]) -> Vec<(String, Vec<u8>)> {
    list.iter()
        .map(|(path, text)| ((*path).to_owned(), text.as_bytes().to_vec()))
        .collect()
}

fn sent(list: &[(&str, &str)]) -> Vec<PlacedFile> {
    list.iter()
        .map(|(path, text)| PlacedFile {
            path: (*path).to_owned(),
            bytes: base64url::encode(text.as_bytes()),
        })
        .collect()
}

#[test]
fn plugin_folder_place_test_writes_the_files_as_one_new_plugin_folder() {
    let scratch = Scratch::new("writes");
    let placed = place_plugin(
        &scratch.plugins(),
        "acme-weather",
        &files(&[
            ("plugin.yaml", "id: acme-weather\n"),
            ("src/index.js", "export {};\n"),
        ]),
        false,
    );

    assert_eq!(placed, Ok(Placement::Placed));
    let folder = scratch.plugins().join("acme-weather");
    assert_eq!(
        std::fs::read_to_string(folder.join("plugin.yaml")).expect("the manifest"),
        "id: acme-weather\n"
    );
    assert!(folder.join("src/index.js").is_file());
    assert_eq!(scratch.profile_entries(), ["plugins"], "no stage is left");
}

#[test]
fn plugin_folder_place_test_never_overwrites_a_name_in_use_in_any_case() {
    let scratch = Scratch::new("taken");
    place_plugin(
        &scratch.plugins(),
        "Weather",
        &files(&[("plugin.yaml", "old\n")]),
        false,
    )
    .expect("the first");

    for name in ["Weather", "weather", "WEATHER"] {
        let placed = place_plugin(
            &scratch.plugins(),
            name,
            &files(&[("plugin.yaml", "new\n")]),
            false,
        );
        assert_eq!(placed, Ok(Placement::Taken), "{name}");
    }
    assert_eq!(
        std::fs::read_to_string(scratch.plugins().join("Weather/plugin.yaml")).expect("kept"),
        "old\n"
    );
    assert_eq!(scratch.profile_entries(), ["plugins"], "no stage is left");
}

#[test]
fn plugin_folder_place_test_replaces_only_the_folder_of_exactly_that_name() {
    let scratch = Scratch::new("replace");
    place_plugin(
        &scratch.plugins(),
        "Weather",
        &files(&[("plugin.yaml", "old\n")]),
        false,
    )
    .expect("the first");

    // Another case is not the same plugin, even with `replace`.
    let other = place_plugin(
        &scratch.plugins(),
        "weather",
        &files(&[("plugin.yaml", "x\n")]),
        true,
    );
    assert_eq!(other, Ok(Placement::Taken));
    let replaced = place_plugin(
        &scratch.plugins(),
        "Weather",
        &files(&[("plugin.yaml", "new\n"), ("extra.txt", "e")]),
        true,
    );

    assert_eq!(replaced, Ok(Placement::Placed));
    let folder = scratch.plugins().join("Weather");
    assert_eq!(
        std::fs::read_to_string(folder.join("plugin.yaml")).expect("new"),
        "new\n"
    );
    assert!(folder.join("extra.txt").is_file());
    assert_eq!(
        scratch.profile_entries(),
        ["plugins"],
        "no stage or old copy is left"
    );
}

#[cfg(unix)]
#[test]
fn plugin_folder_place_test_never_replaces_a_link_or_writes_through_one() {
    let scratch = Scratch::new("link");
    let outside = scratch.0.join("outside");
    std::fs::create_dir_all(&outside).expect("a folder outside");
    std::fs::create_dir_all(scratch.plugins()).expect("the plugins folder");
    std::os::unix::fs::symlink(&outside, scratch.plugins().join("linked")).expect("a link");

    let placed = place_plugin(
        &scratch.plugins(),
        "linked",
        &files(&[("plugin.yaml", "x")]),
        true,
    );

    assert_eq!(placed, Ok(Placement::Taken));
    assert_eq!(std::fs::read_dir(&outside).expect("outside").count(), 0);
}

#[cfg(unix)]
#[test]
fn plugin_folder_place_test_refuses_a_plugins_folder_that_is_a_link() {
    let scratch = Scratch::new("rootlink");
    let outside = scratch.0.join("outside");
    std::fs::create_dir_all(&outside).expect("a folder outside");
    std::fs::create_dir_all(scratch.0.join("profile")).expect("the profile");
    std::os::unix::fs::symlink(&outside, scratch.plugins()).expect("a link");

    let placed = place_plugin(
        &scratch.plugins(),
        "acme",
        &files(&[("plugin.yaml", "x")]),
        false,
    );

    assert!(placed.is_err());
    assert_eq!(std::fs::read_dir(&outside).expect("outside").count(), 0);
}

#[test]
fn plugin_folder_place_test_cleans_up_when_a_file_cannot_be_written() {
    let scratch = Scratch::new("abort");
    // `a` is written as a file, so `a/b` can't be made beneath it.
    let placed = place_plugin(
        &scratch.plugins(),
        "acme",
        &files(&[("a", "file"), ("a/b", "under a file")]),
        false,
    );

    assert!(placed.is_err());
    assert!(!scratch.plugins().join("acme").exists());
    assert_eq!(scratch.profile_entries(), ["plugins"], "no stage is left");
}

#[test]
fn plugin_folder_place_test_refuses_a_name_that_is_not_one_plain_folder_name() {
    for name in [
        "",
        ".",
        "..",
        "../trust",
        "acme/src",
        "acme\\src",
        "acme.",
        "acme ",
        "a:b",
        "nul",
        "COM1",
        "con.txt",
        "a~1",
        "a<b",
        "tab\tname",
    ] {
        let refusal = check_plugin_name(name).expect_err(name);
        assert_eq!(refusal.kind(), "unsafe_path", "{name:?}");
    }
    for name in ["acme-weather", "Weather", "a.b", "weather2"] {
        assert_eq!(check_plugin_name(name), Ok(()), "{name}");
    }
}

#[test]
fn plugin_folder_place_test_refuses_files_that_are_unsafe_or_clash() {
    for list in [
        vec![("../evil", "x")],
        vec![("/abs", "x")],
        vec![("a/./b", "x")],
        vec![(".git/config", "x")],
        vec![(".GIT/config", "x")],
        vec![("src/.git/config", "x")],
        vec![(".env", "x")],
        vec![("src/.env.local", "x")],
        vec![(".studio/state", "x")],
        vec![("a\\b", "x")],
        vec![("dir/nul", "x")],
        vec![("a.txt", "1"), ("A.TXT", "2")],
        vec![("a", "1"), ("A/b", "2")],
    ] {
        let refusal = decode_files(sent(&list)).expect_err(&format!("{list:?}"));
        assert_eq!(refusal.kind(), "unsafe_path", "{list:?}");
    }
    let decoded =
        decode_files(sent(&[("plugin.yaml", "id: a\n"), ("src/a.js", "1")])).expect("safe");
    assert_eq!(decoded.len(), 2);
}

#[test]
fn plugin_folder_place_test_refuses_too_many_files_and_too_many_bytes() {
    let many: Vec<PlacedFile> = (0..=super::MAX_ENTRIES)
        .map(|number| PlacedFile {
            path: format!("f{number}"),
            bytes: String::new(),
        })
        .collect();
    assert_eq!(
        decode_files(many).expect_err("too many").kind(),
        "too_many_files"
    );

    let big = base64url::encode(&vec![0_u8; 26 * 1024 * 1024]);
    let two = vec![
        PlacedFile {
            path: "a".to_owned(),
            bytes: big.clone(),
        },
        PlacedFile {
            path: "b".to_owned(),
            bytes: big,
        },
    ];
    assert_eq!(decode_files(two).expect_err("too big").kind(), "too_big");

    let broken = vec![PlacedFile {
        path: "a".to_owned(),
        bytes: "***".to_owned(),
    }];
    assert_eq!(
        decode_files(broken).expect_err("not base64url").kind(),
        "io"
    );
}
