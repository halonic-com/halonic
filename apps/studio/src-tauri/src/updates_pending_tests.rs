//! Tests for `studio.src-tauri.update-pending`: the pending update is
//! reused only when it verifies, and the folders hold at most two
//! installers. The keys and signatures are invented for these tests, never
//! the release keys: base64 of minisign text, as the manifest carries it,
//! over the bytes of `PAYLOAD`, signed for 9.0.0 and 8.0.0.

use std::path::{Path, PathBuf};

use halonic_update_state::{UpdateTrack, is_installer};
use serde_json::{Value, json};
use tauri::test::{MockRuntime, mock_builder};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

use super::{prune, reuse, write_pending};

const PAYLOAD: &[u8] = b"acme update payload\n";
const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkgMzc2OTdFMzRCNzYwODNCRApSV1M5ZzJDM05INXBOLzJjRGVSb3NFdmxjSTkwaDVqeVpCRkV5R21RMUc4c0tsS0NWdTloNmlxMA==";
const OTHER_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkgOTNDMEU1NTEwRkQ0RTZBMQpSV1NoNXRRUFVlWEFrelRUQzBsb0hxaXNPaVNiOCtYUzZraHhzMkZmUFkzbm9pK2o2U1lGRHdWcw==";
const SIGNED_9: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTOWcyQzNOSDVwTnhXRjJ3dU8xME5tekI1N1gwY2xkTnA0Qld4WlpOY09kUWtUNlN2WXQ5V0xtb3RKNkk2cHQxK0U0eGJoNlRTU3JYSGNpVTZ0TndWODVwOFNnWEFLbVEwPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzY3MjI1NjAwCWZpbGU6YWNtZS51cGRhdGUJdmVyc2lvbjo5LjAuMAo2TjVpWlBSejN1Y2tzZ2ZhT2wrN3JMQmhvV3NwMmR1K3R2aW96Z3FuZXJNK3NWSTgyUFdFeXFmelhOTFU5bmhWeVh2UnNwYlpEZ0V0S3R3ZCt4bU1DZz09";
const SIGNED_8: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTOWcyQzNOSDVwTnhXRjJ3dU8xME5tekI1N1gwY2xkTnA0Qld4WlpOY09kUWtUNlN2WXQ5V0xtb3RKNkk2cHQxK0U0eGJoNlRTU3JYSGNpVTZ0TndWODVwOFNnWEFLbVEwPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzY3MjI1NjAwCWZpbGU6YWNtZS51cGRhdGUJdmVyc2lvbjo4LjAuMAplRDZ6Q2xGeUpoY3JkWVFtTjJ4Y0FzdjlOTVJ3T0wyd2VYbTBqbVRQUlEwQ2x3M0cybUVZK0NSNlBWWG8yQkNkTHFhOWlFN1pjRDc3VWpNMU8vbjFEdz09";

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(test: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "halonic-update-pending-{test}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder");
        Self(folder)
    }

    fn pending(&self) -> PathBuf {
        self.0.join("pending")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn app() -> tauri::App<MockRuntime> {
    mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(tauri::generate_context!())
        .expect("the app builds on the mock runtime")
}

/// The app's updater, checking with `pubkey`, for the manifests below.
fn updater(app: &tauri::App<MockRuntime>, pubkey: &str) -> Updater {
    app.updater_builder()
        .pubkey(pubkey)
        .target("acme-target")
        .build()
        .expect("an updater")
}

fn manifest(version: &str, signature: &str) -> Value {
    json!({
        "version": version,
        "platforms": {
            "acme-target": { "url": "https://updates.test/acme.update", "signature": signature }
        }
    })
}

/// `version`'s update as the download kept it, written to `folder`.
fn kept(updater: &Updater, folder: &Path, version: &str, signature: &str) -> Update {
    let update = updater
        .restore_update(manifest(version, signature))
        .expect("a manifest")
        .expect("newer than the app");
    write_pending(folder, &update, UpdateTrack::Stable, PAYLOAD).expect("written");
    update
}

fn names(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(folder)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn reused_version(folder: &Path, track: UpdateTrack, updater: &Updater) -> Option<String> {
    reuse(folder, track, updater).map(|(update, _)| update.version)
}

#[test]
fn update_pending_a_verified_download_is_reused_after_a_restart() {
    let scratch = Scratch::new("reused");
    let app = app();
    let updater = updater(&app, PUBKEY);
    kept(&updater, &scratch.pending(), "9.0.0", SIGNED_9);
    assert_eq!(
        reused_version(&scratch.pending(), UpdateTrack::Stable, &updater),
        Some("9.0.0".to_owned())
    );
    assert_eq!(
        names(&scratch.pending()),
        vec!["Halonic-9.0.0.json", "Halonic-9.0.0.update"]
    );
}

#[test]
fn update_pending_a_changed_byte_is_refused_and_removed() {
    let scratch = Scratch::new("changed");
    let app = app();
    let updater = updater(&app, PUBKEY);
    kept(&updater, &scratch.pending(), "9.0.0", SIGNED_9);
    let mut changed = PAYLOAD.to_vec();
    changed[0] ^= 1;
    std::fs::write(scratch.pending().join("Halonic-9.0.0.update"), changed).expect("written");
    assert_eq!(
        reused_version(&scratch.pending(), UpdateTrack::Stable, &updater),
        None
    );
    assert!(names(&scratch.pending()).is_empty());
}

#[test]
fn update_pending_the_other_tracks_key_or_track_is_refused() {
    let scratch = Scratch::new("other-key");
    let app = app();
    kept(
        &updater(&app, PUBKEY),
        &scratch.pending(),
        "9.0.0",
        SIGNED_9,
    );
    let other = updater(&app, OTHER_PUBKEY);
    assert_eq!(
        reused_version(&scratch.pending(), UpdateTrack::Stable, &other),
        None
    );
    assert!(names(&scratch.pending()).is_empty());

    kept(
        &updater(&app, PUBKEY),
        &scratch.pending(),
        "9.0.0",
        SIGNED_9,
    );
    let preview = reused_version(
        &scratch.pending(),
        UpdateTrack::Preview,
        &updater(&app, PUBKEY),
    );
    assert_eq!(preview, None);
    assert!(names(&scratch.pending()).is_empty());
}

#[test]
fn update_pending_an_older_installer_under_a_newer_version_is_refused() {
    let scratch = Scratch::new("relabelled");
    let app = app();
    let updater = updater(&app, PUBKEY);
    // The record says 9.0.0, but the signature was made for 8.0.0.
    kept(&updater, &scratch.pending(), "9.0.0", SIGNED_8);
    assert_eq!(
        reused_version(&scratch.pending(), UpdateTrack::Stable, &updater),
        None
    );
    assert!(names(&scratch.pending()).is_empty());
}

#[test]
fn update_pending_a_version_no_longer_newer_and_half_saves_go() {
    let scratch = Scratch::new("stale");
    let app = app();
    let updater = updater(&app, PUBKEY);
    let pending = scratch.pending();
    std::fs::create_dir_all(&pending).expect("the folder");
    let old = json!({ "track": "stable", "update": manifest("0.0.1", SIGNED_9) });
    std::fs::write(pending.join("Halonic-0.0.1.json"), old.to_string()).expect("written");
    std::fs::write(pending.join("Halonic-0.0.1.update"), PAYLOAD).expect("written");
    std::fs::write(pending.join("Halonic-9.0.0.update.tmp"), PAYLOAD).expect("written");
    std::fs::write(pending.join("Halonic-8.0.0.update"), PAYLOAD).expect("written");
    assert_eq!(
        reused_version(&pending, UpdateTrack::Stable, &updater),
        None
    );
    assert!(names(&pending).is_empty());
}

#[test]
fn update_pending_a_newer_release_replaces_the_pending_one_within_two_installers() {
    let scratch = Scratch::new("replaced");
    let app = app();
    let updater = updater(&app, PUBKEY);
    let installers = scratch.0.join("installers");
    std::fs::create_dir_all(&installers).expect("the folder");
    std::fs::write(installers.join("Halonic-0.1.1-windows-x64-setup.exe"), b"").expect("written");
    std::fs::write(installers.join("Halonic-0.1.1.srt-setup"), b"1").expect("written");
    kept(&updater, &scratch.pending(), "8.0.0", SIGNED_8);
    kept(&updater, &scratch.pending(), "9.0.0", SIGNED_9);
    prune(&scratch.pending(), Some("9.0.0"));
    assert_eq!(
        names(&scratch.pending()),
        vec!["Halonic-9.0.0.json", "Halonic-9.0.0.update"]
    );
    let all: Vec<String> = [names(&installers), names(&scratch.pending())].concat();
    assert_eq!(all.iter().filter(|name| is_installer(name)).count(), 2);
}
