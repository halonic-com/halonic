use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use crate::{Availability, Confirmation, Decision, FakeOwnerCheck, OwnerCheck};

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

#[test]
fn owner_check_fake_never_confirms_unless_told() {
    let check = FakeOwnerCheck::new();
    assert_eq!(
        now(check.confirm(Decision::Approve)),
        Confirmation::Cancelled
    );
}

#[test]
fn owner_check_fake_asks_fresh_for_every_answer() {
    let check = FakeOwnerCheck::new();
    check.answer_next(Confirmation::Confirmed);
    assert_eq!(
        now(check.confirm(Decision::Approve)),
        Confirmation::Confirmed
    );
    // One pass covers one answer: the next one is asked again.
    assert_eq!(
        now(check.confirm(Decision::Approve)),
        Confirmation::Cancelled
    );
    assert_eq!(check.asked(), [Decision::Approve, Decision::Approve]);
}

#[test]
fn owner_check_fake_shows_no_prompt_when_unavailable() {
    let check = FakeOwnerCheck::new();
    check.set_availability(Availability::NotEnrolled);
    check.answer_next(Confirmation::Confirmed);
    assert_eq!(
        now(check.availability(Decision::Deny)),
        Availability::NotEnrolled
    );
    assert_eq!(
        now(check.confirm(Decision::Deny)),
        Confirmation::Unavailable(Availability::NotEnrolled)
    );
    assert!(check.asked().is_empty());
}

#[test]
fn owner_check_fake_takes_a_screen_lock_for_inbox_answers_only() {
    // A phone with a PIN and no strong biometric (HAL-19060).
    let check = FakeOwnerCheck::new();
    check.set_availability(Availability::NoStrongBiometric);
    check.set_screen_lock(true);
    assert_eq!(
        now(check.availability(Decision::Answer)),
        Availability::Ready
    );
    assert_eq!(
        now(check.availability(Decision::Approve)),
        Availability::NoStrongBiometric
    );
    check.answer_next(Confirmation::Confirmed);
    assert_eq!(
        now(check.confirm(Decision::Approve)),
        Confirmation::Unavailable(Availability::NoStrongBiometric)
    );
    assert_eq!(
        now(check.confirm(Decision::Answer)),
        Confirmation::Confirmed
    );
    assert_eq!(check.asked(), [Decision::Answer]);
}
