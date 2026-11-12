//! The real Windows calls behind the checks of HAL-7385's S-4 and S-5. The
//! steps themselves are tested in `steps.rs`.
#![cfg(windows)]

use halonic_sandbox_elevate::{Machine, Windows};
use std::path::PathBuf;

/// A new, empty folder for one test.
fn scratch(name: &str) -> PathBuf {
    let folder = std::env::temp_dir().join(format!("halonic-sandbox-elevate-{name}"));
    let _ = std::fs::remove_dir_all(&folder);
    std::fs::create_dir_all(&folder).expect("a scratch folder");
    folder
}

#[test]
fn sandbox_elevate_knows_a_file_and_a_folder_by_any_letter_case() {
    let folder = scratch("same-file");
    let file = folder.join("one.exe");
    std::fs::write(&file, b"one").expect("a file");
    std::fs::write(folder.join("two.exe"), b"two").expect("a file");
    let upper = |path: &PathBuf| PathBuf::from(path.to_string_lossy().to_uppercase());
    assert!(Windows.same_file(&file, &upper(&file)));
    assert!(Windows.same_file(&folder, &upper(&folder)));
    assert!(!Windows.same_file(&file, &folder.join("two.exe")));
    // A name that reaches nothing is never the same file.
    assert!(!Windows.same_file(&folder.join("none.exe"), &folder.join("none.exe")));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn sandbox_elevate_finds_no_publisher_on_an_unsigned_file() {
    // Test executables aren't signed.
    let own = std::env::current_exe().expect("this test's own path");
    assert_eq!(Windows.signer(&own), None);
}

/// Run by CI with a signed file and the publisher PowerShell reads from it,
/// so the helper reads publishers as Windows shows them.
#[test]
#[ignore = "needs HALONIC_SIGNED_FILE and HALONIC_SIGNED_PUBLISHER"]
fn sandbox_elevate_reads_the_publisher_windows_shows_and_refuses_a_changed_file() {
    let signed = PathBuf::from(std::env::var_os("HALONIC_SIGNED_FILE").expect("a signed file"));
    let publisher = std::env::var("HALONIC_SIGNED_PUBLISHER").expect("its publisher");
    assert_eq!(Windows.signer(&signed).as_deref(), Some(publisher.as_str()));
    // One byte changed in the middle, and the signature no longer holds.
    let folder = scratch("changed");
    let changed = folder.join("changed.exe");
    let mut bytes = std::fs::read(&signed).expect("the signed file");
    let middle = bytes.len() / 2;
    bytes[middle] ^= 0xff;
    std::fs::write(&changed, bytes).expect("the changed copy");
    assert_eq!(Windows.signer(&changed), None);
    let _ = std::fs::remove_dir_all(&folder);
}
