//! The phone's saved Inbox and Messenger text, with the fake wrapper in
//! place of the Android Keystore.

use std::fs;
use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::fake::FakeWrapper;
use crate::saved_text::{MAX_SAVED_TEXT_BYTES, SavedTextError, SavedTextStore};

const CANARY: &str = "canary-7f3a: the quarterly numbers are in the drawer";

/// A folder under the system's temporary folder, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("saved-text-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        Self(folder)
    }

    fn store(&self) -> SavedTextStore<FakeWrapper> {
        SavedTextStore::new(&self.0, FakeWrapper::new())
    }

    fn file(&self, id: &str) -> PathBuf {
        self.0.join(format!("{id}.saved"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn computer(id: &str) -> ComputerId {
    ComputerId::parse(id).expect("the id is valid")
}

fn saved_text(text: &str) -> String {
    format!(r#"{{"version":1,"inbox":[{{"title":"{text}"}}]}}"#)
}

#[test]
fn saved_text_is_sealed_on_disk_and_reads_back() {
    let scratch = Scratch::new("sealed");
    let store = scratch.store();
    let text = saved_text(CANARY);
    store
        .write(&computer("office"), &text)
        .expect("the text is saved");

    let on_disk = fs::read(scratch.file("office")).expect("the file is there");
    assert!(on_disk.starts_with(b"HST1"));
    let canary = CANARY.as_bytes();
    assert!(!on_disk.windows(canary.len()).any(|window| window == canary));
    assert_eq!(store.read(&computer("office")), Ok(Some(text)));
}

#[test]
fn saved_text_is_none_before_any_write() {
    let scratch = Scratch::new("none");
    assert_eq!(scratch.store().read(&computer("office")), Ok(None));
}

#[test]
fn saved_text_is_deleted_on_forget_and_removed_for_that_computer_only() {
    // Forget and Removed both clear the computer's saved text.
    let scratch = Scratch::new("clear");
    let store = scratch.store();
    store
        .write(&computer("office"), &saved_text("a"))
        .expect("saved");
    store
        .write(&computer("laptop"), &saved_text("b"))
        .expect("saved");

    store.clear(&computer("office")).expect("cleared");

    assert!(!scratch.file("office").exists());
    assert_eq!(store.read(&computer("office")), Ok(None));
    assert_eq!(store.read(&computer("laptop")), Ok(Some(saved_text("b"))));
    // Clearing again, or a computer with nothing saved, is not an error.
    assert_eq!(store.clear(&computer("office")), Ok(()));
}

#[test]
fn saved_text_over_20_mb_is_refused_and_the_old_text_stays() {
    let scratch = Scratch::new("too-large");
    let store = scratch.store();
    store
        .write(&computer("office"), &saved_text("old"))
        .expect("saved");

    let too_large = "x".repeat(MAX_SAVED_TEXT_BYTES + 1);
    assert_eq!(
        store.write(&computer("office"), &too_large),
        Err(SavedTextError::TooLarge)
    );
    assert_eq!(store.read(&computer("office")), Ok(Some(saved_text("old"))));

    let at_the_limit = "x".repeat(MAX_SAVED_TEXT_BYTES);
    assert_eq!(store.write(&computer("office"), &at_the_limit), Ok(()));
}

#[test]
fn saved_text_copied_from_another_computer_is_deleted_on_read() {
    let scratch = Scratch::new("copied");
    let store = scratch.store();
    store
        .write(&computer("office"), &saved_text("a"))
        .expect("saved");
    fs::copy(scratch.file("office"), scratch.file("laptop")).expect("copied");

    assert_eq!(store.read(&computer("laptop")), Ok(None));
    assert!(!scratch.file("laptop").exists());
    assert_eq!(store.read(&computer("office")), Ok(Some(saved_text("a"))));
}

#[test]
fn saved_text_is_deleted_when_the_platform_key_is_gone() {
    let scratch = Scratch::new("key-gone");
    let wrapper = FakeWrapper::new();
    let store = SavedTextStore::new(&scratch.0, wrapper);
    store
        .write(&computer("office"), &saved_text("a"))
        .expect("saved");
    let wrapper = FakeWrapper::new();
    wrapper.lose_key();
    let store = SavedTextStore::new(&scratch.0, wrapper);

    assert_eq!(store.read(&computer("office")), Ok(None));
    assert!(!scratch.file("office").exists());
}
