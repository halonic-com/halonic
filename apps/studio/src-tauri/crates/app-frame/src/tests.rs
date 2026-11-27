//! The frames' names, arguments and places (`studio.src-tauri.app-frames`).

use super::*;

#[test]
fn host_window_reads_the_handle_after_its_argument() {
    assert_eq!(
        host_window(&["Halonic.exe", "--app", "inbox", "--host-window", "4242"]),
        Some(4242)
    );
    assert_eq!(host_window(&["Halonic.exe", "--host-window=17"]), Some(17));
}

#[test]
fn host_window_is_none_without_a_usable_handle() {
    assert_eq!(host_window(&["Halonic.exe", "--app", "inbox"]), None);
    assert_eq!(host_window(&["Halonic.exe", "--host-window"]), None);
    assert_eq!(host_window(&["Halonic.exe", "--host-window", "0"]), None);
    assert_eq!(
        host_window(&["Halonic.exe", "--host-window", "frame"]),
        None
    );
    assert_eq!(host_window(&["Halonic.exe", "--host-window=0x10"]), None);
}

#[test]
fn host_arguments_read_back_as_the_app_and_its_window() {
    let arguments = host_arguments(FrameApp::Messenger, 99);
    assert_eq!(arguments, ["--app", "messenger", "--host-window", "99"]);
    assert_eq!(host_window(&arguments), Some(99));
}

#[test]
fn each_app_is_named_as_after_app() {
    for app in FrameApp::ALL {
        assert_eq!(FrameApp::named(app.name()), Some(app));
    }
    assert_eq!(FrameApp::named("ask"), None);
    assert_eq!(FrameApp::named("Inbox"), None);
}

#[test]
fn each_app_has_the_taskbar_id_of_its_shortcut() {
    assert_eq!(
        FrameApp::Inbox.app_user_model_id(),
        "com.halonic.studio.inbox"
    );
    assert_eq!(
        FrameApp::Messenger.app_user_model_id(),
        "com.halonic.studio.messenger"
    );
}

#[test]
fn each_app_has_its_own_ico() {
    for app in FrameApp::ALL {
        assert!(halonic_window_app_id::image_for(app.ico(), 32).is_some());
    }
    assert_ne!(FrameApp::Inbox.ico(), FrameApp::Messenger.ico());
}

/// A Windows path from its parts, made up so no real folder is named.
fn windows_path(parts: &[&str]) -> PathBuf {
    PathBuf::from(parts.join("\\"))
}

#[test]
fn is_frame_exe_takes_only_the_apps_own_frame_in_halonics_folder() {
    let folder = windows_path(&["D:", "Apps", "Halonic"]);
    let inbox = windows_path(&["D:", "Apps", "Halonic", "Halonic Inbox.exe"]);
    assert!(is_frame_exe(&inbox, &folder, FrameApp::Inbox));
    // Windows paths don't tell case apart.
    let shouted = windows_path(&["d:", "apps", "HALONIC", "halonic inbox.EXE"]);
    assert!(is_frame_exe(&shouted, &folder, FrameApp::Inbox));
    let built = windows_path(&["D:", "Apps", "Halonic", "halonic-inbox.exe"]);
    assert!(is_frame_exe(&built, &folder, FrameApp::Inbox));
    // The other app's frame, another folder or another program: refused.
    assert!(!is_frame_exe(&inbox, &folder, FrameApp::Messenger));
    let elsewhere = windows_path(&["D:", "Temp", "Halonic Inbox.exe"]);
    assert!(!is_frame_exe(&elsewhere, &folder, FrameApp::Inbox));
    let other = windows_path(&["D:", "Apps", "Halonic", "notepad.exe"]);
    assert!(!is_frame_exe(&other, &folder, FrameApp::Inbox));
    let nested = windows_path(&["D:", "Apps", "Halonic", "x", "Halonic Inbox.exe"]);
    assert!(!is_frame_exe(&nested, &folder, FrameApp::Inbox));
    let bare = Path::new("Halonic Inbox.exe");
    assert!(!is_frame_exe(bare, &folder, FrameApp::Inbox));
}

#[test]
fn frame_exe_and_main_exe_find_the_files_next_to_each_other() {
    let folder = std::env::temp_dir().join(format!("halonic-app-frame-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("a test folder");
    assert_eq!(frame_exe(&folder, FrameApp::Inbox), None);
    assert_eq!(main_exe(&folder), None);
    std::fs::write(folder.join("Halonic Inbox.exe"), b"").expect("a frame");
    std::fs::write(folder.join("Halonic.exe"), b"").expect("Halonic");
    let found = frame_exe(&folder, FrameApp::Inbox);
    let main = main_exe(&folder);
    let messenger = frame_exe(&folder, FrameApp::Messenger);
    std::fs::remove_dir_all(&folder).expect("the test folder goes");
    assert_eq!(found, Some(folder.join("Halonic Inbox.exe")));
    assert_eq!(main, Some(folder.join("Halonic.exe")));
    assert_eq!(messenger, None);
}

#[test]
fn a_placement_reads_back_as_it_was_kept() {
    let placement = Placement {
        maximized: true,
        left: -1920,
        top: 40,
        right: -960,
        bottom: 1080,
    };
    assert_eq!(
        Placement::from_bytes(&placement.to_bytes()),
        Some(placement)
    );
}

#[test]
fn a_placement_that_wasnt_kept_whole_is_dropped() {
    let placement = Placement {
        maximized: false,
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
    };
    let bytes = placement.to_bytes();
    assert_eq!(Placement::from_bytes(&bytes[..19]), None);
    assert_eq!(
        Placement::from_bytes(&[bytes.as_slice(), &[0]].concat()),
        None
    );
    let mut odd = bytes;
    odd[0] = 2;
    assert_eq!(Placement::from_bytes(&odd), None);
    let empty = Placement {
        right: 0,
        ..placement
    };
    assert_eq!(Placement::from_bytes(&empty.to_bytes()), None);
}
