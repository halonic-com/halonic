//! The files themselves, as `FileTrustStore` in `fs-node` lays them out
//! (`fs-node.trust-store-files`), so the desktop app and the CLI share one
//! folder of records. Requirement `trust-files`.

mod support;

use std::fs;
use std::path::Path;

use halonic_trust_store::TrustError;
use serde_json::Value;
use support::{Scratch, file_for, grant, locations, node_file_names, record};

/// Records `FileTrustStore` in `fs-node` wrote, kept byte for byte.
const WRITTEN_BY_FS_NODE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/written-by-fs-node"
);

#[test]
fn trust_files_name_each_file_by_the_hash_of_its_location_with_the_location_first() {
    let scratch = Scratch::new("layout");
    scratch
        .store()
        .grant(&record("/Workspaces/Café", "hfp1:aa"))
        .unwrap();

    let file = file_for(&scratch, "/Workspaces/Café");
    assert!(
        file.ends_with("a47c4600542f1f0e56aedc0ccf0d69ab2aaca89accf3ea63a7d0cd172535da7e.json")
    );
    let text = fs::read_to_string(&file).unwrap();
    assert!(text.starts_with("{\n  \"location\": \"/Workspaces/Café\",\n  \""));
    assert!(text.ends_with("\n}\n"));
    let written: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(written, record("/Workspaces/Café", "hfp1:aa"));
}

#[test]
fn trust_files_are_named_as_fs_node_names_them() {
    let scratch = Scratch::new("names");
    let store = scratch.store();
    for (location, name) in node_file_names() {
        grant(&store, &location, "hfp1:aa");
        let file = scratch.path().join("trust").join(&name);
        assert!(file.is_file(), "{location:?} should be in {name}");
        assert_eq!(
            store.get(&location).unwrap().unwrap()["location"],
            location.as_str()
        );
    }
}

#[test]
fn trust_files_read_the_records_fs_node_wrote() {
    let scratch = Scratch::new("from-node");
    let trust = scratch.path().join("trust");
    fs::create_dir_all(&trust).unwrap();
    for entry in fs::read_dir(WRITTEN_BY_FS_NODE).unwrap() {
        let entry = entry.unwrap();
        fs::copy(entry.path(), trust.join(entry.file_name())).unwrap();
    }
    let store = scratch.store();

    let listed = store.list().unwrap();
    assert_eq!(locations(&listed), ["/Workspaces/Café", "/workspaces/acme"]);
    let acme = store.get("/workspaces/acme").unwrap().unwrap();
    assert_eq!(acme["origin"], "cli");
    assert_eq!(acme["pins"]["mail"]["version"], "2.3.1");
}

#[test]
fn trust_files_write_what_fs_node_writes_for_the_same_record() {
    let fixture = Path::new(WRITTEN_BY_FS_NODE)
        .join("4c938081cf4d5d7859513353bd85c945bf61d4696ef270c592c659f873753989.json");
    let from_node: Value = serde_json::from_str(&fs::read_to_string(&fixture).unwrap()).unwrap();

    let scratch = Scratch::new("as-node");
    scratch.store().grant(&from_node).unwrap();
    let file = file_for(&scratch, "/workspaces/acme");
    assert_eq!(file.file_name(), fixture.file_name());
    let ours: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(ours, from_node);
}

#[test]
fn trust_files_leave_other_files_alone() {
    let scratch = Scratch::new("others");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:aa");
    let trust = scratch.path().join("trust");
    fs::write(trust.join("notes.txt"), "kept").unwrap();
    let leftover = file_for(&scratch, "/workspaces/zeta").with_extension("json.1-2-3.tmp");
    fs::write(&leftover, "{").unwrap();

    assert_eq!(locations(&store.list().unwrap()), ["/workspaces/acme"]);
    assert_eq!(fs::read_to_string(trust.join("notes.txt")).unwrap(), "kept");
}

#[test]
fn trust_files_name_the_file_when_its_location_cant_be_read() {
    let scratch = Scratch::new("unnamed");
    let store = scratch.store();
    grant(&store, "/workspaces/acme", "hfp1:aa");
    grant(&store, "/workspaces/zeta", "hfp1:aa");

    // acme's record copied over zeta's file: its location isn't the one the
    // file is named for, so it can't name another location.
    let zeta = file_for(&scratch, "/workspaces/zeta");
    fs::copy(file_for(&scratch, "/workspaces/acme"), &zeta).unwrap();
    assert_eq!(
        store.get("/workspaces/zeta"),
        Err(TrustError::Unreadable {
            location: Some("/workspaces/zeta".to_owned()),
            file: zeta.clone(),
        })
    );
    let unnamed = TrustError::Unreadable {
        location: None,
        file: zeta.clone(),
    };
    assert_eq!(store.list(), Err(unnamed.clone()));
    assert_eq!(unnamed.kind(), "unreadable");
    assert!(unnamed.to_string().contains("delete the file"));
    assert!(store.get("/workspaces/acme").unwrap().is_some());

    fs::write(&zeta, "{").unwrap();
    assert_eq!(store.list(), Err(unnamed));
}

#[cfg(unix)]
#[test]
fn trust_files_are_readable_by_their_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    use halonic_trust_store::FileTrustStore;

    let scratch = Scratch::new("modes");
    let root = scratch.path().join("trust");
    FileTrustStore::new(root.clone())
        .grant(&record("/workspaces/acme", "hfp1:aa"))
        .unwrap();
    let mode = |path: &Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&root), 0o700);
    assert_eq!(mode(&file_for(&scratch, "/workspaces/acme")), 0o600);
}
