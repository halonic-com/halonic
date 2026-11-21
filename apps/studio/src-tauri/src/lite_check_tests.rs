//! Requirement `lite-check`: each check against made-up folders in the
//! system's temporary folder.

use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

use halonic_agent_host::EXECUTABLE_NAME;
use serde_json::{Value, json};

use super::{
    CheckId, CheckResult, Fact, LOW_DISK_BYTES, app_files, disk_space, profile_writable, run_checks,
};

static NEXT_FOLDER: AtomicU32 = AtomicU32::new(0);

/// A fresh, empty folder of the system's temporary folder.
fn fresh_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
    let folder = std::env::temp_dir().join(format!(
        "halonic-lite-check-{name}-{}-{number}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("make the folder");
    folder
}

fn host_file_name() -> String {
    format!("{EXECUTABLE_NAME}{}", std::env::consts::EXE_SUFFIX)
}

fn fact_of(result: CheckResult) -> Fact {
    result.fact
}

#[test]
fn lite_check_finds_the_app_files_beside_the_app() {
    let folder = fresh_folder("files");
    let app = folder.join("Halonic");
    assert_eq!(fact_of(app_files(Some(&app))), Fact::Missing);

    // An empty file is a broken copy, not the host.
    fs::write(folder.join(host_file_name()), b"").expect("write an empty host");
    assert_eq!(fact_of(app_files(Some(&app))), Fact::Missing);

    fs::write(folder.join(host_file_name()), b"host").expect("write the host");
    #[cfg(windows)]
    {
        assert_eq!(fact_of(app_files(Some(&app))), Fact::Missing);
        for name in super::WINDOWS_FILES {
            fs::write(folder.join(name), b"program").expect("write the program");
        }
    }
    let found = app_files(Some(&app));
    assert_eq!(found.id, CheckId::AppFiles);
    assert_eq!(found.fact, Fact::Present);
    assert_eq!(fact_of(app_files(None)), Fact::Missing);
    let _ = fs::remove_dir_all(&folder);
}

#[test]
fn lite_check_writes_and_removes_a_probe_in_the_profile() {
    let folder = fresh_folder("profile");
    let checked = profile_writable(Some(&folder));
    assert_eq!(checked.id, CheckId::ProfileWritable);
    assert_eq!(checked.fact, Fact::Writable);
    let left = fs::read_dir(&folder).expect("read the folder").count();
    assert_eq!(left, 0, "the probe was removed");

    // A profile that isn't there yet is made, as the first start would.
    let new_profile = folder.join("new").join("profile");
    assert_eq!(
        fact_of(profile_writable(Some(&new_profile))),
        Fact::Writable
    );
    let _ = fs::remove_dir_all(&folder);
}

#[test]
fn lite_check_says_a_profile_that_takes_no_file_is_not_writable() {
    let folder = fresh_folder("blocked");
    // A file where the profile folder should be takes no probe, whoever runs the test.
    let in_the_way = folder.join("profile");
    fs::write(&in_the_way, b"not a folder").expect("write the file");
    assert_eq!(
        fact_of(profile_writable(Some(&in_the_way))),
        Fact::NotWritable
    );
    assert_eq!(fact_of(profile_writable(None)), Fact::NoProfile);
    let _ = fs::remove_dir_all(&folder);
}

#[test]
fn lite_check_says_the_disk_is_low_below_1_gib() {
    let enough = disk_space(Some(Ok(LOW_DISK_BYTES)));
    assert_eq!(enough.id, CheckId::DiskSpace);
    assert_eq!(enough.fact, Fact::Enough);
    assert_eq!(enough.free_bytes, Some(LOW_DISK_BYTES));
    assert_eq!(fact_of(disk_space(Some(Ok(LOW_DISK_BYTES - 1)))), Fact::Low);
    let unreadable = disk_space(Some(Err(io::Error::other("no drive"))));
    assert_eq!(unreadable.fact, Fact::Unknown);
    assert_eq!(unreadable.free_bytes, None);
    assert_eq!(fact_of(disk_space(None)), Fact::Unknown);
}

#[test]
fn lite_check_answers_ids_and_facts_with_no_path() {
    let profile = fresh_folder("answer");
    let answer = serde_json::to_value(run_checks(Some(&profile))).expect("serializes");
    let Value::Array(results) = &answer else {
        panic!("a list: {answer}");
    };
    let ids: Vec<&Value> = results.iter().map(|result| &result["id"]).collect();
    let mut expected = vec![
        json!("app_files"),
        json!("profile_writable"),
        json!("disk_space"),
    ];
    if cfg!(windows) {
        expected.extend([json!("wsl_distro"), json!("wsl_runtime")]);
    }
    assert_eq!(ids.into_iter().cloned().collect::<Vec<_>>(), expected);
    assert_eq!(results[1]["fact"], "writable");
    for result in results {
        let Value::Object(fields) = result else {
            panic!("an object: {result}");
        };
        assert!(
            fields
                .keys()
                .all(|key| ["id", "fact", "freeBytes"].contains(&key.as_str())),
            "{result}"
        );
    }
    let text = answer.to_string();
    let folder_name = profile
        .file_name()
        .and_then(|name| name.to_str())
        .expect("a name");
    assert!(!text.contains(folder_name), "{text}");
    assert!(!text.contains(&host_file_name()), "{text}");
    let _ = fs::remove_dir_all(&profile);
}
