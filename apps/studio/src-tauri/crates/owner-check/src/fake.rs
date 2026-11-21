use std::collections::VecDeque;
use std::sync::Mutex;

use crate::answers::{Availability, Confirmation};
use crate::check::OwnerCheck;
use crate::prompt::Decision;

/// An [`OwnerCheck`] for tests. It answers [`Confirmation::Confirmed`] only
/// when a test queued it, so a test that forgets to say what the person did
/// sees a cancel, never a pass. It records every prompt it was asked for.
#[derive(Debug)]
pub struct FakeOwnerCheck {
    state: Mutex<State>,
}

#[derive(Debug)]
struct State {
    availability: Availability,
    answers: VecDeque<Confirmation>,
    asked: Vec<Decision>,
}

impl Default for FakeOwnerCheck {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                availability: Availability::Ready,
                answers: VecDeque::new(),
                asked: Vec::new(),
            }),
        }
    }
}

impl FakeOwnerCheck {
    /// A ready check with no answers queued.
    pub fn new() -> Self {
        Self::default()
    }

    /// From now on the phone reports `availability`. Anything but
    /// [`Availability::Ready`] answers every prompt with unavailable.
    pub fn set_availability(&self, availability: Availability) {
        self.lock().availability = availability;
    }

    /// Queues what the person does at the next prompt.
    pub fn answer_next(&self, confirmation: Confirmation) {
        self.lock().answers.push_back(confirmation);
    }

    /// The prompts shown so far, oldest first.
    pub fn asked(&self) -> Vec<Decision> {
        self.lock().asked.clone()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        // A test that panicked while holding the lock already failed.
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl OwnerCheck for FakeOwnerCheck {
    async fn availability(&self) -> Availability {
        self.lock().availability
    }

    async fn confirm(&self, decision: Decision) -> Confirmation {
        let mut state = self.lock();
        if !state.availability.is_ready() {
            return Confirmation::Unavailable(state.availability);
        }
        state.asked.push(decision);
        state.answers.pop_front().unwrap_or(Confirmation::Cancelled)
    }
}
