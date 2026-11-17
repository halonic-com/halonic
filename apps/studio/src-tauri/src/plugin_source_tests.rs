//! Requirement `plugin-source`: the folder a person picks to add a plugin
//! from, and what the shell reads of it for the page, whatever the page asks.

use std::path::{Path, PathBuf};

use halonic_git_guard::plain_path;
use halonic_profile::{Platform, ProfileFolder};
use halonic_workspace_files::FolderReader;

use super::{MAX_BYTES, MAX_ENTRIES, PluginSources, check_source, source_entries, source_read};

/// A folder of its own for one test, removed when the test ends. The
/// profile is `profile` in it; the plugin source is `source`.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("plugin-source-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(folder.join("source")).expect("the scratch folder");
        std::fs::create_dir_all(folder.join("profile")).expect("the profile folder");
        // The real path, as the shell works with it (macOS's temp folder is a link).
        Self(std::fs::canonicalize(folder).expect("the real path"))
    }

    fn source(&self) -> PathBuf {
        self.0.join("source")
    }

    fn profile(&self) -> ProfileFolder {
        ProfileFolder {
            platform: Platform::current(),
            root: self.0.join("profile").to_str().expect("UTF-8").to_owned(),
        }
    }

    fn write(&self, path: &str, text: &str) {
        let target = self.source().join(path);
        std::fs::create_dir_all(target.parent().expect("a parent")).expect("the folder");
        std::fs::write(target, text).expect("the file");
    }

    fn reader(&self) -> FolderReader {
        FolderReader::new(self.source())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn paths(scratch: &Scratch, dir: Option<&str>, limit: Option<usize>) -> Vec<String> {
    source_entries(&scratch.reader(), dir, limit, true)
        .expect("the entries")
        .into_iter()
        .map(|entry| entry.path)
        .collect()
}

#[cfg(unix)]
fn link(target: &Path, at: &Path) {
    std::os::unix::fs::symlink(target, at).expect("the link");
}

#[test]
fn plugin_source_test_lists_and_reads_a_folder_without_its_git_folder() {
    let scratch = Scratch::new("git");
    scratch.write("plugin.yaml", "id: acme-weather\n");
    scratch.write("src/index.js", "export {};\n");
    scratch.write(".git/HEAD", "ref: refs/heads/main\n");
    scratch.write(".git/objects/aa/bb", "x");

    assert_eq!(
        paths(&scratch, None, None),
        ["plugin.yaml", "src", "src/index.js"]
    );
    assert_eq!(paths(&scratch, Some(".git"), None), Vec::<String>::new());
    assert_eq!(
        source_read(&scratch.reader(), &scratch.source(), "plugin.yaml").expect("a read"),
        Some(b"id: acme-weather\n".to_vec())
    );
    assert_eq!(
        source_read(&scratch.reader(), &scratch.source(), ".git/HEAD").expect("a read"),
        None
    );
}

#[test]
fn plugin_source_test_refuses_a_path_outside_the_source() {
    let scratch = Scratch::new("dots");
    scratch.write("plugin.yaml", "id: a\n");
    std::fs::write(scratch.0.join("secret.txt"), "private").expect("a file beside");

    let refusal = source_read(&scratch.reader(), &scratch.source(), "../secret.txt")
        .expect_err("a path out of the source");
    assert_eq!(refusal.kind(), "unsafe_path");
    assert!(source_entries(&scratch.reader(), Some(".."), None, true).is_err());
}

#[cfg(unix)]
#[test]
fn plugin_source_test_follows_no_link_and_opens_no_special_file() {
    let scratch = Scratch::new("links");
    scratch.write("plugin.yaml", "id: a\n");
    std::fs::write(scratch.0.join("secret.txt"), "private").expect("a file beside");
    link(
        &scratch.0.join("secret.txt"),
        &scratch.source().join("stolen"),
    );
    link(
        &scratch.0.join("profile"),
        &scratch.source().join("via-link"),
    );
    let made = std::process::Command::new("mkfifo")
        .arg(scratch.source().join("pipe"))
        .status()
        .expect("mkfifo runs");
    assert!(made.success());

    let reader = scratch.reader();
    let listed = source_entries(&reader, None, None, true).expect("the entries");
    let kind = |name: &str| {
        listed
            .iter()
            .find(|entry| entry.path == name)
            .map(|entry| format!("{:?}", entry.kind))
    };
    assert_eq!(kind("stolen").as_deref(), Some("Link"));
    assert_eq!(kind("via-link").as_deref(), Some("Link"));
    assert_eq!(kind("pipe").as_deref(), Some("Other"));
    let source = scratch.source();
    assert_eq!(
        source_read(&reader, &source, "stolen")
            .expect_err("a link")
            .kind(),
        "private_path"
    );
    assert_eq!(
        source_read(&reader, &source, "pipe")
            .expect_err("a pipe")
            .kind(),
        "special_path"
    );
}

#[test]
fn plugin_source_test_refuses_a_file_larger_than_a_plugin_may_be() {
    let scratch = Scratch::new("big");
    let file = std::fs::File::create(scratch.source().join("big.bin")).expect("the file");
    file.set_len(MAX_BYTES + 1).expect("a sparse file");

    let refusal = source_read(&scratch.reader(), &scratch.source(), "big.bin")
        .expect_err("a file that is too big");
    assert_eq!(refusal.kind(), "too_big");
}

#[test]
fn plugin_source_test_stops_one_entry_past_the_limit_and_skips_git_for_it() {
    let scratch = Scratch::new("many");
    for number in 0..5 {
        scratch.write(&format!("file-{number}.txt"), "x");
    }
    // A long history in `.git` must not use up the room.
    for number in 0..50 {
        scratch.write(&format!(".git/objects/{number}"), "x");
    }

    assert_eq!(
        paths(&scratch, None, Some(3)).len(),
        4,
        "limit and one more"
    );
    assert_eq!(paths(&scratch, None, Some(10)).len(), 5);
    assert_eq!(
        paths(&scratch, None, Some(MAX_ENTRIES * 10)).len(),
        5,
        "the shell's own cap is the most"
    );
}

#[test]
fn plugin_source_test_accepts_a_pick_and_refuses_the_profile_and_the_plugins_folder() {
    let scratch = Scratch::new("pick");
    let profile = scratch.profile();
    let plugins = PathBuf::from(profile.plugins_folder());
    std::fs::create_dir_all(plugins.join("acme-weather")).expect("an installed plugin");

    let (real, location) = check_source(&scratch.source(), &profile).expect("a folder to use");
    assert_eq!(real, scratch.source());
    assert_eq!(
        Path::new(&location),
        Path::new(&plain_path(&scratch.source())),
        "the location is the plain path"
    );
    for refused in [
        scratch.0.join("profile"),
        plugins.clone(),
        plugins.join("acme-weather"),
    ] {
        let refusal = check_source(&refused, &profile).expect_err("a private folder");
        assert_eq!(refusal.kind(), "source_not_allowed", "{refused:?}");
    }
    // The folder that holds the profile is allowed; the reader fences the profile off.
    let (held, _) = check_source(&scratch.0, &profile).expect("a folder that holds the profile");
    assert_eq!(held, scratch.0);
    let reader = super::source_reader(&profile, held);
    let listed = source_entries(&reader, None, None, true).expect("the entries");
    assert!(listed.iter().any(|entry| entry.path == "source"));
    assert!(!listed.iter().any(|entry| entry.path.starts_with("profile")));
}

#[test]
fn plugin_source_test_refuses_a_file_and_a_folder_that_is_gone() {
    let scratch = Scratch::new("notfolder");
    scratch.write("plugin.yaml", "id: a\n");

    let file = check_source(&scratch.source().join("plugin.yaml"), &scratch.profile());
    assert!(file.is_err());
    let gone = check_source(&scratch.0.join("missing"), &scratch.profile());
    assert!(gone.is_err());
}

#[test]
fn plugin_source_test_reads_only_a_folder_picked_in_this_session() {
    let scratch = Scratch::new("session");
    let sources = PluginSources::default();
    let (real, location) = check_source(&scratch.source(), &scratch.profile()).expect("a folder");

    let refusal = sources.picked(&location).expect_err("not picked yet");
    assert_eq!(refusal.kind(), "source_not_picked");
    sources.remember(location.clone(), real.clone());
    assert_eq!(sources.picked(&location), Ok(real));
    // A typed path that was never picked, whatever it is.
    for typed in ["/", "~/.ssh", "..", ""] {
        assert_eq!(
            sources.picked(typed).expect_err("never picked").kind(),
            "source_not_picked"
        );
    }
}

#[test]
fn plugin_source_test_forgets_the_oldest_pick_after_eight() {
    let sources = PluginSources::default();
    for number in 0..9 {
        sources.remember(
            format!("/pick-{number}"),
            PathBuf::from(format!("/pick-{number}")),
        );
    }
    assert!(sources.picked("/pick-0").is_err());
    let held = sources.picked.lock().expect("the list").len();
    assert_eq!(held, 8);
}

#[cfg(unix)]
#[test]
fn plugin_source_test_refuses_a_picked_folder_swapped_for_a_link() {
    let scratch = Scratch::new("swap");
    let sources = PluginSources::default();
    let (real, location) = check_source(&scratch.source(), &scratch.profile()).expect("a folder");
    sources.remember(location.clone(), real);

    std::fs::remove_dir_all(scratch.source()).expect("the folder goes");
    std::fs::create_dir_all(scratch.0.join("elsewhere")).expect("another folder");
    link(&scratch.0.join("elsewhere"), &scratch.source());

    assert_eq!(
        sources.picked(&location).expect_err("a link now").kind(),
        "source_not_picked"
    );
}
