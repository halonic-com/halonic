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
    let utf16le: Vec<u8> = location.encode_utf16().flat_map(u16::to_le_bytes).collect();
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
/// writes it, even when the rest is damaged. `None` when the text doesn't
/// start with `{"location": "…"`. The caller believes it only when its hash
/// is the file's name, so a damaged file can't name another location.
pub(crate) fn leading_location(text: &str) -> Option<String> {
    let rest = text.trim_start().strip_prefix('{')?.trim_start();
    let rest = rest.strip_prefix("\"location\"")?.trim_start();
    let rest = rest.strip_prefix(':')?.trim_start();
    let quoted = leading_json_string(rest)?;
    let location: Value = serde_json::from_str(quoted).ok()?;
    location.as_str().map(str::to_owned)
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
