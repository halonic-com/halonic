// Tests for studio.src-tauri.crates.login-item.login-item: each name starts
// with `login_item_` until the trace check reads `cargo test` results. They
// use their own file or `Run` value, never the real entry.

use std::path::PathBuf;

use halonic_login_item::{LoginItem, LoginItemError, Place};

fn fresh_folder(name: &str) -> PathBuf {
    let folder =
        std::env::temp_dir().join(format!("halonic-login-item-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&folder);
    folder
}

fn executable() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(r"C:\Programs\Acme Halonic\Halonic.exe") // leak-guard: allow absolute-path made-up install paths under test
    } else {
        PathBuf::from("/opt/Acme Halonic/halonic")
    }
}

#[test]
fn login_item_turns_on_and_off_and_off_again() {
    let folder = fresh_folder("on-off");
    let file = folder.join("autostart").join("halonic.desktop");
    let item = LoginItem::at(executable(), Place::File(file.clone()));
    assert_eq!(item.is_on(), Ok(false));
    item.turn_on(true).expect("turned on");
    assert_eq!(item.is_on(), Ok(true));
    let text = item.entry().expect("read").expect("the entry");
    assert!(text.contains("Acme Halonic"), "{text}");
    assert!(text.contains("\" --background\n"), "{text}");
    item.turn_off().expect("turned off");
    assert_eq!(item.is_on(), Ok(false));
    item.turn_off()
        .expect("an entry that isn't there is already off");
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn login_item_writes_nothing_for_a_halonic_that_isnt_installed() {
    let folder = fresh_folder("not-installed");
    let file = folder.join("halonic.desktop");
    let item = LoginItem::at(executable(), Place::File(file.clone()));
    assert_eq!(item.turn_on(false), Err(LoginItemError::NotInstalled));
    assert!(!file.exists());
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn login_item_writes_a_launch_agent_for_a_plist_place() {
    let folder = fresh_folder("plist");
    let file = folder.join("com.halonic.studio.plist");
    let item = LoginItem::at(executable(), Place::File(file.clone()));
    item.turn_on(true).expect("turned on");
    let text = item.entry().expect("read").expect("the entry");
    assert!(text.contains("<string>--background</string>"), "{text}");
    let _ = std::fs::remove_dir_all(&folder);
}

#[cfg(windows)]
#[test]
fn login_item_writes_a_quoted_run_value_for_this_user_only() {
    let name = format!("Halonic test {}", std::process::id());
    let item = LoginItem::at(executable(), Place::RunValue(name));
    assert_eq!(item.is_on(), Ok(false));
    item.turn_on(true).expect("turned on");
    assert_eq!(item.is_on(), Ok(true));
    assert_eq!(
        item.entry(),
        Ok(Some(
            r#""C:\Programs\Acme Halonic\Halonic.exe" --background"#.to_owned() // leak-guard: allow absolute-path made-up install paths under test
        ))
    );
    item.turn_off().expect("turned off");
    assert_eq!(item.is_on(), Ok(false));
    item.turn_off()
        .expect("an entry that isn't there is already off");
}
