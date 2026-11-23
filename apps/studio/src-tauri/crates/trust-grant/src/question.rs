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

/// Control characters, every character Unicode marks as default-ignorable
/// (shown as nothing when a font has no glyph for it: the soft hyphen,
/// the combining grapheme joiner, Hangul fillers, Khmer inherent vowels,
/// Mongolian variation selectors and vowel separator, direction marks,
/// embeddings, overrides, isolates, zero-width spaces and joiners,
/// variation selectors, the byte order mark, shorthand format controls,
/// musical formatting marks and tag characters), and the line and
/// paragraph separators and interlinear annotation marks, which change
/// how the text around them is shown.
fn is_hidden(character: char) -> bool {
    character.is_control()
        || matches!(
            character,
            '\u{00ad}'
                | '\u{034f}'
                | '\u{061c}'
                | '\u{115f}'..='\u{1160}'
                | '\u{17b4}'..='\u{17b5}'
                | '\u{180b}'..='\u{180f}'
                | '\u{200b}'..='\u{200f}'
                | '\u{2028}'..='\u{202e}'
                | '\u{2060}'..='\u{206f}'
                | '\u{3164}'
                | '\u{fe00}'..='\u{fe0f}'
                | '\u{feff}'
                | '\u{ffa0}'
                | '\u{fff0}'..='\u{fffb}'
                | '\u{1bca0}'..='\u{1bca3}'
                | '\u{1d173}'..='\u{1d17a}'
                | '\u{e0000}'..='\u{e0fff}'
        )
}
