//! The streams pages have open through the shell, by the page that opened
//! each one and the id that page gave it. The page names a stream before
//! the other end has answered, so it can end it at once; the shell ends
//! every stream of a page that reloads or closes, since such a page can't
//! end them itself.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::async_runtime::JoinHandle;

/// A stream, by the page that opened it and the id that page gave it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StreamKey {
    pub page: String,
    pub stream: u64,
}

/// A stream the page has opened. `task` is `None` until the other end has
/// answered; then it is the task passing on what comes. `tag` names what
/// the stream is to, such as an owner server's origin, so that all of them
/// can end at once; it is empty when that isn't needed.
pub(crate) struct OpenStream {
    serial: u64,
    tag: String,
    task: Option<JoinHandle<()>>,
}

/// Why a stream couldn't be noted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenRefusal {
    /// The page already has a stream with this id.
    InUse,
    /// The page has as many streams open as it may.
    TooMany,
    /// An earlier failure left the list broken.
    Poisoned,
}

/// The open streams, at most `per_page` for each page.
pub struct PageStreams {
    streams: Mutex<HashMap<StreamKey, OpenStream>>,
    /// Tells a stream from an earlier one the page gave the same id.
    next_serial: AtomicU64,
    per_page: usize,
}

impl PageStreams {
    pub fn new(per_page: usize) -> Self {
        Self {
            streams: Mutex::new(HashMap::new()),
            next_serial: AtomicU64::new(0),
            per_page,
        }
    }

    /// Notes a stream the page is opening. Answers the stream's serial.
    pub fn open(&self, key: &StreamKey) -> Result<u64, OpenRefusal> {
        self.open_tagged(key, "")
    }

    /// Notes a stream the page is opening to `tag`, which
    /// [`end_tagged`](Self::end_tagged) ends. Answers the stream's serial.
    pub fn open_tagged(&self, key: &StreamKey, tag: &str) -> Result<u64, OpenRefusal> {
        let mut streams = self.streams.lock().map_err(|_| OpenRefusal::Poisoned)?;
        if streams.contains_key(key) {
            return Err(OpenRefusal::InUse);
        }
        if streams.keys().filter(|open| open.page == key.page).count() >= self.per_page {
            return Err(OpenRefusal::TooMany);
        }
        let serial = self.next_serial.fetch_add(1, Ordering::Relaxed);
        let open = OpenStream {
            serial,
            tag: tag.to_owned(),
            task: None,
        };
        streams.insert(key.clone(), open);
        Ok(serial)
    }

    /// Starts the task that passes the stream on, with `spawn`, when the
    /// page hasn't ended the stream meanwhile; answers false when it has.
    /// The list stays locked until the task is noted, so a task that ends
    /// at once can't forget the stream before it is noted.
    pub fn start(
        &self,
        key: &StreamKey,
        serial: u64,
        spawn: impl FnOnce() -> JoinHandle<()>,
    ) -> bool {
        let Ok(mut streams) = self.streams.lock() else {
            return false;
        };
        let Some(open) = streams.get_mut(key).filter(|open| open.serial == serial) else {
            return false;
        };
        open.task = Some(spawn());
        true
    }

    /// Whether the stream `serial` is still open: the page hasn't ended it,
    /// and hasn't reloaded or closed.
    pub fn holds(&self, key: &StreamKey, serial: u64) -> bool {
        self.streams
            .lock()
            .is_ok_and(|streams| streams.get(key).is_some_and(|open| open.serial == serial))
    }

    /// Forgets a stream that has ended on its own, unless the page has
    /// since opened another under the same id.
    pub fn forget(&self, key: &StreamKey, serial: u64) {
        if let Ok(mut streams) = self.streams.lock()
            && streams.get(key).is_some_and(|open| open.serial == serial)
        {
            streams.remove(key);
        }
    }

    /// Ends the streams `ends` picks. Aborting a stream's task drops its
    /// response, which hangs up; a stream not yet answered is hung up on
    /// when the answer comes.
    pub fn end(&self, ends: impl Fn(&StreamKey) -> bool) {
        self.end_where(|key, _| ends(key));
    }

    /// Ends every stream opened to `tag`, of every page.
    pub fn end_tagged(&self, tag: &str) {
        self.end_where(|_, open| open.tag == tag);
    }

    fn end_where(&self, ends: impl Fn(&StreamKey, &OpenStream) -> bool) {
        let Ok(mut streams) = self.streams.lock() else {
            return;
        };
        streams.retain(|key, open| {
            if !ends(key, open) {
                return true;
            }
            if let Some(task) = open.task.take() {
                task.abort();
            }
            false
        });
    }

    /// How many streams are noted, for tests.
    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.streams
            .lock()
            .map(|streams| streams.len())
            .unwrap_or(0)
    }

    /// The list itself, for tests that look inside it.
    #[cfg(test)]
    pub(crate) fn lock(
        &self,
    ) -> std::sync::LockResult<std::sync::MutexGuard<'_, HashMap<StreamKey, OpenStream>>> {
        self.streams.lock()
    }
}

/// A list with no limit per page, as the agent host's streams have.
impl Default for PageStreams {
    fn default() -> Self {
        Self::new(usize::MAX)
    }
}
