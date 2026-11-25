// Tests for studio.src-tauri.crates.login-item.login-item: each name starts
// with `login_item_` until the trace check reads `cargo test` results.

use std::path::Path;

use super::*;

#[test]
fn login_item_quotes_a_windows_path_with_spaces_and_adds_only_background() {
    let value = run_value(Path::new(r"D:\Acme Tools\Halonic\Halonic.exe")); // leak-guard: allow absolute-path made-up install paths under test
    assert_eq!(
        value,
        Ok(r#""D:\Acme Tools\Halonic\Halonic.exe" --background"#.to_owned()) // leak-guard: allow absolute-path made-up install paths under test
    );
}

#[test]
fn login_item_escapes_a_linux_path_as_the_desktop_entry_spec_says() {
    let entry = desktop_entry(Path::new("/opt/Acme $x/100%/a\\b/Halonic")).expect("a safe path");
    assert!(
        entry.contains("\nExec=\"/opt/Acme \\\\$x/100%%/a\\\\\\\\b/Halonic\" --background\n"),
        "{entry}"
    );
    assert!(entry.starts_with("[Desktop Entry]\nType=Application\n"));
}

#[test]
fn login_item_writes_the_macos_path_and_argument_as_separate_escaped_strings() {
    let plist = launch_agent(
        "com.halonic.studio",
        Path::new("/Applications/A&B <x>.app/Contents/MacOS/Halonic"),
    )
    .expect("a safe path");
    assert!(plist.contains(
        "<array><string>/Applications/A&amp;B &lt;x&gt;.app/Contents/MacOS/Halonic</string><string>--background</string></array>"
    ));
    assert!(plist.contains("<key>Label</key><string>com.halonic.studio</string>"));
    assert!(plist.contains("<key>RunAtLoad</key><true/>"));
}

#[test]
fn login_item_refuses_a_path_it_cant_write_safely() {
    for path in [
        "Halonic.exe",
        "/opt/Halonic\n--other",
        "/opt/Hal\"onic",
        "/opt/Halonic\r",
    ] {
        assert_eq!(
            run_value(Path::new(path)),
            Err(LoginItemError::UnsafePath),
            "{path:?}"
        );
        assert_eq!(
            desktop_entry(Path::new(path)),
            Err(LoginItemError::UnsafePath),
            "{path:?}"
        );
        assert_eq!(
            launch_agent("l", Path::new(path)),
            Err(LoginItemError::UnsafePath),
            "{path:?}"
        );
    }
}
