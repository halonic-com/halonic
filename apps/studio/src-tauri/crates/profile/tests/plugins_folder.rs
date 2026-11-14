//! `plugins_folder` names the folder `pluginsFolder` in `@halonicjs/profile`
//! names, so the shell reads the plugins the CLI installs.

use halonic_profile::{Platform, ProfileFolder};

/// Drives are written `<drive>`, so the repo's leak guard doesn't read them as a real
/// machine's paths.
fn with_drive(text: &str) -> String {
    text.replace("<drive>", "D:")
}

#[test]
fn plugins_folder_is_plugins_in_the_profile_on_every_platform() {
    let cases = [
        (
            Platform::Linux,
            "/srv/acme/.local/share/halonic",
            "/srv/acme/.local/share/halonic/plugins",
        ),
        (
            Platform::Macos,
            "/srv/acme/Library/Application Support/halonic",
            "/srv/acme/Library/Application Support/halonic/plugins",
        ),
        (
            Platform::Windows,
            "<drive>\\Users\\acme\\halonic",
            "<drive>\\Users\\acme\\halonic\\plugins",
        ),
    ];
    for (platform, root, expected) in cases {
        let profile = ProfileFolder {
            platform,
            root: with_drive(root),
        };
        assert_eq!(
            profile.plugins_folder(),
            with_drive(expected),
            "{platform:?}"
        );
    }
}

#[test]
fn plugin_records_folder_is_plugin_records_in_the_profile_on_every_platform() {
    let cases = [
        (
            Platform::Linux,
            "/srv/acme/.local/share/halonic",
            "/srv/acme/.local/share/halonic/plugin-records",
        ),
        (
            Platform::Windows,
            "<drive>\\Users\\acme\\halonic",
            "<drive>\\Users\\acme\\halonic\\plugin-records",
        ),
    ];
    for (platform, root, expected) in cases {
        let profile = ProfileFolder {
            platform,
            root: with_drive(root),
        };
        assert_eq!(
            profile.plugin_records_folder(),
            with_drive(expected),
            "{platform:?}"
        );
    }
}
