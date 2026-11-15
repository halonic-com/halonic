//! What the shell asks before it saves the instructions a person trusted
//! for an agent, and what it refuses. Requirement `instruction-trust-grants`.

use std::cell::{Cell, RefCell};
use std::fs;
use std::path::PathBuf;

use halonic_trust_grant::{
    InstructionChanges, TrustState, TrustedBefore, instruction_changes, instruction_question_text,
};
use halonic_trust_store::{
    FileInstructionTrustStore, InstructionKey, InstructionPin, InstructionRecord,
};
use serde_json::{Value, json};

fn digest(digit: char) -> String {
    format!("sha256:{}", digit.to_string().repeat(64))
}

fn pin(files: &[(&str, char)]) -> InstructionPin {
    InstructionPin {
        digest: digest('f'),
        files: files
            .iter()
            .map(|(name, digit)| ((*name).to_owned(), digest(*digit)))
            .collect(),
    }
}

fn record_json(agent: &str, files: &[(&str, char)]) -> Value {
    json!({
        "location": "/workspaces/acme",
        "agent": agent,
        "pin": pin(files),
        "grantedAt": "2026-11-15T10:00:00.000Z",
    })
}

fn key(agent: &str) -> InstructionKey {
    InstructionKey {
        location: "/workspaces/acme".to_owned(),
        agent: agent.to_owned(),
    }
}

/// A store in a folder of its own, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("instruction-grants-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("the scratch folder can be created");
        Self(root)
    }

    fn store(&self) -> FileInstructionTrustStore {
        FileInstructionTrustStore::new(self.0.join("instruction-trust"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn instruction_trust_grants_list_the_files_added_removed_and_changed_since_the_pin() {
    let trusted = pin(&[
        ("AGENTS.md", 'a'),
        ("skills/old.md", 'b'),
        ("skills/same.md", 'c'),
    ]);
    let now = pin(&[
        ("AGENTS.md", 'd'),
        ("skills/new.md", 'e'),
        ("skills/same.md", 'c'),
    ]);
    assert_eq!(
        instruction_changes(&trusted, &now),
        InstructionChanges {
            added: vec!["skills/new.md".to_owned()],
            removed: vec!["skills/old.md".to_owned()],
            changed: vec!["AGENTS.md".to_owned()],
        }
    );
    assert_eq!(
        instruction_changes(&trusted, &trusted),
        InstructionChanges::default()
    );
}

#[test]
fn instruction_trust_grants_name_the_agent_its_workspace_and_what_changed() {
    let trusted = TrustedBefore::Pin(pin(&[("AGENTS.md", 'a'), ("skills/old.md", 'b')]));
    let now = pin(&[("AGENTS.md", 'd'), ("skills/new.md", 'e')]);
    let text = instruction_question_text("coder", "/workspaces/acme", &trusted, &now);
    assert!(
        text.contains("Agent: coder\nWorkspace: /workspaces/acme\n"),
        "{text}"
    );
    assert!(
        text.ends_with("Added: skills/new.md\nRemoved: skills/old.md\nChanged: AGENTS.md"),
        "{text}"
    );

    let unchanged = instruction_question_text(
        "coder",
        "/workspaces/acme",
        &TrustedBefore::Pin(now.clone()),
        &now,
    );
    assert!(
        unchanged.ends_with("No file changed since you trusted these instructions before."),
        "{unchanged}"
    );

    let first = instruction_question_text("coder", "/workspaces/acme", &TrustedBefore::Never, &now);
    assert!(first.contains("First time"), "{first}");
    assert!(
        first.ends_with("Files: AGENTS.md, skills/new.md"),
        "{first}"
    );

    let damaged = instruction_question_text(
        "coder",
        "/workspaces/acme",
        &TrustedBefore::Unreadable,
        &now,
    );
    assert!(damaged.contains("can't be read"), "{damaged}");
}

#[test]
fn instruction_trust_grants_show_hidden_characters_and_count_files_past_ten() {
    let files: Vec<(String, char)> = (0..12)
        .map(|number| (format!("skills/{number:02}.md"), 'a'))
        .collect();
    let many = InstructionPin {
        digest: digest('f'),
        files: files
            .iter()
            .map(|(name, digit)| (name.clone(), digest(*digit)))
            .collect(),
    };
    let text = instruction_question_text("coder", "/workspaces/acme", &TrustedBefore::Never, &many);
    assert!(text.contains("skills/09.md, and 2 more"), "{text}");
    assert!(!text.contains("skills/10.md"), "{text}");

    let tricky = pin(&[("AGENTS\u{202e}.md", 'a')]);
    let text = instruction_question_text(
        "co\u{200b}der",
        "/work\nspaces",
        &TrustedBefore::Never,
        &tricky,
    );
    assert!(
        text.contains("Agent: co\\u{200b}der\nWorkspace: /work\\u{000a}spaces\n"),
        "{text}"
    );
    assert!(text.contains("AGENTS\\u{202e}.md"), "{text}");
}

#[test]
fn instruction_trust_grants_save_only_when_the_person_says_yes() {
    let scratch = Scratch::new("yes-no");
    let store = scratch.store();
    let state = TrustState::default();
    let record = record_json("coder", &[("AGENTS.md", 'a')]);

    let refusal = state
        .grant_instructions(&store, &record, |_| false)
        .expect_err("the person said no");
    assert_eq!(refusal.kind(), "declined");
    assert_eq!(store.get(&key("coder")), Ok(None));

    let question = RefCell::new(String::new());
    state
        .grant_instructions(&store, &record, |text| {
            *question.borrow_mut() = text.to_owned();
            true
        })
        .expect("the person said yes");
    assert!(
        question.borrow().contains("First time"),
        "{}",
        question.borrow()
    );
    let saved = store.get(&key("coder")).unwrap().expect("saved");
    assert_eq!(saved, InstructionRecord::from_value(&record).unwrap());
}

#[test]
fn instruction_trust_grants_compare_with_the_pin_saved_for_the_same_agent_only() {
    let scratch = Scratch::new("compare");
    let store = scratch.store();
    let state = TrustState::default();
    for (agent, files) in [
        ("coder", [("AGENTS.md", 'a')]),
        ("writer", [("AGENTS.md", 'b')]),
    ] {
        state
            .grant_instructions(&store, &record_json(agent, &files), |_| true)
            .unwrap();
    }

    let question = RefCell::new(String::new());
    state
        .grant_instructions(
            &store,
            &record_json("coder", &[("AGENTS.md", 'c'), ("skills/x.md", 'd')]),
            |text| {
                *question.borrow_mut() = text.to_owned();
                true
            },
        )
        .unwrap();
    let text = question.borrow();
    assert!(
        text.ends_with("Added: skills/x.md\nChanged: AGENTS.md"),
        "{text}"
    );
    assert!(!text.contains("First time"), "{text}");
}

#[test]
fn instruction_trust_grants_replace_a_saved_record_that_cannot_be_read() {
    let scratch = Scratch::new("damaged");
    let store = scratch.store();
    let state = TrustState::default();
    let record = record_json("coder", &[("AGENTS.md", 'a')]);
    state.grant_instructions(&store, &record, |_| true).unwrap();
    let folder = scratch.0.join("instruction-trust");
    let file = fs::read_dir(&folder)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    fs::write(&file, "not json").unwrap();

    let question = RefCell::new(String::new());
    state
        .grant_instructions(&store, &record, |text| {
            *question.borrow_mut() = text.to_owned();
            true
        })
        .expect("a damaged record doesn't stop the save");
    assert!(
        question.borrow().contains("can't be read"),
        "{}",
        question.borrow()
    );
    assert!(store.get(&key("coder")).unwrap().is_some());
}

#[test]
fn instruction_trust_grants_refuse_a_record_before_asking() {
    let scratch = Scratch::new("invalid");
    let store = scratch.store();
    let state = TrustState::default();
    let asked = Cell::new(false);
    for record in [
        json!({"location": "/workspaces/acme", "agent": "coder"}),
        json!("a record"),
        {
            let mut extra = record_json("coder", &[("AGENTS.md", 'a')]);
            extra["trusted"] = json!(true);
            extra
        },
    ] {
        let refusal = state
            .grant_instructions(&store, &record, |_| {
                asked.set(true);
                true
            })
            .expect_err("the record is invalid");
        assert_eq!(refusal.kind(), "invalid_record", "{record}");
    }
    assert!(
        !asked.get(),
        "the person is never asked about an invalid record"
    );
    assert_eq!(store.get(&key("coder")), Ok(None));
}

#[test]
fn instruction_trust_grants_show_one_question_at_a_time() {
    let scratch = Scratch::new("busy");
    let store = scratch.store();
    let state = TrustState::default();
    let record = record_json("coder", &[("AGENTS.md", 'a')]);
    let second = record_json("writer", &[("AGENTS.md", 'b')]);

    state
        .grant_instructions(&store, &record, |_| {
            // The first question is showing: a second one is refused.
            let refusal = state
                .grant_instructions(&store, &second, |_| panic!("no second question"))
                .expect_err("the shell is asking");
            assert_eq!(refusal.kind(), "busy");
            true
        })
        .unwrap();
    assert_eq!(store.get(&key("writer")), Ok(None));
    // Once the first is answered, the next may ask.
    state.grant_instructions(&store, &second, |_| true).unwrap();
}
