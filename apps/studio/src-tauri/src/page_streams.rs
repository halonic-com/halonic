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
/// answered; then it is the task passing on what comes.
struct OpenStream {
    serial: u64,
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
        let mut streams = self.streams.lock().map_err(|_| OpenRefusal::Poisoned)?;
        if streams.contains_key(key) {
            return Err(OpenRefusal::InUse);
        }
        if streams.keys().filter(|open| open.page == key.page).count() >= self.per_page {
            return Err(OpenRefusal::TooMany);
        }
        let serial = self.next_serial.fetch_add(1, Ordering::Relaxed);
        streams.insert(key.clone(), OpenStream { serial, task: None });
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
        let Ok(mut streams) = self.streams.lock() else {
            return;
        };
        streams.retain(|key, open| {
            if !ends(key) {
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
}
