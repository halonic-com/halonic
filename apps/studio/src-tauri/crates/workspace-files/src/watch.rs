//! Watching a workspace by looking at it again and again (HAL-5761): the
//! shell has no file-watch crate, so a watch lists the files with their
//! size and modified time about once a second and reports the paths that
//! differ. The page reads each path and compares digests, as `FolderWatch`
//! in `fs-node` does, which tells a change from the store's own write.
//!
//! The page watches one folder from several places, so the watches of a
//! folder share one look: one thread per folder, whatever the number of
//! watches on it.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime};

use crate::error::FileError;
use crate::fence::Fence;
use crate::folder::{sort_as_javascript, walk};

/// The most files a watch looks at. Each look reads every file's size and
/// modified time, about once a second; at 50,000 files that is still a
/// fraction of a second's work on one thread, and a folder of hubs, agents
/// and workflows is far smaller. A larger folder, such as a home folder or
/// a code repository with its dependencies, isn't watched: its watch fails
/// with a message that says what to do.
///
/// `halonic doctor` warns about such a folder with its own copy of this
/// limit, `studioWatchedFileLimit` in `apps/cli/src/studio-watch-limit.ts`;
/// a test there reads this line and checks the two are equal.
pub const MAX_WATCHED_FILES: usize = 50_000;

/// The files under a folder at one look, by workspace path, with their size
/// and modified time. Private entries, links, temporary write files and the
/// fence are left out, as in `WorkspaceFolder::list`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FolderSnapshot {
    files: BTreeMap<String, (u64, Option<SystemTime>)>,
}

impl FolderSnapshot {
    /// Looks at every file under `root`, outside `fence`. A root in the
    /// fence is refused as private, and one with more than
    /// [`MAX_WATCHED_FILES`] files as `TooManyFiles`.
    pub fn of(root: &Path, fence: &Fence) -> Result<Self, FileError> {
        Self::of_at_most(root, fence, MAX_WATCHED_FILES)
    }

    /// As [`Self::of`], with at most `limit` files.
    pub fn of_at_most(root: &Path, fence: &Fence, limit: usize) -> Result<Self, FileError> {
        fence.check("")?;
        let mut files = BTreeMap::new();
        let mut add = |path: String, entry: &std::fs::DirEntry| {
            if files.len() == limit {
                return Err(FileError::TooManyFiles { limit });
            }
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

/// Where a watch's messages go; `false` once no one reads them.
type Sink = Box<dyn FnMut(WatchMessage) -> bool + Send>;

/// The folders looked at, by key, each with its look.
type Folders = Mutex<HashMap<String, Arc<FolderLook>>>;

/// The open watches, by the folder they watch. Each folder has one
/// [`FolderLook`], with one thread, shared by every watch on it.
///
/// Locks are taken in one order, `folders` before a look's `watchers`, so
/// starting, stopping and a look ending never wait on each other in a
/// circle.
#[derive(Debug, Default)]
pub struct Watches {
    last_id: AtomicU32,
    folders: Arc<Folders>,
}

/// One folder's look and the watches that hear it.
#[derive(Debug)]
struct FolderLook {
    /// Held while a message is sent, so a stop waits for one on its way.
    watchers: Mutex<Vec<Watcher>>,
    stopped: Mutex<bool>,
    wake: Condvar,
}

/// One watch on a folder: whose it is, and where its messages go.
struct Watcher {
    id: u32,
    owner: String,
    send: Sink,
}

impl fmt::Debug for Watcher {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Watcher")
            .field("id", &self.id)
            .field("owner", &self.owner)
            .finish_non_exhaustive()
    }
}

impl Watches {
    /// Starts a watch on `folder` for `owner` (the page that asked) and
    /// returns its id.
    ///
    /// The first watch on a folder starts its look: `scan` runs once now, so
    /// a folder that can't be read is refused here, and then every
    /// `interval`. A folder with more than [`MAX_WATCHED_FILES`] files isn't
    /// refused: its watch sends `Failed` with what to do, and stops. Later
    /// watches on the folder join that look, and their `scan` isn't used.
    /// Each look that differs from the one before goes to every watch's
    /// `send` as one batch. When a look fails, each gets `Failed` and the
    /// look stops; a watch whose `send` returns `false` is dropped, because
    /// no one reads it any more.
    pub fn start<Scan>(
        &self,
        owner: &str,
        folder: &str,
        interval: Duration,
        mut scan: Scan,
        send: impl FnMut(WatchMessage) -> bool + Send + 'static,
    ) -> Result<u32, FileError>
    where
        Scan: FnMut() -> Result<FolderSnapshot, FileError> + Send + 'static,
    {
        let id = self.last_id.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
        let mut watcher = Watcher {
            id,
            owner: owner.to_owned(),
            send: Box::new(send),
        };
        if let Some(look) = lock(&self.folders).get(folder) {
            lock(&look.watchers).push(watcher);
            return Ok(id);
        }
        // Looked at without the lock: a large folder takes a while.
        let first = match scan() {
            Ok(first) => first,
            Err(error @ FileError::TooManyFiles { .. }) => {
                (watcher.send)(WatchMessage::Failed(error.to_string()));
                return Ok(id);
            }
            Err(error) => return Err(error),
        };
        let mut folders = lock(&self.folders);
        // Another watch may have started the folder's look meanwhile.
        if let Some(look) = folders.get(folder) {
            lock(&look.watchers).push(watcher);
            return Ok(id);
        }
        let look = Arc::new(FolderLook {
            watchers: Mutex::new(vec![watcher]),
            stopped: Mutex::new(false),
            wake: Condvar::new(),
        });
        folders.insert(folder.to_owned(), Arc::clone(&look));
        drop(folders);
        let all = Arc::clone(&self.folders);
        let key = folder.to_owned();
        let thread_look = Arc::clone(&look);
        let started = thread::Builder::new()
            .name(format!("halonic-fs-watch-{id}"))
            .spawn(move || thread_look.run(interval, first, &mut scan, &all, &key));
        if let Err(error) = started {
            let mut folders = lock(&self.folders);
            if folders
                .get(folder)
                .is_some_and(|kept| Arc::ptr_eq(kept, &look))
            {
                folders.remove(folder);
            }
            return Err(FileError::Io {
                message: format!("the watch couldn't start: {error}"),
            });
        }
        Ok(id)
    }

    /// Stops `owner`'s watch `id`. No message comes after this returns. An
    /// id that has stopped already, or is another page's, is fine.
    pub fn stop(&self, owner: &str, id: u32) {
        self.stop_where(|watcher| watcher.id == id && watcher.owner == owner);
    }

    /// Stops every watch of `owner`, as when its page reloads or closes.
    pub fn stop_owner(&self, owner: &str) {
        self.stop_where(|watcher| watcher.owner == owner);
    }

    /// Drops the watches `stops` picks, and ends the look of a folder that
    /// has none left.
    fn stop_where(&self, stops: impl Fn(&Watcher) -> bool) {
        let mut folders = lock(&self.folders);
        let mut ended = Vec::new();
        folders.retain(|_, look| {
            let mut watchers = lock(&look.watchers);
            watchers.retain(|watcher| !stops(watcher));
            if watchers.is_empty() {
                ended.push(Arc::clone(look));
            }
            !watchers.is_empty()
        });
        drop(folders);
        for look in ended {
            look.stop();
        }
    }

    /// How many watches are open.
    pub fn count(&self) -> usize {
        lock(&self.folders)
            .values()
            .map(|look| lock(&look.watchers).len())
            .sum()
    }

    /// How many folders are looked at: one per folder, however many
    /// watches are on it.
    pub fn folder_count(&self) -> usize {
        lock(&self.folders).len()
    }
}

impl FolderLook {
    /// Looks at the folder every `interval` until the look is stopped, a
    /// look fails, or no watch is left. The look is then taken off `all`
    /// under `key`, so a new watch starts a new one.
    fn run<Scan>(
        &self,
        interval: Duration,
        first: FolderSnapshot,
        scan: &mut Scan,
        all: &Folders,
        key: &str,
    ) where
        Scan: FnMut() -> Result<FolderSnapshot, FileError>,
    {
        let mut last = first;
        while self.wait(interval) {
            match scan() {
                Ok(now) => {
                    let changed = now.changed_since(&last);
                    last = now;
                    if !changed.is_empty() {
                        self.send_all(&WatchMessage::Changed(changed));
                    }
                    if self.end_if_unwatched(all, key) {
                        return;
                    }
                }
                Err(error) => {
                    self.fail(all, key, &error.to_string());
                    return;
                }
            }
        }
    }

    /// Sends `message` to every watch, dropping those no one reads.
    fn send_all(&self, message: &WatchMessage) {
        lock(&self.watchers).retain_mut(|watcher| (watcher.send)(message.clone()));
    }

    /// Takes the look off `all` when no watch is left on it; `true` then.
    /// Decided under the folders' lock, so a watch that joins now isn't
    /// left on a look that ended.
    fn end_if_unwatched(&self, all: &Folders, key: &str) -> bool {
        let mut folders = lock(all);
        if !lock(&self.watchers).is_empty() {
            return false;
        }
        self.leave(&mut folders, key);
        true
    }

    /// Ends the look with one `Failed` to every watch on it, those that
    /// joined at the last moment included.
    fn fail(&self, all: &Folders, key: &str, reason: &str) {
        let mut folders = lock(all);
        self.leave(&mut folders, key);
        let mut watchers = lock(&self.watchers);
        for watcher in watchers.iter_mut() {
            (watcher.send)(WatchMessage::Failed(reason.to_owned()));
        }
        // The senders go now, so whoever reads them sees the end.
        watchers.clear();
    }

    /// Takes this look off `folders` under `key`, unless a newer look is
    /// there already.
    fn leave(&self, folders: &mut HashMap<String, Arc<FolderLook>>, key: &str) {
        if folders
            .get(key)
            .is_some_and(|kept| std::ptr::eq(Arc::as_ptr(kept), self))
        {
            folders.remove(key);
        }
    }

    /// Waits `interval`; `false` when the look was stopped meanwhile.
    fn wait(&self, interval: Duration) -> bool {
        let stopped = lock(&self.stopped);
        let (stopped, _) = self
            .wake
            .wait_timeout_while(stopped, interval, |stopped| !*stopped)
            .unwrap_or_else(PoisonError::into_inner);
        !*stopped
    }

    fn stop(&self) {
        *lock(&self.stopped) = true;
        self.wake.notify_all();
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
