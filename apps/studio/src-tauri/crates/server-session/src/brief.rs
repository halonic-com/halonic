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
    /// A control or format character other than a line break or a tab, or a
    /// line or paragraph separator.
    HiddenCharacter,
    /// The first line isn't `Task: <origin>/HAL/issues/<task>`.
    NotForTask,
}

impl BriefRefusal {
    /// The reason, for the refusal the page gets.
    pub fn reason(self) -> &'static str {
        match self {
            Self::TooLarge => "the brief is over 8 KB",
            Self::HiddenCharacter => "the brief holds a control or invisible character",
            Self::NotForTask => "the brief doesn't start with the task's address",
        }
    }
}

/// The Unicode format characters (`Cf`, Unicode 15.1): zero-width
/// characters, U+FEFF, the bidi controls and the tag characters, among
/// others. Each hides or reorders text, so the person could read one brief
/// in the dialog while Claude Code reads another.
const FORMAT_CHARACTERS: [(u32, u32); 21] = [
    (0xAD, 0xAD),
    (0x600, 0x605),
    (0x61C, 0x61C),
    (0x6DD, 0x6DD),
    (0x70F, 0x70F),
    (0x890, 0x891),
    (0x8E2, 0x8E2),
    (0x180E, 0x180E),
    (0x200B, 0x200F),
    (0x202A, 0x202E),
    (0x2060, 0x2064),
    (0x2066, 0x206F),
    (0xFEFF, 0xFEFF),
    (0xFFF9, 0xFFFB),
    (0x110BD, 0x110BD),
    (0x110CD, 0x110CD),
    (0x13430, 0x1343F),
    (0x1BCA0, 0x1BCA3),
    (0x1D173, 0x1D17A),
    (0xE0001, 0xE0001),
    (0xE0020, 0xE007F),
];

/// Whether `character` may not be in a brief: a control character other
/// than a line break or a tab, a format character, or a line or paragraph
/// separator. `isPlainLine` in `packages/core/action-steppers` refuses the
/// same ones, against the same shared cases.
fn is_hidden(character: char) -> bool {
    let code = u32::from(character);
    (character.is_control() && !matches!(character, '\n' | '\t'))
        || matches!(character, '\u{2028}' | '\u{2029}')
        || FORMAT_CHARACTERS
            .iter()
            .any(|(first, last)| (*first..=*last).contains(&code))
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
/// [`is_task_id`](crate::is_task_id): at most 8 KB, no control or format
/// character other than a line break or a tab and no line or paragraph
/// separator, and a first line that names the task.
/// A Rust string is always valid UTF-8, so that needs no check here.
///
/// # Errors
///
/// The first rule the brief breaks.
pub fn check_brief(task: &str, brief: &str) -> Result<(), BriefRefusal> {
    if brief.len() > MAX_BRIEF_BYTES {
        return Err(BriefRefusal::TooLarge);
    }
    if brief.chars().any(is_hidden) {
        return Err(BriefRefusal::HiddenCharacter);
    }
    let first_line = brief.split('\n').next().unwrap_or_default();
    if !names_task(first_line, task) {
        return Err(BriefRefusal::NotForTask);
    }
    Ok(())
}
