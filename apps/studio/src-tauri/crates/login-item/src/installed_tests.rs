// Tests for studio.src-tauri.crates.login-item.login-item: each name starts
// with `login_item_` until the trace check reads `cargo test` results.

use std::path::Path;

use super::*;

#[test]
fn login_item_counts_windows_as_installed_only_in_the_install_location() {
    let location = r#""D:\acme tools\Halonic""#; // leak-guard: allow absolute-path made-up install paths under test
    let installed = Path::new(r"D:\Acme Tools\Halonic\Halonic.exe"); // leak-guard: allow absolute-path made-up install paths under test
    let downloaded = Path::new(r"D:\Downloads\Halonic\Halonic.exe"); // leak-guard: allow absolute-path made-up install paths under test
    let below = Path::new(r"D:\Acme Tools\Halonic\updates\Halonic.exe"); // leak-guard: allow absolute-path made-up install paths under test
    if cfg!(windows) {
        assert!(in_install_location(installed, location));
        assert!(!in_install_location(downloaded, location));
        assert!(!in_install_location(below, location));
    }
    assert!(!in_install_location(installed, "\"\""));
    assert!(in_install_location(
        Path::new("/x/Halonic/Halonic.exe"),
        "\"/X/Halonic\\\""
    ));
    assert!(!in_install_location(
        Path::new("/x/Halonic/updates/Halonic.exe"),
        "\"/x/Halonic\""
    ));
}

#[test]
fn login_item_counts_macos_as_installed_only_as_a_bundle_in_applications() {
    let home = Some(Path::new("/var/acme-home"));
    assert!(in_applications(
        Path::new("/Applications/Halonic.app/Contents/MacOS/Halonic"),
        home
    ));
    assert!(in_applications(
        Path::new("/var/acme-home/Applications/Halonic.app/Contents/MacOS/Halonic"),
        home
    ));
    assert!(!in_applications(
        Path::new("/var/acme-home/Downloads/Halonic.app/Contents/MacOS/Halonic"),
        home
    ));
    assert!(!in_applications(
        Path::new("/Volumes/Halonic/Halonic.app/Contents/MacOS/Halonic"), // leak-guard: allow absolute-path made-up install paths under test
        home
    ));
    assert!(!in_applications(
        Path::new("/Applications/Halonic/Contents/MacOS/Halonic"),
        home
    ));
    assert!(!in_applications(Path::new("/Applications/Halonic"), None));
}

#[test]
fn login_item_counts_linux_as_installed_only_under_usr_or_opt() {
    assert!(in_system_folder(Path::new("/usr/bin/halonic")));
    assert!(in_system_folder(Path::new("/opt/Halonic/halonic")));
    assert!(!in_system_folder(Path::new("/srv/acme/Downloads/halonic")));
    assert!(!in_system_folder(Path::new("/tmp/.mount_Halonic/halonic"))); // leak-guard: allow absolute-path made-up install paths under test
    assert!(!in_system_folder(Path::new("/usrx/halonic")));
}
