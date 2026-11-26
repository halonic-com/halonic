//! When the owner check asks before an answer goes out (requirement
//! `phone-answer-confirm`, board option P3 on HAL-17509): an answer to an
//! approval asks every time; an answer to an inbox item asks at most once
//! every [`ANSWER_WINDOW`], while the app stays on the screen.
//!
//! The pass is kept in this process's memory only, never written down, and
//! the window runs from the pass: answering inside it doesn't extend it.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use halonic_owner_check::{Confirmation, Decision};

use crate::host::TunnelHost;

/// How long a passed check covers later inbox answers.
pub const ANSWER_WINDOW: Duration = Duration::from_secs(5 * 60);

/// The last passed check for an inbox answer, if one still may count.
#[derive(Debug, Default)]
pub(crate) struct AnswerWindow {
    pass: Mutex<Option<Pass>>,
}

#[derive(Debug, Clone, Copy)]
struct Pass {
    at: Instant,
    /// The app's count of times away right after the pass.
    times_away: u64,
}

impl AnswerWindow {
    /// Asks the owner check for `decision` unless a pass still covers it,
    /// at `now`. Only [`Confirmation::Confirmed`] lets the answer out.
    pub(crate) async fn confirm(
        &self,
        host: &dyn TunnelHost,
        decision: Decision,
        now: Instant,
    ) -> Confirmation {
        if decision != Decision::Answer {
            return host.confirm_owner(decision).await;
        }
        if self.covers(host, now).await {
            return Confirmation::Confirmed;
        }
        let confirmation = host.confirm_owner(decision).await;
        self.keep(host, confirmation, now).await;
        confirmation
    }

    /// Whether the kept pass is younger than [`ANSWER_WINDOW`] at `now` and
    /// the app hasn't left the screen since. Forgets it when not.
    async fn covers(&self, host: &dyn TunnelHost, now: Instant) -> bool {
        let Some(pass) = *self.lock() else {
            return false;
        };
        let young = now
            .checked_duration_since(pass.at)
            .is_some_and(|age| age < ANSWER_WINDOW);
        let stayed = host.times_away().await == Some(pass.times_away);
        if young && stayed {
            return true;
        }
        self.lock().take();
        false
    }

    /// Keeps a pass from `now`, or forgets the last one on anything else.
    /// `now` is when the answer reached the shell, before the prompt showed,
    /// so the time spent in the prompt comes off the window: it only gets
    /// shorter, never longer. The count is read after the prompt, which may
    /// itself have covered the app (a PIN screen), so that doesn't end the
    /// window it opens.
    async fn keep(&self, host: &dyn TunnelHost, confirmation: Confirmation, now: Instant) {
        let times_away = if confirmation.is_confirmed() {
            host.times_away().await
        } else {
            None
        };
        *self.lock() = times_away.map(|times_away| Pass {
            at: now,
            times_away,
        });
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<Pass>> {
        // A pass is a plain value: a panic elsewhere can't leave it half
        // written, so a poisoned lock still holds a whole one.
        self.pass
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
