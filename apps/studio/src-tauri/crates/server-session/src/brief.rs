//! The shell's own check of a brief from the page: the page built it with
//! `buildServerSessionBrief`, but the shell writes it to disk and shows it,
//! so it checks the shape again before either.

/// The largest brief, in UTF-8 bytes, as `maxServerSessionBriefBytes`.
pub const MAX_BRIEF_BYTES: usize = 8 * 1024;

/// Why a brief is refused. The reason never repeats the brief's text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BriefRefusal {
    /// Over [`MAX_BRIEF_BYTES`].
    TooLarge,
    /// A control character other than a line break or a tab.
    ControlCharacter,
    /// The first line isn't `Task: <origin>/HAL/issues/<task>`.
    NotForTask,
}

impl BriefRefusal {
    /// The reason, for the refusal the page gets.
    pub fn reason(self) -> &'static str {
        match self {
            Self::TooLarge => "the brief is over 8 KB",
            Self::ControlCharacter => "the brief holds a control character",
            Self::NotForTask => "the brief doesn't start with the task's address",
        }
    }
}

/// Whether the first line is `Task: ` and one address, with no space, that
/// ends in `/HAL/issues/<task>`.
fn names_task(first_line: &str, task: &str) -> bool {
    first_line
        .strip_prefix("Task: ")
        .and_then(|address| address.strip_suffix(&format!("/HAL/issues/{task}")))
        .is_some_and(|origin| !origin.is_empty() && !origin.contains(char::is_whitespace))
}

/// Checks a brief for `task`, which has passed
/// [`is_task_id`](crate::is_task_id): at most 8 KB, no control character
/// other than a line break or a tab, and a first line that names the task.
/// A Rust string is always valid UTF-8, so that needs no check here.
///
/// # Errors
///
/// The first rule the brief breaks.
pub fn check_brief(task: &str, brief: &str) -> Result<(), BriefRefusal> {
    if brief.len() > MAX_BRIEF_BYTES {
        return Err(BriefRefusal::TooLarge);
    }
    let control = |character: char| character.is_control() && !matches!(character, '\n' | '\t');
    if brief.chars().any(control) {
        return Err(BriefRefusal::ControlCharacter);
    }
    let first_line = brief.split('\n').next().unwrap_or_default();
    if !names_task(first_line, task) {
        return Err(BriefRefusal::NotForTask);
    }
    Ok(())
}
