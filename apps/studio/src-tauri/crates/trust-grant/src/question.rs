/// The most characters of a path the question shows. A longer one is
/// shortened in the middle, so the start and the folder's own name stay.
const MAX_SHOWN_CHARS: usize = 160;

/// The question's title (decided with Sofia on HAL-2653).
pub const QUESTION_TITLE: &str = "Trust this folder?";

/// The button that trusts the folder.
pub const TRUST_BUTTON: &str = "Trust";

/// The button that doesn't. Closing the dialog or pressing Escape answers it too.
pub const CANCEL_BUTTON: &str = "Cancel";

/// The question's text, followed by the folder on its own line.
const QUESTION_TEXT: &str = "Halonic wants access to a folder you didn't pick yourself. \
If you trust it, Halonic can read and change its files, run git in it and start the \
programs listed in its workspace:";

/// The question about a folder: why the shell asks, then the folder as
/// [`shown_path`] writes it, on its own line.
pub fn question_text(location: &str) -> String {
    format!("{QUESTION_TEXT}\n\n{}", shown_path(location))
}

/// A path as the question shows it, so it can't mislead the person about
/// which folder they trust: a path longer than [`MAX_SHOWN_CHARS`] is
/// shortened in the middle, and every control, invisible or text-direction
/// character is written out as `\u{…}`, so it can't hide or reorder parts
/// of the path.
pub fn shown_path(path: &str) -> String {
    let characters: Vec<char> = path.chars().collect();
    if characters.len() <= MAX_SHOWN_CHARS {
        return visible(&characters);
    }
    let kept = (MAX_SHOWN_CHARS - 1) / 2;
    let start = &characters[..kept];
    let end = &characters[characters.len() - kept..];
    format!("{}…{}", visible(start), visible(end))
}

fn visible(characters: &[char]) -> String {
    characters
        .iter()
        .map(|&character| {
            if is_hidden(character) {
                format!("\\u{{{:04x}}}", u32::from(character))
            } else {
                character.to_string()
            }
        })
        .collect()
}

/// Control characters, and the characters that are invisible or change
/// how text around them is shown: the soft hyphen, the Mongolian vowel
/// separator, direction marks, embeddings, overrides, isolates, zero-width
/// spaces and joiners, the line and paragraph separators, the byte order
/// mark and the interlinear annotation marks.
fn is_hidden(character: char) -> bool {
    character.is_control()
        || matches!(
            character,
            '\u{00ad}'
                | '\u{061c}'
                | '\u{180e}'
                | '\u{200b}'..='\u{200f}'
                | '\u{2028}'..='\u{202e}'
                | '\u{2060}'..='\u{2069}'
                | '\u{feff}'
                | '\u{fff9}'..='\u{fffb}'
        )
}
