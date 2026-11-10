//! How one record is kept on disk, exactly as `FileTrustStore` in `fs-node`
//! keeps it, so either side reads what the other wrote.

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// The length of a record file's name: 64 hex characters and `.json`.
const RECORD_FILE_NAME_LENGTH: usize = 64 + ".json".len();

/// The record file's name for a location: the lower-case hex SHA-256 of its
/// UTF-16 code units, little-endian, then `.json`. The name never holds the
/// location, so a file system that folds case or normalises Unicode still
/// keeps two locations apart.
pub(crate) fn file_name(location: &str) -> String {
    file_name_of_units(&location.encode_utf16().collect::<Vec<_>>())
}

/// `file_name` for a location given as UTF-16 code units, which may hold a
/// lone surrogate, as Windows allows and `fs-node` keeps.
pub(crate) fn file_name_of_units(units: &[u16]) -> String {
    let utf16le: Vec<u8> = units.iter().copied().flat_map(u16::to_le_bytes).collect();
    let hex: String = Sha256::digest(&utf16le)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("{hex}.json")
}

/// Whether a name in the folder is a record file. Anything else, such as a
/// leftover temporary file or a note, is left alone.
pub(crate) fn is_record_file(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == RECORD_FILE_NAME_LENGTH
        && name.ends_with(".json")
        && bytes[..64]
            .iter()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

/// The file's text: the location first, so a damaged file can still be
/// named, then the record's other fields, indented by two spaces as
/// `JSON.stringify(record, null, 2)` writes it, and a newline.
pub(crate) fn record_text(location: &str, record: &Map<String, Value>) -> String {
    let mut text = format!("{{\n  \"location\": {}", Value::from(location));
    for (key, value) in record.iter().filter(|(key, _)| key.as_str() != "location") {
        // `{:#}` writes nested values indented by two spaces from the left
        // edge; the field itself sits two spaces in.
        let value = format!("{value:#}").replace('\n', "\n  ");
        text.push_str(&format!(",\n  {}: {value}", Value::from(key.as_str())));
    }
    text.push_str("\n}\n");
    text
}

/// The location at the start of a record file's text, as `record_text`
/// writes it, even when the rest is damaged, as UTF-16 code units. They may
/// hold a lone surrogate: `fs-node` writes one as `\ud800`, which
/// `serde_json` refuses. `None` when the text doesn't start with
/// `{"location": "…"`.
pub(crate) fn leading_location(text: &str) -> Option<Vec<u16>> {
    let rest = text.trim_start().strip_prefix('{')?.trim_start();
    let rest = rest.strip_prefix("\"location\"")?.trim_start();
    let rest = rest.strip_prefix(':')?.trim_start();
    let quoted = leading_json_string(rest)?;
    json_string_units(&quoted[1..quoted.len() - 1])
}

/// The location a record file is for, read from the start of its text, as
/// UTF-16 code units. `None` when it can't be read there or its hash isn't
/// the file's name, so a damaged file can't name another location.
pub(crate) fn location_in(name: &str, text: &str) -> Option<Vec<u16>> {
    let location = leading_location(text)?;
    (file_name_of_units(&location) == name).then_some(location)
}

/// The UTF-16 code units of a JSON string's contents, quotes removed, with
/// each `\uXXXX` kept as the unit it names, paired or not. `None` when the
/// contents aren't valid JSON.
fn json_string_units(contents: &str) -> Option<Vec<u16>> {
    let mut units = Vec::with_capacity(contents.len());
    let mut characters = contents.chars();
    while let Some(character) = characters.next() {
        if character < ' ' {
            return None;
        }
        if character != '\\' {
            units.extend_from_slice(character.encode_utf16(&mut [0; 2]));
            continue;
        }
        let unit = match characters.next()? {
            '"' => u16::from(b'"'),
            '\\' => u16::from(b'\\'),
            '/' => u16::from(b'/'),
            'b' => 0x08,
            'f' => 0x0c,
            'n' => u16::from(b'\n'),
            'r' => u16::from(b'\r'),
            't' => u16::from(b'\t'),
            'u' => {
                let hex: String = characters.by_ref().take(4).collect();
                if hex.len() != 4 || !hex.chars().all(|digit| digit.is_ascii_hexdigit()) {
                    return None;
                }
                u16::from_str_radix(&hex, 16).ok()?
            }
            _ => return None,
        };
        units.push(unit);
    }
    Some(units)
}

/// The JSON string at the start of `text`, quotes included, or `None` when
/// it doesn't end on the same line.
fn leading_json_string(text: &str) -> Option<&str> {
    if !text.starts_with('"') {
        return None;
    }
    let mut escaped = false;
    for (index, character) in text.char_indices().skip(1) {
        match character {
            _ if escaped => escaped = false,
            '\\' => escaped = true,
            '"' => return Some(&text[..=index]),
            '\n' => return None,
            _ => {}
        }
    }
    None
}
