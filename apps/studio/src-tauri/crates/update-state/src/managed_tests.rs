use super::{ManagedBy, bucket_version, detect};
use std::path::Path;

const INSTALLER: &str = r"home\AppData\Local\Halonic\Halonic.exe";
const SCOOP: &str = r"home\scoop\apps\halonic\0.1.1\Halonic.exe";

// On Linux a backslash path is one file name with no parent, so the marker
// tests build their paths from the platform's own separator.
fn here(parts: &[&str]) -> std::path::PathBuf {
    parts.iter().collect()
}

#[test]
fn update_state_turns_the_updater_off_for_the_marker_next_to_the_program() {
    let exe = here(&["install", "Halonic", "Halonic.exe"]);
    let marker = here(&["install", "Halonic", "managed-by-scoop"]);
    let managed = detect(&exe, |file| file == marker).expect("managed");
    assert_eq!(managed.by, ManagedBy::Scoop);
    assert_eq!(managed.command, "scoop update halonic");
}

#[test]
fn update_state_ignores_a_marker_that_sits_somewhere_else() {
    let exe = here(&["install", "Halonic", "Halonic.exe"]);
    let elsewhere = here(&["install", "managed-by-scoop"]);
    assert_eq!(detect(&exe, |file| file == elsewhere), None);
}

#[test]
fn update_state_falls_back_to_the_scoop_install_path() {
    let managed = detect(Path::new(SCOOP), |_| false).expect("managed by the path");
    assert_eq!(managed.by, ManagedBy::Scoop);
    let shouting = r"drive\SCOOP\Apps\Halonic\current\Halonic.exe";
    assert!(detect(Path::new(shouting), |_| false).is_some());
    let forward = "home/scoop/apps/halonic/current/Halonic.exe";
    assert!(detect(Path::new(forward), |_| false).is_some());
}

#[test]
fn update_state_leaves_an_installer_or_winget_install_alone() {
    assert_eq!(detect(Path::new(INSTALLER), |_| false), None);
    let winget = r"Program Files\Halonic\Halonic.exe";
    assert_eq!(detect(Path::new(winget), |_| false), None);
    // A folder that only looks like Scoop's isn't it.
    let lookalike = r"home\scooped\apps\halonic\Halonic.exe";
    assert_eq!(detect(Path::new(lookalike), |_| false), None);
}

#[test]
fn update_state_reads_the_version_a_bucket_offers() {
    let manifest = r#"{ "version": "0.1.1", "url": "https://example.test/dl.7z" }"#;
    assert_eq!(bucket_version(manifest).as_deref(), Some("0.1.1"));
    assert_eq!(bucket_version("{}"), None);
    assert_eq!(bucket_version(r#"{ "version": 1 }"#), None);
    assert_eq!(bucket_version("not json"), None);
}
