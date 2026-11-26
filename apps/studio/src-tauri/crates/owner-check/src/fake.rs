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
    /// What the phone reports for a strong biometric.
    availability: Availability,
    /// The phone has a PIN, pattern or password: an inbox answer can ask
    /// even without a strong biometric.
    screen_lock: bool,
    answers: VecDeque<Confirmation>,
    asked: Vec<Decision>,
    /// `None` once a test said the phone can't tell.
    times_away: Option<u64>,
}

impl Default for FakeOwnerCheck {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                availability: Availability::Ready,
                screen_lock: false,
                answers: VecDeque::new(),
                asked: Vec::new(),
                times_away: Some(0),
            }),
        }
    }
}

impl FakeOwnerCheck {
    /// A ready check with no answers queued.
    pub fn new() -> Self {
        Self::default()
    }

    /// From now on the phone reports `availability` for a strong biometric.
    /// Anything but [`Availability::Ready`] answers every prompt with
    /// unavailable, unless [`Self::set_screen_lock`] lets an inbox answer in.
    pub fn set_availability(&self, availability: Availability) {
        self.lock().availability = availability;
    }

    /// From now on the phone has a PIN, pattern or password (`true`) or not:
    /// with one, an inbox answer is ready whatever the strong biometric says.
    pub fn set_screen_lock(&self, screen_lock: bool) {
        self.lock().screen_lock = screen_lock;
    }

    /// Queues what the person does at the next prompt.
    pub fn answer_next(&self, confirmation: Confirmation) {
        self.lock().answers.push_back(confirmation);
    }

    /// The prompts shown so far, oldest first.
    pub fn asked(&self) -> Vec<Decision> {
        self.lock().asked.clone()
    }

    /// The app goes to the background, or the screen locks.
    pub fn leave_screen(&self) {
        let mut state = self.lock();
        state.times_away = state.times_away.map(|times| times + 1);
    }

    /// From now on the phone can't tell whether the app left the screen.
    pub fn lose_track_of_screen(&self) {
        self.lock().times_away = None;
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        // A test that panicked while holding the lock already failed.
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl State {
    fn availability(&self, decision: Decision) -> Availability {
        if decision.accepts_device_credential() && self.screen_lock {
            return Availability::Ready;
        }
        self.availability
    }
}

impl OwnerCheck for FakeOwnerCheck {
    async fn availability(&self, decision: Decision) -> Availability {
        self.lock().availability(decision)
    }

    async fn confirm(&self, decision: Decision) -> Confirmation {
        let mut state = self.lock();
        let availability = state.availability(decision);
        if !availability.is_ready() {
            return Confirmation::Unavailable(availability);
        }
        state.asked.push(decision);
        state.answers.pop_front().unwrap_or(Confirmation::Cancelled)
    }

    async fn times_away(&self) -> Option<u64> {
        self.lock().times_away
    }
}
