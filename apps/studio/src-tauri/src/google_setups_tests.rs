//! Requirement `google-setup-command`: what `google_setup_read` reads, and
//! never reads.

use std::path::{Path, PathBuf};

use halonic_profile::{Platform, ProfileFolder};
use halonic_record_store::{RecordFolders, log_name};

use super::{SETUP_COLLECTION, read_setup_lines};
use crate::runs::OperatingSystem;

/// A profile folder of its own for one test, removed when the test ends.
struct Profile(PathBuf);

impl Profile {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("google-setup-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the profile can be created");
        Self(folder)
    }

    fn folder(&self) -> ProfileFolder {
        ProfileFolder {
            platform: Platform::current(),
            root: self
                .0
                .to_str()
                .expect("a Unicode temporary folder")
                .to_owned(),
        }
    }

    fn plant(&self, relative: &[&str], contents: &str) {
        let file = relative
            .iter()
            .fold(self.0.clone(), |folder, name| folder.join(name));
        std::fs::create_dir_all(file.parent().expect("a file has a folder")).unwrap();
        std::fs::write(file, contents).unwrap();
    }
}

impl Drop for Profile {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn read(profile: &Profile) -> Result<super::SetupLines, crate::workspace_data::DataRefusal> {
    read_setup_lines(
        &RecordFolders::<OperatingSystem>::default(),
        &profile.folder(),
    )
}

#[test]
fn google_setup_command_reads_the_setup_records_of_the_profile() {
    let profile = Profile::new("reads");
    let log = "{\"collection\":\"_google_setups\",\"id\":\"acct-acme\",\"op\":\"add\"}\n";
    profile.plant(&["google", "setups", &log_name(SETUP_COLLECTION)], log);

    let answer = read(&profile).expect("the records are read");

    assert_eq!(answer.lines, log);
}

#[test]
fn google_setup_command_answers_no_lines_and_makes_nothing_when_no_setup_was_saved() {
    let profile = Profile::new("empty");

    let answer = read(&profile).expect("a missing log reads as no lines");

    assert_eq!(answer.lines, "");
    assert!(
        !Path::new(&profile.folder().root).join("google").exists(),
        "reading must not create the google folder"
    );
}

#[test]
fn google_setup_command_never_returns_a_secret_kept_in_the_google_folder() {
    let profile = Profile::new("secrets");
    profile.plant(&["google", "client-secret.json"], "sealed-client-secret");
    profile.plant(
        &["google", "setups", "client-secret"],
        "sealed-client-secret",
    );
    profile.plant(
        &["google", "tokens", &log_name("_google_client_secrets")],
        "{\"sealed\":\"sealed-client-secret\"}\n",
    );

    let answer = read(&profile).expect("the read works");

    assert_eq!(answer.lines, "");
    let expected = Path::new(&profile.folder().root)
        .join("google")
        .join("setups")
        .join(log_name(SETUP_COLLECTION));
    assert_eq!(Path::new(&answer.file), expected);
}

#[cfg(unix)]
#[test]
fn google_setup_command_refuses_a_setup_log_that_is_a_symbolic_link() {
    let profile = Profile::new("linked");
    let outside = Profile::new("linked-target");
    outside.plant(&["elsewhere.jsonl"], "{\"id\":\"elsewhere\"}\n");
    let folder = Path::new(&profile.folder().root).join("google").join("setups");
    std::fs::create_dir_all(&folder).unwrap();
    std::os::unix::fs::symlink(
        Path::new(&outside.folder().root).join("elsewhere.jsonl"),
        folder.join(log_name(SETUP_COLLECTION)),
    )
    .unwrap();

    let refusal = read(&profile).expect_err("a linked log is refused");

    assert_eq!(refusal.kind, "linked_log");
}

#[test]
fn google_setup_command_is_granted_to_the_local_main_window_only() {
    // A remote page must never read the setup records: the served Studio
    // would then see every Google account's address-free setup state.
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/desktop-google-setups.json"))
            .expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], serde_json::json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        serde_json::json!(["allow-google-setup-read"])
    );
}
