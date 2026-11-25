//! The checks before a message the page sends is sealed, and the exact
//! shape of the answer the page gets.

use halonic_owner_check::Decision;
use serde_json::json;

use crate::messages::{
    CheckedMessage, GATEWAY_MAX_MESSAGE_BYTES, SendAnswer, SendRefusal, check_message,
};

const PLAIN: Result<CheckedMessage, SendRefusal> = Ok(CheckedMessage::Plain);
const NOT_ALLOWED: Result<CheckedMessage, SendRefusal> = Err(SendRefusal::NotAllowed);

/// A `prompt` of exactly `bytes` UTF-8 bytes.
fn prompt_of(bytes: usize) -> String {
    let frame = r#"{"type":"prompt","id":"p1","sessionId":"s1","text":""}"#;
    let mut text = "a".repeat(bytes - frame.len());
    // A multi-byte character, so the limit is checked in bytes, not
    // characters.
    text.replace_range(..3, "€");
    format!(r#"{{"type":"prompt","id":"p1","sessionId":"s1","text":"{text}"}}"#)
}

#[test]
fn phone_tunnel_messages_allow_the_five_plain_phone_messages() {
    let plain = [
        json!({ "type": "hello", "id": "h1", "version": 2 }),
        json!({ "type": "list-sessions", "id": "l1" }),
        json!({ "type": "watch", "id": "w1", "sessionId": "s1", "afterSeq": 0 }),
        json!({ "type": "unwatch", "id": "u1", "sessionId": "s1" }),
        json!({ "type": "prompt", "id": "p1", "sessionId": "s1", "text": "hi" }),
    ];
    for message in plain {
        assert_eq!(check_message(&message.to_string()), PLAIN, "{message}");
    }
    // Keys in any order, with white space around.
    let spaced = " {\"id\":\"l1\" , \"type\":\"list-sessions\"}\n";
    assert_eq!(check_message(spaced), PLAIN);
}

#[test]
fn phone_tunnel_messages_give_an_answers_decision() {
    let answer = |decision: &str| {
        json!({
            "type": "answer-approval",
            "id": "a1",
            "sessionId": "s1",
            "approvalId": "ap1",
            "decision": decision,
        })
        .to_string()
    };
    assert_eq!(
        check_message(&answer("approve")),
        Ok(CheckedMessage::Answer(Decision::Approve))
    );
    assert_eq!(
        check_message(&answer("deny")),
        Ok(CheckedMessage::Answer(Decision::Deny))
    );
    for decision in ["Approve", "reject", "", "approve "] {
        assert_eq!(check_message(&answer(decision)), NOT_ALLOWED, "{decision}");
    }
}

/// Julian's condition 1 on HAL-15212: a message the host's `JSON.parse`
/// (the last key wins) could read another way than the shell is never
/// sent, so the owner check can't say Reject while the host reads approve,
/// or miss an answer altogether.
#[test]
fn phone_tunnel_messages_refuse_any_key_twice() {
    let refused = [
        // Two decisions, either way round, also written with escapes.
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"deny","decision":"approve"}"#,
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve","decision":"deny"}"#,
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"deny","\u0064ecision":"approve"}"#,
        // Two types: the shell would see a plain message, the host an answer.
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve","type":"unwatch"}"#,
        r#"{"type":"unwatch","id":"a1","sessionId":"s1","approvalId":"ap1","decision":"approve","type":"answer-approval"}"#,
        // Any other key twice.
        r#"{"type":"unwatch","id":"u1","sessionId":"s1","sessionId":"s2"}"#,
        r#"{"type":"answer-approval","id":"a1","sessionId":"s1","approvalId":"ap1","approvalId":"ap2","decision":"deny"}"#,
    ];
    for message in refused {
        assert_eq!(check_message(message), NOT_ALLOWED, "{message}");
    }
}

#[test]
fn phone_tunnel_messages_refuse_missing_or_extra_keys() {
    let refused = [
        // An answer that hides as another message, or lacks a key.
        json!({ "type": "unwatch", "id": "u1", "sessionId": "s1", "decision": "approve" }),
        json!({ "type": "prompt", "id": "p1", "sessionId": "s1", "approvalId": "ap1", "decision": "approve" }),
        json!({ "type": "answer-approval", "id": "a1", "sessionId": "s1", "decision": "approve" }),
        json!({ "type": "answer-approval", "id": "a1", "sessionId": "s1", "approvalId": "ap1" }),
        json!({ "type": "answer-approval", "id": "a1", "sessionId": "s1", "approvalId": "ap1", "decision": "approve", "risk": "normal" }),
        // A decision that isn't text.
        json!({ "type": "answer-approval", "id": "a1", "sessionId": "s1", "approvalId": "ap1", "decision": true }),
        json!({ "type": "answer-approval", "id": "a1", "sessionId": "s1", "approvalId": "ap1", "decision": ["approve"] }),
        // Plain messages with a key too many or too few.
        json!({ "type": "hello", "id": "h1" }),
        json!({ "type": "list-sessions" }),
        json!({ "type": "list-sessions", "id": "l1", "extra": 1 }),
    ];
    for message in refused {
        assert_eq!(
            check_message(&message.to_string()),
            NOT_ALLOWED,
            "{message}"
        );
    }
}

#[test]
fn phone_tunnel_messages_count_the_size_in_utf8_bytes_before_parsing() {
    assert_eq!(GATEWAY_MAX_MESSAGE_BYTES, 65_519);
    let largest = prompt_of(GATEWAY_MAX_MESSAGE_BYTES);
    assert_eq!(largest.len(), GATEWAY_MAX_MESSAGE_BYTES);
    assert_eq!(check_message(&largest), PLAIN);
    assert_eq!(
        check_message(&prompt_of(GATEWAY_MAX_MESSAGE_BYTES + 1)),
        Err(SendRefusal::TooLarge)
    );
    // Too large is said before anything is parsed.
    let junk = "x".repeat(GATEWAY_MAX_MESSAGE_BYTES + 1);
    assert_eq!(check_message(&junk), Err(SendRefusal::TooLarge));
}

#[test]
fn phone_tunnel_messages_refuse_anything_but_one_phone_message() {
    let refused = [
        // The host's messages, and types no one sends.
        r#"{"type":"welcome"}"#,
        r#"{"type":"paired"}"#,
        r#"{"type":"run-command"}"#,
        r#"{"type":"Hello","id":"h1","version":2}"#,
        // Not one object.
        r#"{"type":"hello"}{"type":"prompt"}"#,
        r#"{"type":"hello"} x"#,
        r#"[{"type":"hello"}]"#,
        r#""hello""#,
        "",
        "not json",
        "\u{feff}{\"type\":\"list-sessions\",\"id\":\"l1\"}",
        r#"{"type":"hello""#,
        // No string `type`, or two of them.
        r#"{"id":"p1"}"#,
        r#"{"type":null}"#,
        r#"{"type":["hello"]}"#,
        r#"{"type":"hello","type":"run-command"}"#,
        r#"{"type":"run-command","type":"hello"}"#,
        r#"{"type":"hello","type":"prompt"}"#,
        // A second `type` written with escapes is still a second `type`
        // (Liam on HAL-16120).
        r#"{"type":"hello","\u0074ype":"run-command"}"#,
        r#"{"type":"run-command","\u0074ype":"hello"}"#,
    ];
    for message in refused {
        assert_eq!(check_message(message), NOT_ALLOWED, "{message}");
    }
}

#[test]
fn phone_tunnel_messages_leave_values_to_the_host() {
    // Besides the decision, the values are the host's to judge, nested
    // `type`s included.
    let message = r#"{"type":"watch","id":"w1","sessionId":{"type":"run-command"},"afterSeq":-1}"#;
    assert_eq!(check_message(message), PLAIN);
}

#[test]
fn phone_tunnel_messages_answer_with_exactly_their_fields() {
    let shape = |answer: SendAnswer| serde_json::to_value(answer).expect("serialises");
    assert_eq!(shape(SendAnswer::from(Ok(()))), json!({ "sent": true }));
    let refusals = [
        (SendRefusal::NotOpen, "not-open"),
        (SendRefusal::TooLarge, "too-large"),
        (SendRefusal::NotAllowed, "not-allowed"),
        (SendRefusal::NotConfirmed, "not-confirmed"),
    ];
    for (refusal, reason) in refusals {
        assert_eq!(
            shape(SendAnswer::from(Err(refusal))),
            json!({ "sent": false, "reason": reason })
        );
    }
}

/// Message version 4 (HAL-17634): the Inbox, Messenger and team status
/// messages pass with their required keys and any of their optional ones.
#[test]
fn phone_tunnel_messages_allow_the_version_4_messages() {
    let plain = [
        json!({ "type": "msg-read", "id": "r1", "what": "inbox" }),
        json!({ "type": "msg-read", "id": "r2", "what": "agents", "cursor": "p2" }),
        json!({ "type": "msg-read", "id": "r3", "what": "messages", "conversation": "c1", "before": "m9" }),
        json!({ "type": "msg-search", "id": "s1", "text": "deploy" }),
        json!({ "type": "msg-send", "id": "m1", "conversation": "c1", "body": "hi" }),
        json!({ "type": "msg-send", "id": "m2", "conversation": "c1", "body": "hi", "to": ["b"] }),
        json!({ "type": "msg-watch", "id": "w1" }),
        json!({ "type": "msg-unwatch", "id": "w2" }),
        json!({ "type": "team-read", "id": "t1", "what": "seats" }),
        json!({ "type": "team-read", "id": "t2", "what": "spend", "range": "week" }),
        json!({ "type": "team-read", "id": "t3", "what": "pull-request", "pullRequest": "pr1" }),
    ];
    for message in plain {
        assert_eq!(check_message(&message.to_string()), PLAIN, "{message}");
    }
    let answer = json!({
        "type": "msg-answer",
        "id": "a1",
        "item": "i1",
        "answer": { "kind": "option", "option": "approve" },
        "confirmed": true,
    });
    assert_eq!(
        check_message(&answer.to_string()),
        Ok(CheckedMessage::Answer(Decision::Answer))
    );
}

#[test]
fn phone_tunnel_messages_refuse_other_version_4_types_and_keys() {
    let refused = [
        json!({ "type": "msg-read", "id": "r1" }),
        json!({ "type": "msg-read", "id": "r1", "what": "inbox", "token": "x" }),
        json!({ "type": "msg-answer", "id": "a1", "item": "i1", "answer": {} }),
        json!({ "type": "msg-send", "id": "m1", "conversation": "c1" }),
        json!({ "type": "msg-watch", "id": "w1", "source": "s" }),
        json!({ "type": "team-read", "id": "t1", "what": "seats", "account": "a" }),
        json!({ "type": "msg-start-channel", "id": "x" }),
        json!({ "type": "msg-join", "id": "x", "channel": "c1" }),
        json!({ "type": "team-agent-spend", "id": "x" }),
        json!({ "type": "msg-data", "replyTo": "x", "what": "inbox", "items": [] }),
    ];
    for message in refused {
        assert_eq!(
            check_message(&message.to_string()),
            NOT_ALLOWED,
            "{message}"
        );
    }
}
