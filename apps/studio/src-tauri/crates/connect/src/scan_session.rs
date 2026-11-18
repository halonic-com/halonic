//! Which pairing scan is open, and whether it was cancelled (HAL-12577,
//! finding F1 of the security review on HAL-12572). The shell keeps one
//! [`ScanSession`] and asks it before each step that can turn the camera on,
//! so a cancel is never lost, however early it comes:
//!
//! - during the camera permission question, before the plugin has been
//!   asked to scan: the scan then never asks it ([`ScanSession::may_open_camera`]);
//! - after the shell asked the plugin to scan, but before the plugin has
//!   taken the request: the shell cancels again later ([`CANCEL_FOLLOW_UPS`]);
//! - after the plugin took the request, but before CameraX has bound the
//!   camera: the plugin binds it once CameraX is ready, even when it was
//!   cancelled in between, so the follow-up cancels close it again.
//!
//! This holds no Tauri types: the shell's `pair_scan` module makes the calls.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

/// How long the shell waits before each repeated cancel, counted from the
/// one before. The barcode-scanner plugin binds the camera when CameraX is
/// ready, which takes up to a second or two the first time in a process and
/// one turn of the UI thread after that. A cancel that reached the plugin
/// before then closes nothing, so the shell repeats it until well after.
pub const CANCEL_FOLLOW_UPS: [Duration; 3] = [
    Duration::from_millis(300),
    Duration::from_millis(700),
    Duration::from_secs(2),
];

/// One scan, from the moment the page asks until it has its answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScanId(u64);

/// What a cancel needs the shell to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancelPlan {
    /// No scan has asked the plugin for the camera, so there is nothing to
    /// close. A scan that is still at the permission question stops there.
    Nothing,
    /// The plugin may have the camera on, or turn it on soon: cancel it now,
    /// and again after each of [`CANCEL_FOLLOW_UPS`] while
    /// [`ScanSession::may_follow_up`] allows.
    ClosePlugin(ScanId),
}

/// The open scan, if any. Safe to share between the scan and its cancels.
#[derive(Debug, Default)]
pub struct ScanSession {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    last_id: u64,
    open: Option<OpenScan>,
}

#[derive(Debug)]
struct OpenScan {
    id: ScanId,
    cancelled: bool,
    camera_asked: bool,
}

impl ScanSession {
    /// Opens a scan, or `None` while another is open: the plugin answers
    /// only its latest scan.
    pub fn begin(&self) -> Option<ScanId> {
        let mut state = self.state();
        if state.open.is_some() {
            return None;
        }
        state.last_id += 1;
        let id = ScanId(state.last_id);
        state.open = Some(OpenScan {
            id,
            cancelled: false,
            camera_asked: false,
        });
        Some(id)
    }

    /// Whether the scan may now ask the plugin for the camera: `false` once
    /// it was cancelled. From here on, a cancel closes the plugin.
    pub fn may_open_camera(&self, id: ScanId) -> bool {
        let mut state = self.state();
        match state.open.as_mut() {
            Some(scan) if scan.id == id && !scan.cancelled => {
                scan.camera_asked = true;
                true
            }
            _ => false,
        }
    }

    /// Records a cancel for the open scan, if any, and says what to close.
    pub fn cancel(&self) -> CancelPlan {
        let mut state = self.state();
        match state.open.as_mut() {
            Some(scan) => {
                scan.cancelled = true;
                if scan.camera_asked {
                    CancelPlan::ClosePlugin(scan.id)
                } else {
                    CancelPlan::Nothing
                }
            }
            None => CancelPlan::Nothing,
        }
    }

    /// Closes the scan once it has its answer.
    pub fn end(&self, id: ScanId) {
        let mut state = self.state();
        if state.open.as_ref().is_some_and(|scan| scan.id == id) {
            state.open = None;
        }
    }

    /// Whether a repeated cancel for `id` may still go out. It must, even
    /// after the scan has its answer, because the plugin can bind the camera
    /// after that. It stops once a newer scan has begun, which owns the
    /// camera now.
    pub fn may_follow_up(&self, id: ScanId) -> bool {
        self.state().open.as_ref().is_none_or(|scan| scan.id == id)
    }

    /// The state. A panic while it was held leaves it as consistent as
    /// before, so a poisoned lock is still read.
    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_scan_at_a_time() {
        let session = ScanSession::default();
        let first = session.begin().expect("the first scan opens");
        assert_eq!(session.begin(), None);
        session.end(first);
        let second = session.begin().expect("a scan opens after the last ended");
        assert_ne!(first, second);
    }

    #[test]
    fn a_cancel_during_the_permission_question_keeps_the_camera_off() {
        let session = ScanSession::default();
        let scan = session.begin().expect("opens");
        assert_eq!(session.cancel(), CancelPlan::Nothing);
        assert!(!session.may_open_camera(scan));
    }

    #[test]
    fn a_cancel_after_the_camera_was_asked_for_closes_the_plugin() {
        let session = ScanSession::default();
        let scan = session.begin().expect("opens");
        assert!(session.may_open_camera(scan));
        assert_eq!(session.cancel(), CancelPlan::ClosePlugin(scan));
        assert_eq!(session.cancel(), CancelPlan::ClosePlugin(scan));
    }

    #[test]
    fn a_cancel_with_no_open_scan_does_nothing() {
        let session = ScanSession::default();
        assert_eq!(session.cancel(), CancelPlan::Nothing);
        let scan = session.begin().expect("opens");
        assert!(session.may_open_camera(scan), "an old cancel doesn't stick");
        session.end(scan);
        assert_eq!(session.cancel(), CancelPlan::Nothing);
    }

    #[test]
    fn follow_ups_outlive_the_answer_but_not_a_newer_scan() {
        let session = ScanSession::default();
        let scan = session.begin().expect("opens");
        assert!(session.may_open_camera(scan));
        let CancelPlan::ClosePlugin(cancelled) = session.cancel() else {
            panic!("the plugin must be closed");
        };
        assert!(session.may_follow_up(cancelled), "while the scan waits");
        session.end(scan);
        assert!(session.may_follow_up(cancelled), "after its answer");
        let newer = session.begin().expect("a newer scan opens");
        assert!(!session.may_follow_up(cancelled), "a newer scan owns it");
        session.end(newer);
        assert!(
            !session.may_open_camera(scan),
            "an ended scan can't open it"
        );
    }

    #[test]
    fn an_old_scan_never_ends_a_newer_one() {
        let session = ScanSession::default();
        let old = session.begin().expect("opens");
        session.end(old);
        let newer = session.begin().expect("opens");
        session.end(old);
        assert_eq!(session.begin(), None, "the newer scan is still open");
        assert!(session.may_open_camera(newer));
    }

    #[test]
    fn the_follow_ups_last_well_past_a_slow_camera_start() {
        let total: Duration = CANCEL_FOLLOW_UPS.iter().sum();
        assert!(total >= Duration::from_secs(3), "{total:?}");
        assert!(total <= Duration::from_secs(5), "{total:?}");
    }
}
