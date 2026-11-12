//! Watching a workspace by looking at it again and again. Requirement
//! `folder-poll`; these tests' names start with `folder_poll_`.

mod support;

use std::fs;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use halonic_workspace_files::{Fence, FileError, FolderSnapshot, WatchMessage, Watches};
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
        .start("main", INTERVAL, scan_from(&looks), move |message| {
            sent.send(message).is_ok()
        })
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

    let Ok(WatchMessage::Failed(message)) = received.recv_timeout(PATIENCE) else {
        panic!("the watch fails");
    };
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
        .start("main", INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches
        .start("main", INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches
        .start("other", INTERVAL, quiet, |_| true)
        .expect("a watch");
    watches.stop_owner("main");
    assert_eq!(watches.count(), 1);
    watches.stop_owner("other");
    assert_eq!(watches.count(), 0);
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
