//! How the settings sit on disk, as `FileHostSettingsStore` in `fs-node`
//! keeps them, and what a link or a hand edit can do to them. Requirement
//! `host-settings-file`; these tests' names start with `host_settings_file_`.

mod support;

use std::fs;

use halonic_host_settings::HostSettingsError;
use serde_json::json;
use support::Scratch;

#[test]
fn host_settings_file_keeps_one_file_of_values_by_key() {
    let scratch = Scratch::new("one-file");
    let store = scratch.store();
    assert_eq!(store.read().unwrap(), serde_json::Map::new());
    assert!(!scratch.settings().exists(), "reading creates nothing");

    store.set("assistant.turn-limit", &json!(20)).unwrap();
    store
        .set(
            "assistant.model",
            &json!({"provider": "ollama", "stop": ["END"]}),
        )
        .unwrap();
    store
        .set("assistant.connector-tools", &json!(null))
        .unwrap();
    store.remove("assistant.model").unwrap();
    store.remove("assistant.instructions").unwrap();

    assert_eq!(scratch.names(), ["host.json"], "no temporary file is left");
    assert_eq!(
        scratch.saved(),
        json!({"version": 1, "values": {"assistant.turn-limit": 20, "assistant.connector-tools": null}})
    );
    let text = fs::read_to_string(scratch.file()).unwrap();
    assert!(
        text.starts_with("{\n  \""),
        "indented by two spaces: {text}"
    );
    assert!(text.ends_with("}\n"), "ends with a newline: {text}");
}

#[cfg(unix)]
#[test]
fn host_settings_file_keeps_the_folder_and_the_file_private() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("private");
    fs::create_dir_all(scratch.settings()).unwrap();
    fs::set_permissions(scratch.settings(), fs::Permissions::from_mode(0o755)).unwrap();
    scratch
        .store()
        .set("assistant.turn-limit", &json!(20))
        .unwrap();
    let mode = |path: &std::path::Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&scratch.settings()), 0o700);
    assert_eq!(mode(&scratch.file()), 0o600);
}

#[test]
fn host_settings_file_keeps_only_the_latest_broken_copy() {
    let scratch = Scratch::new("broken");
    let store = scratch.store();
    scratch.write_saved("{\"values\":");
    store.remove("assistant.turn-limit").unwrap();
    scratch.write_saved("{\"values\":[]}");
    store.set("assistant.turn-limit", &json!(20)).unwrap();
    store.set("assistant.turn-limit", &json!(24)).unwrap();
    let broken = fs::read_to_string(scratch.settings().join("host.json.broken")).unwrap();
    assert_eq!(broken, "{\"values\":[]}");
    assert_eq!(scratch.names(), ["host.json", "host.json.broken"]);
}

#[test]
fn host_settings_file_reads_bytes_that_are_not_utf8_as_replaced() {
    let scratch = Scratch::new("not-utf8");
    fs::create_dir_all(scratch.settings()).unwrap();
    let mut bytes = b"{\"version\":1,\"values\":{\"assistant.voice\":\"".to_vec();
    bytes.extend_from_slice(&[0xff, b'"', b'}', b'}']);
    fs::write(scratch.file(), bytes).unwrap();
    let values = scratch.store().read().unwrap();
    assert_eq!(values["assistant.voice"], "\u{fffd}");
}

#[cfg(unix)]
#[test]
fn host_settings_file_refuses_a_link_on_read_and_replaces_it_on_save() {
    let scratch = Scratch::new("link");
    let elsewhere = scratch.path().join("workspace-settings.json");
    let original = "{\"version\":1,\"values\":{\"assistant.turn-limit\":64}}";
    fs::write(&elsewhere, original).unwrap();
    fs::create_dir_all(scratch.settings()).unwrap();
    std::os::unix::fs::symlink(&elsewhere, scratch.file()).unwrap();
    let store = scratch.store();

    let Err(HostSettingsError::Unreadable { file, reason }) = store.read() else {
        panic!("a link must not be read");
    };
    assert_eq!(file, scratch.file());
    assert_eq!(reason, "it is a link");

    store.set("assistant.turn-limit", &json!(20)).unwrap();
    assert_eq!(fs::read_to_string(&elsewhere).unwrap(), original);
    assert!(
        !fs::symlink_metadata(scratch.file())
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(
        store.read().unwrap()["assistant.turn-limit"],
        json!(20),
        "the link is replaced, and nothing is kept from where it pointed"
    );
    assert_eq!(store.read().unwrap().len(), 1);
}

#[cfg(unix)]
#[test]
fn host_settings_file_refuses_a_hard_link_and_a_folder() {
    let scratch = Scratch::new("hard-link");
    let elsewhere = scratch.path().join("workspace-settings.json");
    fs::write(&elsewhere, "{\"values\":{\"assistant.turn-limit\":64}}").unwrap();
    fs::create_dir_all(scratch.settings()).unwrap();
    fs::hard_link(&elsewhere, scratch.file()).unwrap();
    let store = scratch.store();
    let Err(HostSettingsError::Unreadable { reason, .. }) = store.read() else {
        panic!("a hard link must not be read");
    };
    assert_eq!(reason, "it is a hard link");
    store.set("assistant.turn-limit", &json!(20)).unwrap();
    assert!(
        fs::read_to_string(&elsewhere).unwrap().contains("64"),
        "the other name keeps its text"
    );

    fs::remove_file(scratch.file()).unwrap();
    fs::create_dir(scratch.file()).unwrap();
    let Err(HostSettingsError::Unreadable { reason, .. }) = store.read() else {
        panic!("a folder must not be read");
    };
    assert_eq!(reason, "it isn't a plain file");
}

#[cfg(unix)]
#[test]
fn host_settings_file_refuses_a_named_pipe_without_waiting() {
    use std::sync::mpsc;
    use std::time::Duration;

    let scratch = Scratch::new("pipe");
    fs::create_dir_all(scratch.settings()).unwrap();
    let made = std::process::Command::new("mkfifo")
        .arg(scratch.file())
        .status()
        .unwrap();
    assert!(made.success(), "mkfifo makes the pipe");

    // Without `O_NONBLOCK` the open would wait for a writer forever, so
    // the store runs on its own thread and the test gives it five seconds.
    let store = scratch.store();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let read = store.read();
        let saved = store.set("assistant.turn-limit", &json!(20));
        let _ = sender.send((read, saved));
    });
    let (read, saved) = receiver
        .recv_timeout(Duration::from_secs(5))
        .expect("a named pipe doesn't make the store wait");
    let Err(HostSettingsError::Unreadable { reason, .. }) = read else {
        panic!("a named pipe must not be read");
    };
    assert_eq!(reason, "it isn't a plain file");
    saved.unwrap();
    assert_eq!(
        scratch.saved(),
        json!({"version": 1, "values": {"assistant.turn-limit": 20}}),
        "a save replaces the pipe"
    );
}

#[test]
fn host_settings_file_keeps_every_key_of_saves_in_a_row() {
    let scratch = Scratch::new("in-a-row");
    let store = scratch.store();
    let keys: Vec<String> = (0..20).map(|n| format!("assistant.key-{n}")).collect();
    for (n, key) in keys.iter().enumerate() {
        store.set(key, &json!(n)).unwrap();
    }
    let values = store.read().unwrap();
    assert_eq!(values.len(), keys.len(), "no save drops an earlier key");
}

#[test]
fn host_settings_file_reads_a_settings_folder_that_is_a_file_as_none_saved() {
    let scratch = Scratch::new("folder-is-file");
    fs::write(scratch.settings(), "not a folder").unwrap();
    assert_eq!(scratch.store().read().unwrap(), serde_json::Map::new());
    let Err(HostSettingsError::Io { .. }) = scratch.store().set("assistant.turn-limit", &json!(20))
    else {
        panic!("a save can't create the folder");
    };
    assert_eq!(
        fs::read_to_string(scratch.settings()).unwrap(),
        "not a folder"
    );
}

#[test]
fn host_settings_file_names_each_error_for_the_page() {
    let key = || "assistant.turn-limit".to_owned();
    let cases = [
        (HostSettingsError::InvalidKey { key: key() }, "invalid_key"),
        (HostSettingsError::TooLarge { key: key() }, "too_large"),
        (
            HostSettingsError::Unreadable {
                file: "host.json".into(),
                reason: "it is a link".to_owned(),
            },
            "unreadable",
        ),
        (
            HostSettingsError::Io {
                message: "disk full".to_owned(),
            },
            "io",
        ),
    ];
    for (error, kind) in cases {
        assert_eq!(error.kind(), kind);
        assert!(!error.to_string().is_empty());
    }
    assert_eq!(
        HostSettingsError::TooLarge { key: key() }.to_string(),
        "the settings would be over 262144 bytes with assistant.turn-limit"
    );
}
