//! srt's Windows setup version across an update (HAL-5404): an update whose
//! srt needs a higher setup version than this build's asks for administrator
//! rights once more, where the agent sandbox is set up. The release's
//! `latest.json` carries the number as `halonic.srtWindowsSetupVersion`; this
//! build's comes from the one record, `windows-setup-version.json`.
//!
//! `latest.json` isn't covered by the updater's signature, only the installer
//! is, so the number found here only decides a line of text and the
//! installer's `/SANDBOX=again`. The installer decides by itself whether to
//! ask (windows/installer.nsi, `SetUpAgain`).

use serde_json::Value;

/// The record of the setup version this build's srt needs.
const RECORD: &str =
    include_str!("../../../../../../packages/adapters/sandbox-srt/windows-setup-version.json");

/// The Windows setup version this build's srt needs, or `None` when the
/// record can't be read (then no update counts as raising it).
pub fn this_build_setup_version() -> Option<u64> {
    serde_json::from_str::<Value>(RECORD)
        .ok()?
        .get("setupVersion")?
        .as_u64()
}

/// Whether the update in `manifest` raises srt's Windows setup version above
/// `this_build`. A missing or unreadable number counts as no: a manifest from
/// before the key never shows the line.
pub fn raises_setup_version(manifest: &Value, this_build: Option<u64>) -> bool {
    let found = manifest
        .pointer("/halonic/srtWindowsSetupVersion")
        .and_then(Value::as_u64);
    matches!((found, this_build), (Some(found), Some(this_build)) if found > this_build)
}

#[cfg(test)]
mod tests {
    use super::{raises_setup_version, this_build_setup_version};
    use serde_json::json;

    #[test]
    fn setup_again_reads_this_builds_number_from_the_record() {
        assert!(this_build_setup_version().is_some_and(|version| version >= 3));
    }

    #[test]
    fn setup_again_only_for_a_higher_number_in_the_manifest() {
        let manifest =
            |value| json!({ "version": "0.2.0", "halonic": { "srtWindowsSetupVersion": value } });
        assert!(raises_setup_version(&manifest(json!(4)), Some(3)));
        assert!(!raises_setup_version(&manifest(json!(3)), Some(3)));
        assert!(!raises_setup_version(&manifest(json!(2)), Some(3)));
        assert!(!raises_setup_version(&manifest(json!("4")), Some(3)));
        assert!(!raises_setup_version(&manifest(json!(-1)), Some(3)));
        assert!(!raises_setup_version(
            &json!({ "version": "0.2.0" }),
            Some(3)
        ));
        assert!(!raises_setup_version(&manifest(json!(4)), None));
    }
}
