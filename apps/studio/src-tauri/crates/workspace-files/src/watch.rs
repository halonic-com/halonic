//! Watching a workspace by looking at it again and again (HAL-5761): the
//! shell has no file-watch crate, so a watch lists the files with their
//! size and modified time about once a second and reports the paths that
//! differ. The page reads each path and compares digests, as `FolderWatch`
//! in `fs-node` does, which tells a change from the store's own write.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime};

use crate::error::FileError;
use crate::fence::Fence;
use crate::folder::{sort_as_javascript, walk};

/// The files under a folder at one look, by workspace path, with their size
/// and modified time. Private entries, links, temporary write files and the
/// fence are left out, as in `WorkspaceFolder::list`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FolderSnapshot {
    files: BTreeMap<String, (u64, Option<SystemTime>)>,
}

impl FolderSnapshot {
    /// Looks at every file under `root`, outside `fence`. A root in the
    /// fence is refused as private.
    pub fn of(root: &Path, fence: &Fence) -> Result<Self, FileError> {
        fence.check("")?;
        let mut files = BTreeMap::new();
        let mut add = |path: String, entry: &std::fs::DirEntry| {
            match entry.metadata() {
                Ok(metadata) => {
                    files.insert(path, (metadata.len(), metadata.modified().ok()));
                }
                // Removed between the folder's list and this look: the next
                // look leaves it out.
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(FileError::io(&path, &error)),
            }
            Ok(())
        };
        walk(root, "", fence, &mut add)?;
        Ok(Self { files })
    }

    /// The paths that were added, changed or removed since `before`, sorted
    /// as JavaScript sorts them. A folder that went away gives each file
    /// that was in it.
    pub fn changed_since(&self, before: &Self) -> Vec<String> {
        let mut changed: Vec<String> = self
            .files
            .iter()
            .filter(|(path, stamp)| before.files.get(*path) != Some(stamp))
            .map(|(path, _)| path.clone())
            .chain(
                before
                    .files
                    .keys()
                    .filter(|path| !self.files.contains_key(*path))
                    .cloned(),
            )
            .collect();
        sort_as_javascript(&mut changed);
        changed
    }
}

/// What a watch tells the page: a batch of paths that may have changed, or,
/// once, why it stopped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchMessage {
    Changed(Vec<String>),
    Failed(String),
}

/// The open watches, each a thread of its own, by id.
#[derive(Debug, Default)]
pub struct Watches {
    last_id: AtomicU32,
    open: Arc<Mutex<HashMap<u32, Arc<OpenWatch>>>>,
}

/// One watch: whose it is, and whether it was stopped.
#[derive(Debug)]
struct OpenWatch {
    owner: String,
    stopped: Mutex<bool>,
    wake: Condvar,
}

impl Watches {
    /// Starts a watch for `owner` (the page that asked) and returns its id.
    ///
    /// `scan` looks at the folder; it runs once now, so a folder that can't
    /// be read is refused here, and then every `interval`. Each look that
    /// differs from the one before goes to `send` as one batch. When a look
    /// fails, `send` gets `Failed` and the watch stops; it also stops when
    /// `send` returns `false`, because no one reads it any more.
    pub fn start<Scan, Sink>(
        &self,
        owner: &str,
        interval: Duration,
        mut scan: Scan,
        mut send: Sink,
    ) -> Result<u32, FileError>
    where
        Scan: FnMut() -> Result<FolderSnapshot, FileError> + Send + 'static,
        Sink: FnMut(WatchMessage) -> bool + Send + 'static,
    {
        let first = scan()?;
        let id = self.last_id.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
        let watch = Arc::new(OpenWatch {
            owner: owner.to_owned(),
            stopped: Mutex::new(false),
            wake: Condvar::new(),
        });
        lock(&self.open).insert(id, Arc::clone(&watch));
        let open = Arc::clone(&self.open);
        let thread_watch = Arc::clone(&watch);
        let started = thread::Builder::new()
            .name(format!("halonic-fs-watch-{id}"))
            .spawn(move || {
                thread_watch.run(interval, first, &mut scan, &mut send);
                let mut open = lock(&open);
                if open
                    .get(&id)
                    .is_some_and(|kept| Arc::ptr_eq(kept, &thread_watch))
                {
                    open.remove(&id);
                }
                // `send` goes when this closure ends, after the watch is
                // off the list, so whoever reads it sees the end last.
            });
        if let Err(error) = started {
            lock(&self.open).remove(&id);
            return Err(FileError::Io {
                message: format!("the watch couldn't start: {error}"),
            });
        }
        Ok(id)
    }

    /// Stops `owner`'s watch `id`. No message comes after this returns. An
    /// id that has stopped already, or is another page's, is fine.
    pub fn stop(&self, owner: &str, id: u32) {
        let mut open = lock(&self.open);
        let owned = open.get(&id).is_some_and(|watch| watch.owner == owner);
        let stopped = if owned { open.remove(&id) } else { None };
        drop(open);
        if let Some(watch) = stopped {
            watch.stop();
        }
    }

    /// Stops every watch of `owner`, as when its page reloads or closes.
    pub fn stop_owner(&self, owner: &str) {
        let mut open = lock(&self.open);
        let ids: Vec<u32> = open
            .iter()
            .filter(|(_, watch)| watch.owner == owner)
            .map(|(id, _)| *id)
            .collect();
        let stopped: Vec<Arc<OpenWatch>> = ids.iter().filter_map(|id| open.remove(id)).collect();
        drop(open);
        for watch in stopped {
            watch.stop();
        }
    }

    /// How many watches are open.
    pub fn count(&self) -> usize {
        lock(&self.open).len()
    }
}

impl OpenWatch {
    /// Looks at the folder every `interval` until the watch is stopped, a
    /// look fails, or no one reads the messages.
    fn run<Scan, Sink>(
        &self,
        interval: Duration,
        first: FolderSnapshot,
        scan: &mut Scan,
        send: &mut Sink,
    ) where
        Scan: FnMut() -> Result<FolderSnapshot, FileError>,
        Sink: FnMut(WatchMessage) -> bool,
    {
        let mut last = first;
        while self.wait(interval) {
            match scan() {
                Ok(now) => {
                    let changed = now.changed_since(&last);
                    last = now;
                    if !changed.is_empty() && !self.send(send, WatchMessage::Changed(changed)) {
                        return;
                    }
                }
                Err(error) => {
                    self.send(send, WatchMessage::Failed(error.to_string()));
                    return;
                }
            }
        }
    }

    /// Waits `interval`; `false` when the watch was stopped meanwhile.
    fn wait(&self, interval: Duration) -> bool {
        let stopped = lock(&self.stopped);
        let (stopped, _) = self
            .wake
            .wait_timeout_while(stopped, interval, |stopped| !*stopped)
            .unwrap_or_else(PoisonError::into_inner);
        !*stopped
    }

    /// Sends `message` unless the watch was stopped. It holds the flag while
    /// it sends, so [`Self::stop`] waits for a message on its way.
    fn send(&self, send: &mut impl FnMut(WatchMessage) -> bool, message: WatchMessage) -> bool {
        let stopped = lock(&self.stopped);
        !*stopped && send(message)
    }

    fn stop(&self) {
        *lock(&self.stopped) = true;
        self.wake.notify_all();
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
