//! The checks before a message the page sends is sealed, and the exact
//! shape of the answer the page gets.

use serde_json::json;

use crate::messages::{
    GATEWAY_MAX_MESSAGE_BYTES, PHONE_MESSAGE_TYPES, SendAnswer, SendRefusal, check_message,
};

/// A `prompt` of exactly `bytes` UTF-8 bytes.
fn prompt_of(bytes: usize) -> String {
    let frame = r#"{"type":"prompt","text":""}"#;
    let mut text = "a".repeat(bytes - frame.len());
    // A multi-byte character, so the limit is checked in bytes, not
    // characters.
    text.replace_range(..3, "€");
    format!(r#"{{"type":"prompt","text":"{text}"}}"#)
}

#[test]
fn phone_tunnel_messages_allow_the_six_phone_messages() {
    for kind in PHONE_MESSAGE_TYPES {
        let message = json!({ "type": kind, "id": "p1" }).to_string();
        assert_eq!(check_message(&message), Ok(()), "{kind}");
    }
    assert_eq!(check_message(" {\"type\":\"hello\"}\n"), Ok(()));
}

#[test]
fn phone_tunnel_messages_count_the_size_in_utf8_bytes_before_parsing() {
    assert_eq!(GATEWAY_MAX_MESSAGE_BYTES, 65_519);
    let largest = prompt_of(GATEWAY_MAX_MESSAGE_BYTES);
    assert_eq!(largest.len(), GATEWAY_MAX_MESSAGE_BYTES);
    assert_eq!(check_message(&largest), Ok(()));
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
        r#"{"type":"Hello"}"#,
        // Not one object.
        r#"{"type":"hello"}{"type":"prompt"}"#,
        r#"{"type":"hello"} x"#,
        r#"[{"type":"hello"}]"#,
        r#""hello""#,
        "",
        "not json",
        r#"{"type":"hello""#,
        // No string `type`, or two of them.
        r#"{"id":"p1"}"#,
        r#"{"type":null}"#,
        r#"{"type":["hello"]}"#,
        r#"{"type":"hello","type":"run-command"}"#,
        r#"{"type":"run-command","type":"hello"}"#,
        r#"{"type":"hello","type":"prompt"}"#,
    ];
    for message in refused {
        assert_eq!(
            check_message(message),
            Err(SendRefusal::NotAllowed),
            "{message}"
        );
    }
}

#[test]
fn phone_tunnel_messages_read_only_the_type() {
    // Everything else is the host's to judge, nested `type`s included.
    let message = r#"{"type":"watch","sessionId":{"type":"run-command"},"afterSeq":-1}"#;
    assert_eq!(check_message(message), Ok(()));
}

#[test]
fn phone_tunnel_messages_answer_with_exactly_their_fields() {
    let shape = |answer: SendAnswer| serde_json::to_value(answer).expect("serialises");
    assert_eq!(shape(SendAnswer::from(Ok(()))), json!({ "sent": true }));
    let refusals = [
        (SendRefusal::NotOpen, "not-open"),
        (SendRefusal::TooLarge, "too-large"),
        (SendRefusal::NotAllowed, "not-allowed"),
    ];
    for (refusal, reason) in refusals {
        assert_eq!(
            shape(SendAnswer::from(Err(refusal))),
            json!({ "sent": false, "reason": reason })
        );
    }
}
