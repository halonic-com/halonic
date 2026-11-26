//! What changed in an offered update, read from its manifest (HAL-19545):
//! `notes`, the offered version's own, and `halonic.releaseNotes`, the notes
//! of each version up to it, newest first (HAL-19542). The manifest isn't
//! signed, so all of it is untrusted plain text: it is only ever passed on,
//! capped, for the page to show as text.

use serde::Serialize;
use serde_json::Value;

use crate::version::Version;

/// At most this many versions' notes are passed on, as the release side
/// writes at most this many.
pub const MAX_NOTES_VERSIONS: usize = 50;

/// At most this many characters of notes, all versions together.
pub const MAX_NOTES_CHARS: usize = 100_000;

/// The notes of one version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionNotes {
    pub version: String,
    pub notes: String,
}

/// What changed between the installed version and the offered one.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferedNotes {
    /// The offered version's own notes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// Every version after the installed one up to the offered one, newest
    /// first. Only the offered version's own notes when the manifest has no
    /// list.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub release_notes: Vec<VersionNotes>,
    /// The list stops above the installed version, or was cut at the caps:
    /// the older notes are on the release page.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub older_on_release_page: bool,
}

/// The notes in `manifest` for an update from `installed` to `offered`:
/// versions with installed < version ≤ offered, newest first.
pub fn offered_notes(manifest: &Value, installed: &str, offered: &str) -> OfferedNotes {
    let notes = kept_notes(manifest.get("notes").and_then(Value::as_str));
    let list = manifest
        .get("halonic")
        .and_then(|halonic| halonic.get("releaseNotes"))
        .and_then(Value::as_array)
        .filter(|list| !list.is_empty());
    let (Some(list), Some(installed), Some(offered_version)) =
        (list, Version::parse(installed), Version::parse(offered))
    else {
        let release_notes = notes
            .iter()
            .map(|notes| VersionNotes {
                version: Version::parse(offered)
                    .map_or_else(|| offered.to_owned(), |version| version.to_string()),
                notes: notes.clone(),
            })
            .collect();
        return OfferedNotes {
            notes,
            release_notes,
            older_on_release_page: false,
        };
    };
    let entries: Vec<(Version, VersionNotes)> = list.iter().filter_map(entry).collect();
    let reaches_installed = entries.iter().any(|(version, _)| *version <= installed);
    let mut between: Vec<(Version, VersionNotes)> = entries
        .into_iter()
        .filter(|(version, _)| *version > installed && *version <= offered_version)
        .collect();
    // The offered version's own `notes` stand in when the list leaves it out.
    if let Some(own) = &notes
        && !between
            .iter()
            .any(|(version, _)| *version == offered_version)
    {
        between.push((
            offered_version.clone(),
            VersionNotes {
                version: offered_version.to_string(),
                notes: own.clone(),
            },
        ));
    }
    between.sort_by(|(left, _), (right, _)| right.cmp(left));
    between.dedup_by(|(left, _), (right, _)| left == right);
    let (release_notes, cut) = within_caps(between.into_iter().map(|(_, notes)| notes));
    OfferedNotes {
        notes,
        release_notes,
        older_on_release_page: cut || !reaches_installed,
    }
}

/// One list entry with a version and its notes; anything else is skipped.
fn entry(value: &Value) -> Option<(Version, VersionNotes)> {
    let version = Version::parse(value.get("version")?.as_str()?)?;
    let notes = value.get("notes")?.as_str()?;
    // The parsed version, not the manifest's text: build metadata is never
    // checked, so it could carry any text into the page's headings.
    let notes = VersionNotes {
        version: version.to_string(),
        notes: plain(notes),
    };
    Some((version, notes))
}

/// Notes as the shell passes them on and the install record keeps them for
/// the start after the update (HAL-19364): [`plain`], trimmed, cut to
/// [`MAX_NOTES_CHARS`]. `None` when nothing is left.
pub(crate) fn kept_notes(raw: Option<&str>) -> Option<String> {
    let cleaned = plain(raw?);
    let trimmed = cleaned.trim();
    (!trimmed.is_empty()).then(|| capped(trimmed, MAX_NOTES_CHARS))
}

/// `text` without control characters other than line breaks and tabs: the
/// manifest isn't signed, and the page shows the notes as they are (HAL-19365).
fn plain(text: &str) -> String {
    text.chars()
        .filter(|character| matches!(character, '\n' | '\t') || !character.is_control())
        .collect()
}

/// The first versions that fit [`MAX_NOTES_VERSIONS`] and [`MAX_NOTES_CHARS`]
/// (versions and notes counted together), and whether any were left out.
fn within_caps(all: impl Iterator<Item = VersionNotes>) -> (Vec<VersionNotes>, bool) {
    let mut kept = Vec::new();
    let mut chars = 0;
    for notes in all {
        let size = notes.version.chars().count() + notes.notes.chars().count();
        if kept.len() == MAX_NOTES_VERSIONS || chars + size > MAX_NOTES_CHARS {
            return (kept, true);
        }
        chars += size;
        kept.push(notes);
    }
    (kept, false)
}

/// `text`, cut to at most `limit` characters.
fn capped(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

#[cfg(test)]
#[path = "notes_tests.rs"]
mod tests;
