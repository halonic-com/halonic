//! Watching a workspace by looking at it again and again. Requirement
//! `folder-poll`; these tests' names start with `folder_poll_`.

mod support;

use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use halonic_workspace_files::{
    Fence, FileError, FolderSnapshot, MAX_WATCHED_FILES, WatchMessage, Watches,
};
use std::sync::atomic::{AtomicUsize, Ordering};
use support::Scratch;

/// Short, so the tests don't wait long; they wait for messages, never for
/// a fixed time.
const INTERVAL: Duration = Duration::from_millis(5);
/// Long enough for a loaded CI machine, short enough to end a hung test.
const PATIENCE: Duration = Duration::from_secs(20);

#[test]
fn folder_poll_reports_added_changed_and_removed_files() {
    let scratch = Scratch::new("snapshot");
    scratch.put("hubs/a/hub.yaml", "a");
    scratch.put("hubs/b/hub.yaml", "b");
    scratch.put("agents/review.yaml", "one");
    let before = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a first look");

    scratch.put("agents/review.yaml", "one more");
    scratch.put("agents/new.yaml", "new");
    scratch.put(".git/HEAD", "ref");
    scratch.put(
        "agents/.halonic-write-0b5c6f4e-2a1d-4c3b-9e8f-7a6b5c4d3e2f.tmp",
        "half",
    );
    fs::remove_dir_all(scratch.at("hubs")).expect("a folder goes away");
    let after = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a second look");

    assert_eq!(
        after.changed_since(&before),
        [
            "agents/new.yaml",
            "agents/review.yaml",
            "hubs/a/hub.yaml",
            "hubs/b/hub.yaml"
        ]
    );
    assert_eq!(after.changed_since(&after), Vec::<String>::new());
}

#[test]
fn folder_poll_sends_each_change_as_a_batch_until_stopped() {
    let scratch = Scratch::new("watch");
    scratch.put("a.yaml", "a");
    let first = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a look");
    scratch.put("b.yaml", "b");
    let second = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a look");
    let looks = Arc::new(Mutex::new(vec![first.clone(), first, second]));
    let (sent, received) = mpsc::channel();
    let watches = Watches::default();
    let id = watches
        .start(
            "main",
            Path::new("acme"),
            INTERVAL,
            scan_from(&looks),
            move |message| sent.send(message).is_ok(),
        )
        .expect("the watch starts");

    let message = received.recv_timeout(PATIENCE).expect("a batch");
    assert_eq!(message, WatchMessage::Changed(vec!["b.yaml".to_owned()]));
    assert_eq!(watches.count(), 1);

    watches.stop("other page", id);
    assert_eq!(watches.count(), 1, "another page can't stop it");
    watches.stop("main", id);
    assert_eq!(watches.count(), 0);
    assert_eq!(
        received.recv_timeout(PATIENCE),
        Err(mpsc::RecvTimeoutError::Disconnected),
        "nothing comes after the stop, and the watch lets go of its sender"
    );
}

#[test]
fn folder_poll_fails_once_when_a_look_fails() {
    let mut looks = vec![Ok(FolderSnapshot::default())];
    looks.push(Err(FileError::FolderUnreadable {
        path: "hubs".to_owned(),
        message: "permission denied".to_owned(),
    }));
    let looks = Mutex::new(looks.into_iter());
    let (sent, received) = mpsc::channel();
    let watches = Watches::default();
    watches
        .start(
            "main",
            Path::new("acme"),
            INTERVAL,
            move || {
                looks
                    .lock()
                    .expect("the looks")
                    .next()
                    .unwrap_or(Ok(FolderSnapshot::default()))
            },
            move |message| sent.send(message).is_ok(),
        )
        .expect("the watch starts");

    let Ok(WatchMessage::Failed(error)) = received.recv_timeout(PATIENCE) else {
        panic!("the watch fails");
    };
    let message = error.to_string();
    assert!(message.contains("hubs"), "{message}");
    assert_eq!(
        received.recv_timeout(PATIENCE),
        Err(mpsc::RecvTimeoutError::Disconnected)
    );
    assert_eq!(watches.count(), 0, "a failed watch is gone");
}

#[test]
fn folder_poll_refuses_a_folder_it_cannot_look_at_and_stops_a_pages_watches() {
    let watches = Watches::default();
    let refused = watches.start(
        "main",
        Path::new("acme"),
        INTERVAL,
        || {
            Err(FileError::Io {
                message: "gone".to_owned(),
            })
        },
        |_| true,
    );
    assert_eq!(refused.map_err(|error| error.kind()), Err("io"));
    assert_eq!(watches.count(), 0);

    let quiet = || Ok::<_, FileError>(FolderSnapshot::default());
    watches
        .start("main", Path::new("acme"), INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches
        .start("main", Path::new("acme"), INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches
        .start("other", Path::new("acme"), INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches.stop_owner("main");
    assert_eq!(watches.count(), 1);
    watches.stop_owner("other");
    assert_eq!(watches.count(), 0);
}

#[test]
fn folder_poll_shares_one_look_among_the_watches_of_a_folder() {
    let scratch = Scratch::new("shared");
    scratch.put("a.yaml", "a");
    let first = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a look");
    scratch.put("b.yaml", "b");
    let second = FolderSnapshot::of(scratch.path(), &Fence::Outside).expect("a look");
    // The change shows only once all three watches are on the folder.
    let looks = Arc::new(Mutex::new(vec![first]));
    let joined_looks = Arc::new(AtomicUsize::new(0));
    let watches = Watches::default();
    let mut received = Vec::new();
    for page in ["runs", "library", "google"] {
        let (sent, receiver) = mpsc::channel();
        let scan: Box<dyn FnMut() -> Result<FolderSnapshot, FileError> + Send> =
            if received.is_empty() {
                Box::new(scan_from(&looks))
            } else {
                let joined_looks = Arc::clone(&joined_looks);
                Box::new(move || {
                    joined_looks.fetch_add(1, Ordering::Relaxed);
                    Ok(FolderSnapshot::default())
                })
            };
        watches
            .start(page, Path::new("acme"), INTERVAL, scan, move |message| {
                sent.send(message).is_ok()
            })
            .expect("the watch starts");
        received.push(receiver);
    }

    assert_eq!(watches.count(), 3);
    assert_eq!(watches.folder_count(), 1, "one look for the folder");
    looks.lock().expect("the looks").push(second);
    for receiver in &received {
        let message = receiver.recv_timeout(PATIENCE).expect("a batch");
        assert_eq!(message, WatchMessage::Changed(vec!["b.yaml".to_owned()]));
    }
    assert_eq!(
        joined_looks.load(Ordering::Relaxed),
        0,
        "the watches that joined never look themselves"
    );

    watches.stop_owner("runs");
    watches.stop_owner("library");
    assert_eq!(watches.folder_count(), 1, "one watch is left on it");
    watches.stop_owner("google");
    assert_eq!(
        watches.folder_count(),
        0,
        "the look ends with its last watch"
    );
}

#[test]
fn folder_poll_looks_at_each_folder_on_its_own() {
    let watches = Watches::default();
    let quiet = || Ok::<_, FileError>(FolderSnapshot::default());
    for folder in ["acme", "other"] {
        watches
            .start("main", Path::new(folder), INTERVAL, quiet, |_| true)
            .expect("a watch");
    }
    assert_eq!(watches.folder_count(), 2);
    watches.stop_owner("main");
    assert_eq!(watches.folder_count(), 0);
}

/// Two folder names that aren't UTF-8 read the same as text (`acme\u{FFFD}`),
/// but are two folders, so each gets its own look.
#[cfg(unix)]
#[test]
fn folder_poll_looks_at_each_folder_whose_name_is_not_utf8_on_its_own() {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;

    let first = Path::new(OsStr::from_bytes(b"acme\xfe"));
    let second = Path::new(OsStr::from_bytes(b"acme\xff"));
    assert_eq!(first.to_string_lossy(), second.to_string_lossy());

    let watches = Watches::default();
    let quiet = || Ok::<_, FileError>(FolderSnapshot::default());
    for folder in [first, second] {
        watches
            .start("main", folder, INTERVAL, quiet, |_| true)
            .expect("a watch");
    }
    assert_eq!(watches.folder_count(), 2);
    watches.stop_owner("main");
    assert_eq!(watches.folder_count(), 0);
}

#[test]
fn folder_poll_stops_at_its_file_limit() {
    let scratch = Scratch::new("limit");
    scratch.put("a.yaml", "a");
    scratch.put("b.yaml", "b");
    scratch.put("c.yaml", "c");
    FolderSnapshot::of_at_most(scratch.path(), &Fence::Outside, 3).expect("three files fit");
    let refused = FolderSnapshot::of_at_most(scratch.path(), &Fence::Outside, 2);
    assert_eq!(refused, Err(FileError::TooManyFiles { limit: 2 }));
    const { assert!(MAX_WATCHED_FILES >= 10_000, "tens of thousands") };
}

#[test]
fn folder_poll_fails_a_folder_with_too_many_files_with_what_to_do() {
    let (sent, received) = mpsc::channel();
    let watches = Watches::default();
    let id = watches.start(
        "main",
        Path::new("acme"),
        INTERVAL,
        || {
            Err(FileError::TooManyFiles {
                limit: MAX_WATCHED_FILES,
            })
        },
        move |message| sent.send(message).is_ok(),
    );
    assert!(id.is_ok(), "the watch isn't refused: its failure says why");
    let Ok(WatchMessage::Failed(error)) = received.recv_timeout(PATIENCE) else {
        panic!("the watch fails");
    };
    assert_eq!(error.kind(), "too_many_files");
    assert_eq!(
        error.to_string(),
        "This folder has more than 50,000 files, too many to watch for changes made \
         outside Halonic. Open a smaller folder to see them as they happen."
    );
    assert_eq!(
        received.recv_timeout(PATIENCE),
        Err(mpsc::RecvTimeoutError::Disconnected)
    );
    assert_eq!(watches.count(), 0);
    assert_eq!(watches.folder_count(), 0);
}

/// A scan that gives `looks` in turn, then the last one again and again.
fn scan_from(
    looks: &Arc<Mutex<Vec<FolderSnapshot>>>,
) -> impl FnMut() -> Result<FolderSnapshot, FileError> + Send + 'static {
    let looks = Arc::clone(looks);
    move || {
        let mut looks = looks.lock().expect("the looks");
        let look = looks.first().cloned().unwrap_or_default();
        if looks.len() > 1 {
            looks.remove(0);
        }
        Ok(look)
    }
}
