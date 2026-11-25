//! The updater's record file, `<profile>/updates/updater.json`: read at
//! start, written through a temporary file. What goes in it is
//! `halonic_update_state`'s to decide.

use std::path::Path;

use halonic_update_state::{RecordRead, UpdaterRecord, read_record};

/// The record, and whether it may be written. A missing file gives the
/// defaults; one that can't be read or is a newer Halonic's is left alone.
pub(super) fn read_file(file: Option<&Path>) -> (UpdaterRecord, bool) {
    let Some(file) = file else {
        return (UpdaterRecord::default(), false);
    };
    match std::fs::read_to_string(file) {
        Ok(text) => match read_record(&text) {
            RecordRead::Read(record) => (record, true),
            RecordRead::Newer => (UpdaterRecord::default(), false),
            RecordRead::Unreadable => (UpdaterRecord::default(), true),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (UpdaterRecord::default(), true)
        }
        Err(error) => {
            halonic_shell_log::record(
                "updates",
                format!("{} can't be read: {error}", file.display()),
            );
            (UpdaterRecord::default(), false)
        }
    }
}

/// Writes `text` through a temporary file and a rename, so a crash leaves
/// the old record or the new one, never half of one.
pub(super) fn write_over(file: &Path, text: &str) -> std::io::Result<()> {
    if let Some(folder) = file.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let temporary = file.with_extension("json.tmp");
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, file)
}
