use halonic_trust_store::InstructionPin;

use crate::question::shown_path;

/// The title of the question about an agent's instructions.
pub const INSTRUCTIONS_QUESTION_TITLE: &str = "Trust these instructions?";

/// The most file names the question lists for each kind of change. The
/// rest are counted, so a pin with thousands of files still gives a dialog
/// a person can read.
const MAX_SHOWN_FILES: usize = 10;

/// What the person trusted for the agent before.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustedBefore {
    /// Nothing: this is the first time they are asked.
    Never,
    /// A record the shell can't read, so what changed can't be listed.
    Unreadable,
    /// The pin they trusted.
    Pin(InstructionPin),
}

/// How a set of instructions differs from a trusted pin, by file name, each
/// list sorted.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct InstructionChanges {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub changed: Vec<String>,
}

impl InstructionChanges {
    fn is_empty(&self) -> bool {
        self.added.is_empty() && self.removed.is_empty() && self.changed.is_empty()
    }
}

/// The files added to, removed from and changed in `now` since `trusted`.
pub fn instruction_changes(trusted: &InstructionPin, now: &InstructionPin) -> InstructionChanges {
    let mut changes = InstructionChanges::default();
    for (name, digest) in &now.files {
        match trusted.files.get(name) {
            None => changes.added.push(name.clone()),
            Some(before) if before != digest => changes.changed.push(name.clone()),
            Some(_) => {}
        }
    }
    changes.removed = trusted
        .files
        .keys()
        .filter(|name| !now.files.contains_key(*name))
        .cloned()
        .collect();
    changes
}

/// The question about an agent's instructions: why the shell asks, the
/// agent and its workspace, and what changed since the pin the person
/// trusted before, or that this is the first time. The agent's id, the
/// workspace and every file name go through [`shown_path`], so none of them
/// can hide or reorder text in the dialog.
pub fn instruction_question_text(
    agent: &str,
    location: &str,
    before: &TrustedBefore,
    now: &InstructionPin,
) -> String {
    format!(
        "Halonic wants to run an agent with instructions you haven't trusted yet. \
The agent follows them whenever it works, so trust them only if you know what they say.\n\n\
Agent: {}\nWorkspace: {}\n\n{}",
        shown_path(agent),
        shown_path(location),
        what_changed(before, now),
    )
}

fn what_changed(before: &TrustedBefore, now: &InstructionPin) -> String {
    match before {
        TrustedBefore::Never => format!(
            "First time: you haven't trusted instructions for this agent before.\nFiles: {}",
            file_list(now.files.keys())
        ),
        TrustedBefore::Unreadable => format!(
            "What you trusted before can't be read, so what changed can't be listed.\nFiles: {}",
            file_list(now.files.keys())
        ),
        TrustedBefore::Pin(trusted) => {
            let changes = instruction_changes(trusted, now);
            if changes.is_empty() {
                return "No file changed since you trusted these instructions before.".to_owned();
            }
            [
                ("Added", &changes.added),
                ("Removed", &changes.removed),
                ("Changed", &changes.changed),
            ]
            .into_iter()
            .filter(|(_, names)| !names.is_empty())
            .map(|(label, names)| format!("{label}: {}", file_list(names.iter())))
            .collect::<Vec<_>>()
            .join("\n")
        }
    }
}

/// File names as the question shows them: the first [`MAX_SHOWN_FILES`],
/// then how many more there are, or `none`.
fn file_list<'a>(names: impl ExactSizeIterator<Item = &'a String>) -> String {
    let total = names.len();
    if total == 0 {
        return "none".to_owned();
    }
    let mut shown: Vec<String> = names
        .take(MAX_SHOWN_FILES)
        .map(|name| shown_path(name))
        .collect();
    if total > MAX_SHOWN_FILES {
        shown.push(format!("and {} more", total - MAX_SHOWN_FILES));
    }
    shown.join(", ")
}
