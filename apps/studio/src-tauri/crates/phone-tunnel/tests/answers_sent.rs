//! Answers to approvals, sent through the service to a fake computer: each
//! one goes out only after the owner check passed for its decision (board
//! decision 4b, HAL-15194; requirement `owner-check`, Julian's conditions
//! on HAL-15212). The fake computer records every frame the phone writes,
//! so an answer that went out without a pass would show up there.

mod common;

use common::{Gateway, HELLO, Phone, connected, next_message};
use halonic_owner_check::{Availability, Confirmation, Decision, FakeOwnerCheck};
use halonic_phone_tunnel::{LocalNetwork, SendRefusal};

const APPROVE: &str = r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve"}"#;
const DENY: &str =
    r#"{"type":"answer-approval","id":"a2","sessionId":"s1","approvalId":"ap1","decision":"deny"}"#;

fn owner(phone: &Phone) -> &FakeOwnerCheck {
    phone
        .host
        .owner
        .as_ref()
        .expect("the phone has an owner check")
}

#[tokio::test]
async fn owner_check_lets_an_answer_out_only_after_a_pass_for_it() {
    let mut phone = Phone::new("answers-pass", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;

    owner(&phone).answer_next(Confirmation::Confirmed);
    phone.tunnel.send(&id, generation, APPROVE).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, APPROVE);

    // A pass never covers the next answer: it asks again, and with nothing
    // queued the person closed the prompt.
    assert_eq!(
        phone.tunnel.send(&id, generation, DENY).await,
        Err(SendRefusal::NotConfirmed)
    );
    assert_eq!(owner(&phone).asked(), [Decision::Approve, Decision::Deny]);

    // Nothing went out, and the session is still open.
    phone.tunnel.send(&id, generation, HELLO).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

#[tokio::test]
async fn owner_check_sends_nothing_unless_the_prompt_passed() {
    let mut phone = Phone::new("answers-no-pass", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;
    let failed = [
        Confirmation::Cancelled,
        Confirmation::LockedOut,
        Confirmation::Busy,
        Confirmation::Unavailable(Availability::Unavailable),
    ];

    for confirmation in failed {
        owner(&phone).answer_next(confirmation);
        assert_eq!(
            phone.tunnel.send(&id, generation, APPROVE).await,
            Err(SendRefusal::NotConfirmed),
            "{confirmation:?}"
        );
    }
    // A phone that can't check at all shows no prompt and sends nothing.
    owner(&phone).set_availability(Availability::NotEnrolled);
    assert_eq!(
        phone.tunnel.send(&id, generation, DENY).await,
        Err(SendRefusal::NotConfirmed)
    );

    phone.tunnel.send(&id, generation, HELLO).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

/// Julian's condition 2: no owner check (iOS, or its setup failed) means no
/// answer goes out; the gate is never skipped.
#[tokio::test]
async fn owner_check_missing_sends_no_answer() {
    let mut phone = Phone::with_owner_check("answers-no-check", LocalNetwork::Allowed, None);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;

    for answer in [APPROVE, DENY] {
        assert_eq!(
            phone.tunnel.send(&id, generation, answer).await,
            Err(SendRefusal::NotConfirmed)
        );
    }

    // Messages that answer nothing still go out.
    phone.tunnel.send(&id, generation, HELLO).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

/// Julian's condition 1: a message the host could read as an answer while
/// the shell reads it another way is refused before any prompt, and never
/// sent, even when the person would pass.
#[tokio::test]
async fn owner_check_never_lets_an_ambiguous_answer_out() {
    let mut phone = Phone::new("answers-ambiguous", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;
    let refused = [
        // A repeated `type`.
        r#"{"type":"unwatch","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve","type":"answer-approval"}"#,
        // A repeated `decision`.
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"deny","decision":"approve"}"#,
        // An unknown `type`.
        r#"{"type":"answer-approvals","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve"}"#,
        // Not JSON.
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":approve}"#,
    ];

    for message in refused {
        owner(&phone).answer_next(Confirmation::Confirmed);
        assert_eq!(
            phone.tunnel.send(&id, generation, message).await,
            Err(SendRefusal::NotAllowed),
            "{message}"
        );
    }
    assert!(owner(&phone).asked().is_empty(), "no prompt was shown");

    phone.tunnel.send(&id, generation, HELLO).await.unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, HELLO);
}

/// Message version 4 (HAL-17634): an answer to an inbox item goes out only
/// after the owner check passed, as an answer to an approval does.
#[tokio::test]
async fn owner_check_guards_an_inbox_answer_too() {
    const INBOX_ANSWER: &str = r#"{"type":"msg-answer","id":"i1","item":"item1","answer":{"kind":"reply","text":"yes"},"confirmed":true}"#;
    let mut phone = Phone::new("answers-inbox", LocalNetwork::Allowed);
    let gateway = Gateway::start().await;
    let (id, mut server, mut session, generation) = connected(&mut phone, &gateway).await;

    owner(&phone).answer_next(Confirmation::Cancelled);
    assert_eq!(
        phone.tunnel.send(&id, generation, INBOX_ANSWER).await,
        Err(SendRefusal::NotConfirmed)
    );
    owner(&phone).answer_next(Confirmation::Confirmed);
    phone
        .tunnel
        .send(&id, generation, INBOX_ANSWER)
        .await
        .unwrap();
    assert_eq!(next_message(&mut server, &mut session).await, INBOX_ANSWER);
    assert_eq!(owner(&phone).asked(), [Decision::Answer, Decision::Answer]);
}
