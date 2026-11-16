//! The folders the host sweeps.

use super::sweep_roots;

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
