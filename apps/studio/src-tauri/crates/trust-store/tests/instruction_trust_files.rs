//! The instruction trust store keeps records as `FileInstructionTrustStore`
//! in `fs-node` does, and reads what it writes (the contract
//! `contracts.instruction-trust-store`, ported). Requirement
//! `instruction-trust-files`.

use std::fs;
use std::path::PathBuf;

use halonic_trust_store::{
    FileInstructionTrustStore, InstructionKey, InstructionPin, InstructionRecord, TrustError,
    instruction_file_name,
};
use serde_json::json;

const DIGEST_A: &str = "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
const DIGEST_B: &str = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("instruction-trust-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    /// The records' folder, which doesn't exist yet.
    fn records(&self) -> PathBuf {
        self.0.join("instruction-trust")
    }

    fn store(&self) -> FileInstructionTrustStore {
        FileInstructionTrustStore::new(self.records())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn key(location: &str, agent: &str) -> InstructionKey {
    InstructionKey {
        location: location.to_owned(),
        agent: agent.to_owned(),
    }
}

fn record(location: &str, agent: &str, digest: &str) -> InstructionRecord {
    InstructionRecord {
        location: location.to_owned(),
        agent: agent.to_owned(),
        pin: InstructionPin {
            digest: digest.to_owned(),
            files: [("AGENTS.md".to_owned(), digest.to_owned())].into(),
        },
        granted_at: "2026-11-15T10:00:00.000Z".to_owned(),
    }
}

/// The file `fs-node` names for `/workspaces/acme` and `coder`, made with
/// Node's `crypto` over the UTF-16LE bytes of `["/workspaces/acme","coder"]`.
const ACME_CODER_FILE: &str =
    "18525d8a6658f9fbcfe2589a2cab1098298926095cead866ac837bd2bc7b2beb.json";

#[test]
fn instruction_trust_files_are_named_as_fs_node_names_them() {
    assert_eq!(
        instruction_file_name(&key("/workspaces/acme", "coder")),
        ACME_CODER_FILE
    );
    // JSON keeps a location ending in `/` from running into the agent id.
    assert_eq!(
        instruction_file_name(&key("/workspaces/acme/", "coder")),
        "d0b86dcae6663a44459fe3092cd93437edee571c6b4172b6d9300707052271e2.json"
    );
}

#[test]
fn instruction_trust_files_start_empty_and_give_back_every_field() {
    let scratch = Scratch::new("empty");
    let store = scratch.store();
    let acme = key("/workspaces/acme", "coder");
    assert_eq!(store.get(&acme), Ok(None));

    let saved = record("/workspaces/acme", "coder", DIGEST_A);
    store.save(&saved).unwrap();
    assert_eq!(store.get(&acme), Ok(Some(saved)));
    // Another agent in the same workspace, and the same agent elsewhere.
    assert_eq!(store.get(&key("/workspaces/acme", "writer")), Ok(None));
    assert_eq!(store.get(&key("/workspaces/other", "coder")), Ok(None));
}

#[test]
fn instruction_trust_files_replace_a_record_and_remove_it() {
    let scratch = Scratch::new("replace");
    let store = scratch.store();
    let acme = key("/workspaces/acme", "coder");
    store
        .save(&record("/workspaces/acme", "coder", DIGEST_A))
        .unwrap();
    let newer = record("/workspaces/acme", "coder", DIGEST_B);
    store.save(&newer).unwrap();
    assert_eq!(store.get(&acme), Ok(Some(newer)));

    store.remove(&acme).unwrap();
    assert_eq!(store.get(&acme), Ok(None));
    // Removing again, or an agent never trusted, is not an error.
    store.remove(&acme).unwrap();
    store.remove(&key("/workspaces/never", "coder")).unwrap();
}

#[test]
fn instruction_trust_files_write_the_layout_fs_node_reads() {
    let scratch = Scratch::new("layout");
    let store = scratch.store();
    store
        .save(&record("/workspaces/acme", "coder", DIGEST_A))
        .unwrap();

    let file = scratch.records().join(ACME_CODER_FILE);
    let text = fs::read_to_string(&file).unwrap();
    let expected = format!(
        "{{\n  \"location\": \"/workspaces/acme\",\n  \"agent\": \"coder\",\n  \"pin\": {{\n    \"digest\": \"{DIGEST_A}\",\n    \"files\": {{\n      \"AGENTS.md\": \"{DIGEST_A}\"\n    }}\n  }},\n  \"grantedAt\": \"2026-11-15T10:00:00.000Z\"\n}}\n"
    );
    assert_eq!(text, expected);

    let names: Vec<_> = fs::read_dir(scratch.records())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names, [ACME_CODER_FILE], "no temporary file stays behind");
}

#[test]
fn instruction_trust_files_read_a_record_fs_node_wrote() {
    let scratch = Scratch::new("read");
    fs::create_dir_all(scratch.records()).unwrap();
    let written = json!({
        "location": "/workspaces/acme",
        "agent": "coder",
        "pin": {"digest": DIGEST_A, "files": {"AGENTS.md": DIGEST_A, "skills/a.md": DIGEST_B}},
        "grantedAt": "2026-11-15T10:00:00.000Z",
    });
    fs::write(
        scratch.records().join(ACME_CODER_FILE),
        format!("{}\n", serde_json::to_string_pretty(&written).unwrap()),
    )
    .unwrap();

    let found = scratch
        .store()
        .get(&key("/workspaces/acme", "coder"))
        .unwrap()
        .expect("the record is there");
    assert_eq!(found.pin.files.len(), 2);
    assert_eq!(found.pin.files["skills/a.md"], DIGEST_B);
}

#[cfg(unix)]
#[test]
fn instruction_trust_files_make_the_folder_private_even_when_it_was_there() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("private");
    fs::create_dir_all(scratch.records()).unwrap();
    fs::set_permissions(scratch.records(), fs::Permissions::from_mode(0o755)).unwrap();
    scratch
        .store()
        .save(&record("/workspaces/acme", "coder", DIGEST_A))
        .unwrap();

    let mode = |path: PathBuf| fs::metadata(path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(scratch.records()), 0o700);
    assert_eq!(mode(scratch.records().join(ACME_CODER_FILE)), 0o600);
}

#[test]
fn instruction_trust_files_refuse_a_record_that_is_not_exactly_for_the_key() {
    let acme = key("/workspaces/acme", "coder");
    let valid = json!({
        "location": "/workspaces/acme",
        "agent": "coder",
        "pin": {"digest": DIGEST_A, "files": {"AGENTS.md": DIGEST_A}},
        "grantedAt": "2026-11-15T10:00:00.000Z",
    });
    let mut extra = valid.clone();
    extra["trusted"] = json!(true);
    let mut other_agent = valid.clone();
    other_agent["agent"] = json!("writer");
    let mut other_place = valid.clone();
    other_place["location"] = json!("/workspaces/other");
    let mut bad_digest = valid.clone();
    bad_digest["pin"]["digest"] = json!("sha256:ABC");
    let mut bad_file_digest = valid.clone();
    bad_file_digest["pin"]["files"]["AGENTS.md"] = json!("md5:abc");
    let mut extra_pin_field = valid.clone();
    extra_pin_field["pin"]["extra"] = json!(1);
    let mut no_time = valid.clone();
    no_time.as_object_mut().unwrap().remove("grantedAt");

    let damaged = [
        extra.to_string(),
        other_agent.to_string(),
        other_place.to_string(),
        bad_digest.to_string(),
        bad_file_digest.to_string(),
        extra_pin_field.to_string(),
        no_time.to_string(),
        "{\"location\": ".to_owned(),
        String::new(),
    ];
    for (index, text) in damaged.iter().enumerate() {
        let scratch = Scratch::new(&format!("damaged-{index}"));
        fs::create_dir_all(scratch.records()).unwrap();
        fs::write(scratch.records().join(ACME_CODER_FILE), text).unwrap();
        let store = scratch.store();
        match store.get(&acme) {
            Err(TrustError::Unreadable { location, .. }) => {
                assert_eq!(location.as_deref(), Some("/workspaces/acme"), "{text}");
            }
            other => panic!("{text}: expected unreadable, got {other:?}"),
        }
        // Remove deletes it unread, and a save replaces it.
        store.remove(&acme).unwrap();
        assert_eq!(store.get(&acme), Ok(None), "{text}");
    }
}

#[test]
fn instruction_trust_files_refuse_a_record_that_is_not_valid_to_save() {
    for value in [
        json!({"location": "/workspaces/acme", "agent": "coder"}),
        json!({"location": "/w", "agent": "c", "pin": {"digest": "sha256:ab", "files": {}}, "grantedAt": "x"}),
        json!({"location": "/w", "agent": "c", "pin": {"digest": DIGEST_A, "files": {}}, "grantedAt": "x", "extra": 1}),
        json!("not an object"),
    ] {
        assert_eq!(
            InstructionRecord::from_value(&value),
            Err(TrustError::InvalidRecord),
            "{value}"
        );
    }
}

#[cfg(unix)]
#[test]
fn instruction_trust_files_refuse_a_record_that_is_a_link() {
    let scratch = Scratch::new("link");
    fs::create_dir_all(scratch.records()).unwrap();
    // A record the agent could edit, in its workspace, linked as the agent's record.
    let elsewhere = scratch.0.join("workspace-copy.json");
    let valid = json!({
        "location": "/workspaces/acme",
        "agent": "coder",
        "pin": {"digest": DIGEST_A, "files": {"AGENTS.md": DIGEST_A}},
        "grantedAt": "2026-11-15T10:00:00.000Z",
    });
    fs::write(&elsewhere, valid.to_string()).unwrap();
    std::os::unix::fs::symlink(&elsewhere, scratch.records().join(ACME_CODER_FILE)).unwrap();

    let store = scratch.store();
    let acme = key("/workspaces/acme", "coder");
    assert!(matches!(
        store.get(&acme),
        Err(TrustError::Unreadable { .. })
    ));
    // Removing deletes the link, never the file it points to.
    store.remove(&acme).unwrap();
    assert!(elsewhere.exists());
    assert_eq!(store.get(&acme), Ok(None));
}
