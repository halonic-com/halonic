//! The calls pages have in flight through the shell, by the page that made
//! each one and the id that page gave it, so a page can end a call it no
//! longer waits for. A command only returns when its call is done, so ending
//! the call aborts the task that makes it: that drops the request, which
//! hangs up on the other end. The shell also ends every call of a page that
//! reloads or closes, since such a page can't end them itself.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::async_runtime::JoinHandle;

/// A call, by the page that made it and the id that page gave it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CallKey {
    pub page: String,
    pub call: u64,
}

/// A call in flight: what tells it from an earlier one under the same id,
/// and how to stop its task.
struct OpenCall {
    serial: u64,
    abort: Box<dyn Fn() + Send>,
}

/// A call that has started: its serial, for [`PageCalls::forget`], and its
/// task, which answers once the call is done.
pub struct StartedCall<T> {
    pub serial: u64,
    pub task: JoinHandle<T>,
}

/// The page already has a call in flight with this id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallInUse;

/// The calls in flight.
#[derive(Default)]
pub struct PageCalls {
    calls: Mutex<HashMap<CallKey, OpenCall>>,
    /// Tells a call from an earlier one the page gave the same id, such as
    /// one from before the page reloaded.
    next_serial: AtomicU64,
}

impl PageCalls {
    /// Starts the task that makes the call, with `spawn`, unless the page
    /// already has a call in flight with this id. The list stays locked
    /// until the call is noted, so a second call under the same id never
    /// starts, and the page can end the call as soon as it has started.
    pub fn start<T>(
        &self,
        key: CallKey,
        spawn: impl FnOnce() -> JoinHandle<T>,
    ) -> Result<StartedCall<T>, CallInUse> {
        let mut calls = self.calls.lock().unwrap_or_else(|e| e.into_inner());
        if calls.contains_key(&key) {
            return Err(CallInUse);
        }
        let serial = self.next_serial.fetch_add(1, Ordering::Relaxed);
        let task = spawn();
        let handle = task.inner().abort_handle();
        let abort: Box<dyn Fn() + Send> = Box::new(move || handle.abort());
        calls.insert(key, OpenCall { serial, abort });
        Ok(StartedCall { serial, task })
    }

    /// Forgets a call that is done, unless the page has since made another
    /// under the same id.
    pub fn forget(&self, key: &CallKey, serial: u64) {
        let mut calls = self.calls.lock().unwrap_or_else(|e| e.into_inner());
        if calls.get(key).is_some_and(|open| open.serial == serial) {
            calls.remove(key);
        }
    }

    /// Ends the calls `ends` picks.
    pub fn end(&self, ends: impl Fn(&CallKey) -> bool) {
        let mut calls = self.calls.lock().unwrap_or_else(|e| e.into_inner());
        calls.retain(|key, open| {
            if !ends(key) {
                return true;
            }
            (open.abort)();
            false
        });
    }

    /// How many calls are in flight, for tests.
    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.calls.lock().map(|calls| calls.len()).unwrap_or(0)
    }
}
