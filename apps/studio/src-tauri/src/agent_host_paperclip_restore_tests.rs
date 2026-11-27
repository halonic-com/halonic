//! Requirement `studio.src-tauri.paperclip-key-keep`: the restore of
//! `agent_host_paperclip_restore` against the stand-in host of
//! `agent_host_tests.rs`, with the shell's own checks on a real picked-folder
//! list. A picked workspace gets its key back by its real path; a folder the
//! person never picked gets nothing, and no entry is read.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use halonic_git_guard::OpenedFolders;
use halonic_secrets::{MemoryBackend, SecretBackend, SecretError, SecretName};
use halonic_trust_grant::{FolderPlace, PickedFolders, TrustState};
use serde_json::{Value, json};

use super::{AfterHandshake, FakeHost, Seen, Shell};

/// A folder of its own under the system's temporary folder, removed when
/// the test ends, pass or fail.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "halonic-paperclip-restore-{name}-{}",
            std::process::id()
        ));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(folder.join("acme")).expect("the scratch folder");
        Self(folder)
    }

    fn picked_list(&self) -> PickedFolders {
        PickedFolders::new(self.0.join("picked-folders.json"))
    }

    /// The workspace folder, as a location the picker would answer.
    fn workspace(&self) -> PathBuf {
        self.0.join("acme")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A keychain that counts its reads, so a test can show a refused restore
/// read no entry.
#[derive(Default)]
struct CountingKeychain {
    entries: MemoryBackend,
    reads: AtomicUsize,
}

impl SecretBackend for CountingKeychain {
    fn get(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.entries.get(name)
    }
    fn set(&self, name: &SecretName, value: &str) -> Result<(), SecretError> {
        self.entries.set(name, value)
    }
    fn delete(&self, name: &SecretName) -> Result<(), SecretError> {
        self.entries.delete(name)
    }
    fn get_origins(&self, name: &SecretName) -> Result<Option<String>, SecretError> {
        self.entries.get_origins(name)
    }
    fn set_origins(&self, name: &SecretName, origins: &str) -> Result<(), SecretError> {
        self.entries.set_origins(name, origins)
    }
    fn delete_origins(&self, name: &SecretName) -> Result<(), SecretError> {
        self.entries.delete_origins(name)
    }
}

/// A keychain holding the entry of the connection `acme`, signed in from
/// `workspace`, for the address and company the stand-in host lists.
fn keychain_for(workspace: &str) -> Arc<CountingKeychain> {
    let keychain = Arc::new(CountingKeychain::default());
    let entry = json!({
        "key": "pk-kept",
        "address": "https://paperclip.acme.test",
        "company": "company-acme",
        "workspaces": [workspace],
    });
    keychain
        .set(
            &SecretName::paperclip_key("acme").expect("a connection's entry"),
            &entry.to_string(),
        )
        .expect("stores");
    keychain
}

/// Runs the shell's restore for `workspace` against `keychain` and `picked`.
fn restore(
    shell: &Shell,
    keychain: Arc<CountingKeychain>,
    picked: PickedFolders,
    workspace: &str,
) -> usize {
    tauri::async_runtime::block_on(super::super::paperclip_key::restore_for(
        &shell.handle(),
        keychain,
        picked,
        workspace.to_owned(),
    ))
    .expect("the host listed the connections")
}

/// The next request the fake host saw, as its route and body.
fn next_request(fake: &FakeHost) -> (String, Value) {
    match fake.next() {
        Seen::Request { route, body, .. } => (route, serde_json::from_str(&body).expect("JSON")),
        Seen::HungUp(path) => panic!("a request, not a hang-up on {path}"),
    }
}

#[test]
fn a_picked_workspace_that_may_start_gets_its_key_back_by_its_real_path() {
    let scratch = Scratch::new("picked");
    let list = scratch.picked_list();
    let real_path = TrustState::default()
        .pick_remembered(
            &OpenedFolders::new(),
            &list,
            |_| FolderPlace::Apart,
            || Some(scratch.workspace()),
        )
        .expect("picked")
        .expect("a location");
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let restored = restore(&shell, keychain_for(&real_path), list, &real_path);

    assert_eq!(restored, 1);
    let (route, body) = next_request(&fake);
    assert_eq!(route, "POST /v1/paperclip/connections");
    assert_eq!(body, json!({ "workspace": real_path, "mayStart": true }));
    let (route, body) = next_request(&fake);
    assert_eq!(route, "POST /v1/paperclip/key");
    assert_eq!(
        body,
        json!({
            "workspace": real_path,
            "connection": "acme",
            "key": "pk-kept",
            "address": "https://paperclip.acme.test",
            "company": "company-acme",
        })
    );
}

#[test]
fn a_workspace_the_person_never_picked_gets_nothing_and_no_entry_is_read() {
    let scratch = Scratch::new("not-picked");
    let workspace = scratch.workspace();
    let real_path = workspace.to_string_lossy().into_owned();
    let keychain = keychain_for(&real_path);
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let restored = restore(&shell, keychain.clone(), scratch.picked_list(), &real_path);

    assert_eq!(restored, 0);
    assert_eq!(keychain.reads.load(Ordering::SeqCst), 0);
    assert_eq!(next_request(&fake).0, "POST /v1/paperclip/connections");
    // The restore is over, and the host saw no hand-over.
    assert!(fake.seen.try_recv().is_err());
}

/// Asks the shell's `agent_host_paperclip_key_kept` for `connection` of
/// `workspace`, against `keychain` and `picked`.
fn key_kept(
    shell: &Shell,
    keychain: Arc<CountingKeychain>,
    picked: PickedFolders,
    workspace: &str,
    connection: &str,
) -> Result<bool, super::HostRefusal> {
    tauri::async_runtime::block_on(super::super::paperclip_key::key_kept_for(
        &shell.handle(),
        keychain,
        picked,
        workspace.to_owned(),
        connection.to_owned(),
    ))
}

#[test]
fn a_picked_workspace_learns_an_entry_from_another_workspace_is_kept_and_nothing_more() {
    let scratch = Scratch::new("kept");
    let list = scratch.picked_list();
    let real_path = TrustState::default()
        .pick_remembered(
            &OpenedFolders::new(),
            &list,
            |_| FolderPlace::Apart,
            || Some(scratch.workspace()),
        )
        .expect("picked")
        .expect("a location");
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let kept = key_kept(
        &shell,
        keychain_for("/work/other"),
        list,
        &real_path,
        "acme",
    );

    assert!(kept.expect("an answer"));
    assert_eq!(next_request(&fake).0, "POST /v1/paperclip/connections");
    // The host saw no hand-over: the answer is one bit.
    assert!(fake.seen.try_recv().is_err());
}

#[test]
fn a_workspace_the_person_never_picked_learns_nothing_and_no_entry_is_read() {
    let scratch = Scratch::new("kept-not-picked");
    let real_path = scratch.workspace().to_string_lossy().into_owned();
    let keychain = keychain_for(&real_path);
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let refusal = key_kept(
        &shell,
        keychain.clone(),
        scratch.picked_list(),
        &real_path,
        "acme",
    )
    .expect_err("refused");

    assert_eq!(refusal.kind, "not_picked");
    assert_eq!(keychain.reads.load(Ordering::SeqCst), 0);
}
