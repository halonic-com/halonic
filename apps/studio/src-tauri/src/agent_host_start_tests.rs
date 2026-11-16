//! The folders the host sweeps.

use halonic_agent_host::executable_beside;

use super::{host_file_beside, sweep_roots};

#[test]
fn agent_host_commands_sweep_the_profile_and_the_opened_folders() {
    let profile = std::env::temp_dir().join("profile");
    let acme = std::env::temp_dir().join("acme");
    assert_eq!(sweep_roots(&profile, &[]), std::slice::from_ref(&profile));
    assert_eq!(
        sweep_roots(&profile, std::slice::from_ref(&acme)),
        [profile, acme]
    );
}

#[cfg(windows)]
#[test]
fn agent_host_commands_sweep_opened_folders_without_the_long_path_prefix() {
    use std::path::PathBuf;

    let profile = PathBuf::from(r"C:\acme-profile"); // leak-guard: allow absolute-path made-up Windows path for a test
    let opened = PathBuf::from(r"\\?\D:\acme"); // leak-guard: allow absolute-path made-up Windows path for a test
    assert_eq!(
        sweep_roots(&profile, &[opened]),
        [profile, PathBuf::from(r"D:\acme")] // leak-guard: allow absolute-path made-up Windows path for a test
    );
}

#[test]
fn the_host_counts_as_installed_only_when_its_file_sits_beside_the_shell() {
    let folder = std::env::temp_dir().join(format!("host-beside-{}", std::process::id()));
    std::fs::create_dir_all(&folder).unwrap();
    let shell = folder.join("halonic-studio");
    assert!(!host_file_beside(&shell));
    std::fs::write(executable_beside(&shell).unwrap(), b"").unwrap();
    assert!(host_file_beside(&shell));
    std::fs::remove_dir_all(&folder).unwrap();
}
