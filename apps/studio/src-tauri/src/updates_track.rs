//! The update track in About Halonic (HAL-18656): the track an install
//! follows, and the command that saves the person's choice.

use halonic_update_state::{UpdateState, UpdateStatus, UpdateTrack, install_track};
use tauri::{AppHandle, Runtime};

use super::{Inner, lock};

impl Inner {
    /// The track this install follows: the person's choice, or its build's.
    pub(super) fn track(&self) -> UpdateTrack {
        install_track(self.record.chosen_track, &self.current)
    }

    /// Forgets what the other track found: a download in progress stops, and
    /// an update found or downloaded but not installed is dropped, since it
    /// is signed with the other track's key and couldn't install.
    fn forget_found(&mut self) {
        if let Some(task) = self.download.take() {
            task.abort();
        }
        self.ready = None;
        self.found = None;
        self.record.last_result = None;
        self.state = Some(UpdateState::NeverChecked);
    }
}

/// The "Update track" choice: saved in the record, and on a change what the
/// other track found is dropped. It never checks by itself: the page asks
/// for a check when the person picks Preview. Stable never installs an older
/// version, since the updater only takes a version newer than the one that
/// runs.
#[tauri::command]
pub fn update_set_track<R: Runtime>(app: AppHandle<R>, track: UpdateTrack) -> UpdateStatus {
    let mut inner = lock(&app);
    if inner.track() != track {
        inner.forget_found();
    }
    inner.record.chosen_track = Some(track);
    inner.save();
    inner.notify();
    inner.status()
}
