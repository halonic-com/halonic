//! When the owner check asks before an answer goes out (requirement
//! `phone-answer-confirm`), with the crate's fake owner check and a fake
//! clock: each test names the instants it answers at.

use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use halonic_device_keys::ComputerId;
use halonic_owner_check::{Availability, Confirmation, Decision, FakeOwnerCheck};
use halonic_tunnel::{PhoneDetails, Platform};

use crate::answer_confirm::{ANSWER_WINDOW, AnswerWindow};
use crate::host::{
    AwayAnswer, LocalNetwork, LocalNetworkAnswer, OwnerAnswer, PhoneAnswer, TunnelHost,
    confirm_with, times_away_with,
};
use crate::status::PageStatus;

/// A host with an owner check and nothing else.
struct Owner(Option<FakeOwnerCheck>);

impl TunnelHost for Owner {
    fn allow_local_network(&self) -> LocalNetworkAnswer<'_> {
        Box::pin(async { LocalNetwork::Allowed })
    }

    fn phone(&self) -> PhoneAnswer<'_> {
        Box::pin(async {
            PhoneDetails {
                name: "Pixel 9".to_owned(),
                platform: Platform::Android,
            }
        })
    }

    fn confirm_owner(&self, decision: Decision) -> OwnerAnswer<'_> {
        Box::pin(confirm_with(self.0.as_ref(), decision))
    }

    fn times_away(&self) -> AwayAnswer<'_> {
        Box::pin(times_away_with(self.0.as_ref()))
    }

    fn status_changed(&self, _: &ComputerId, _: &PageStatus) {}

    fn session_opened(&self, _: &ComputerId, _: u64) {}

    fn message(&self, _: &ComputerId, _: u64, _: &str) {}

    fn log(&self, _: &str) {}
}

impl Owner {
    fn check(&self) -> &FakeOwnerCheck {
        self.0.as_ref().expect("the phone has an owner check")
    }
}

/// Runs a future that never waits, as every fake answer is.
fn now<T>(future: impl Future<Output = T>) -> T {
    let mut future = pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("the fake owner check waited"),
    }
}

fn answer(window: &AnswerWindow, host: &Owner, decision: Decision, at: Instant) -> Confirmation {
    now(window.confirm(host, decision, at))
}

const SECOND: Duration = Duration::from_secs(1);

#[test]
fn phone_answer_confirm_asks_once_for_inbox_answers_inside_five_minutes() {
    let host = Owner(Some(FakeOwnerCheck::new()));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Answer, start).is_confirmed());
    let later = start + ANSWER_WINDOW - SECOND;
    assert!(answer(&window, &host, Decision::Answer, later).is_confirmed());
    assert_eq!(host.check().asked(), [Decision::Answer]);
}

#[test]
fn phone_answer_confirm_asks_again_after_five_minutes() {
    let host = Owner(Some(FakeOwnerCheck::new()));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Answer, start).is_confirmed());
    // Answering inside the window doesn't extend it.
    assert!(answer(&window, &host, Decision::Answer, start + 60 * SECOND).is_confirmed());
    let late = start + ANSWER_WINDOW + SECOND;
    assert_eq!(
        answer(&window, &host, Decision::Answer, late),
        Confirmation::Cancelled
    );
    assert_eq!(host.check().asked(), [Decision::Answer, Decision::Answer]);
}

#[test]
fn phone_answer_confirm_always_asks_for_an_approval() {
    let host = Owner(Some(FakeOwnerCheck::new()));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Confirmed);
    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Approve, start).is_confirmed());
    assert!(answer(&window, &host, Decision::Answer, start + SECOND).is_confirmed());
    // Neither a pass for an approval nor one for an inbox answer covers an
    // approval.
    for (seconds, decision) in [(2, Decision::Approve), (3, Decision::Deny)] {
        let at = start + seconds * SECOND;
        assert_eq!(
            answer(&window, &host, decision, at),
            Confirmation::Cancelled
        );
    }
    assert_eq!(
        host.check().asked(),
        [
            Decision::Approve,
            Decision::Answer,
            Decision::Approve,
            Decision::Deny
        ]
    );
}

#[test]
fn phone_answer_confirm_asks_again_after_the_app_left_the_screen() {
    let host = Owner(Some(FakeOwnerCheck::new()));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Answer, start).is_confirmed());
    host.check().leave_screen();
    assert_eq!(
        answer(&window, &host, Decision::Answer, start + SECOND),
        Confirmation::Cancelled
    );

    // A phone that can't tell whether the app left keeps no pass either.
    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Answer, start + 2 * SECOND).is_confirmed());
    host.check().lose_track_of_screen();
    assert_eq!(
        answer(&window, &host, Decision::Answer, start + 3 * SECOND),
        Confirmation::Cancelled
    );
    assert_eq!(host.check().asked().len(), 4);
}

#[test]
fn phone_answer_confirm_lets_nothing_out_without_a_pass() {
    let host = Owner(Some(FakeOwnerCheck::new()));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Cancelled);
    host.check().answer_next(Confirmation::LockedOut);
    assert_eq!(
        answer(&window, &host, Decision::Answer, start),
        Confirmation::Cancelled
    );
    // A failed check opens no window: the next answer asks again.
    assert_eq!(
        answer(&window, &host, Decision::Answer, start + SECOND),
        Confirmation::LockedOut
    );
    assert_eq!(host.check().asked().len(), 2);

    // A phone with no owner check never answers.
    let none = Owner(None);
    let window = AnswerWindow::default();
    assert!(!answer(&window, &none, Decision::Answer, start).is_confirmed());
}

/// "Given a phone with a PIN and no strong biometric, when the owner sends an
/// Inbox answer, then the prompt takes the PIN, and the answer goes out after
/// it." (HAL-19060)
#[test]
fn phone_answer_confirm_takes_the_pin_for_an_inbox_answer_without_a_strong_biometric() {
    let check = FakeOwnerCheck::new();
    check.set_availability(Availability::NoStrongBiometric);
    check.set_screen_lock(true);
    let host = Owner(Some(check));
    let window = AnswerWindow::default();
    let start = Instant::now();

    host.check().answer_next(Confirmation::Confirmed);
    assert!(answer(&window, &host, Decision::Answer, start).is_confirmed());
    assert_eq!(host.check().asked(), [Decision::Answer]);
    // A risky approval on the same phone still needs a strong biometric.
    assert_eq!(
        answer(&window, &host, Decision::Approve, start + SECOND),
        Confirmation::Unavailable(Availability::NoStrongBiometric)
    );
}
