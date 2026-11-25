//! Tests for `studio.src-tauri.crates.engine-pipe.control-pipe`. Each name
//! starts with `control_pipe_` until the trace check reads `cargo test`.

use std::io::Cursor;
use std::time::{Duration, Instant};

use halonic_engine_pipe::{
    EngineEvent, MAX_ENGINE_FRAME_BYTES, MAX_SHELL_FRAME_BYTES, PipeFault, PipeSession,
    SandboxHost, read_frame, sandbox_host_json, secret_answer_json, stop_json, write_frame,
};
use halonic_secret_broker::{BrokerAnswer, BrokerRefusal, BrokerRequest};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

fn handshake() -> String {
    format!(
        r#"{{"kind":"handshake","protocol":1,"url":"http://127.0.0.1:4100","token":"{TOKEN}"}}"#
    )
}

fn framed(json: &[u8]) -> Vec<u8> {
    let mut bytes = u32::try_from(json.len()).unwrap().to_be_bytes().to_vec();
    bytes.extend_from_slice(json);
    bytes
}

/// A session that took the handshake.
fn open_session(now: Instant) -> PipeSession {
    let mut session = PipeSession::default();
    let event = session.accept(handshake().as_bytes(), now).unwrap();
    assert!(matches!(event, EngineEvent::Handshake(_)));
    session
}

#[test]
fn control_pipe_reads_frames_and_a_clean_end() {
    let mut bytes = framed(b"{\"a\":1}");
    bytes.extend(framed(b"{}"));
    let mut input = Cursor::new(bytes);
    assert_eq!(read_frame(&mut input).unwrap().unwrap(), b"{\"a\":1}");
    assert_eq!(read_frame(&mut input).unwrap().unwrap(), b"{}");
    assert_eq!(read_frame(&mut input).unwrap(), None);
}

#[test]
fn control_pipe_refuses_bad_lengths_and_cut_frames() {
    let over = u32::try_from(MAX_ENGINE_FRAME_BYTES + 1).unwrap();
    let cases: [(&str, Vec<u8>, PipeFault); 5] = [
        ("zero", vec![0, 0, 0, 0], PipeFault::Length),
        ("4 GiB", vec![0xff, 0xff, 0xff, 0xff], PipeFault::Length),
        ("one over", over.to_be_bytes().to_vec(), PipeFault::Length),
        ("cut prefix", vec![0, 0], PipeFault::Cut),
        ("cut body", vec![0, 0, 0, 9, b'{'], PipeFault::Cut),
    ];
    for (name, bytes, fault) in cases {
        assert_eq!(read_frame(&mut Cursor::new(bytes)), Err(fault), "{name}");
    }
    let largest = vec![b' '; MAX_ENGINE_FRAME_BYTES];
    let read = read_frame(&mut Cursor::new(framed(&largest))).unwrap();
    assert_eq!(read.map(|json| json.len()), Some(MAX_ENGINE_FRAME_BYTES));
}

#[test]
fn control_pipe_takes_the_engines_messages_in_order() {
    let now = Instant::now();
    let mut session = open_session(now);
    let event = session
        .accept(br#"{"kind":"secret_get","id":1,"name":"acme_key"}"#, now)
        .unwrap();
    let request = match event {
        EngineEvent::Request { id: 1, request } => request,
        other => panic!("not request 1: {other:?}"),
    };
    assert_eq!(
        request,
        BrokerRequest::Secret {
            name: "acme_key".into()
        }
    );
    let token = session.accept(br#"{"kind":"token_get","id":2,"name":"acme"}"#, now);
    assert!(matches!(token, Ok(EngineEvent::Request { id: 2, .. })));
    let origins = session.accept(br#"{"kind":"origins_get","id":7,"name":"acme_key"}"#, now);
    assert!(matches!(origins, Ok(EngineEvent::Request { id: 7, .. })));
    let health =
        br#"{"kind":"health","scheduling":true,"paused":false,"activeRuns":2,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#;
    assert!(matches!(
        session.accept(health, now),
        Ok(EngineEvent::Health(_))
    ));
    session.stop_sent();
    let stopped = session.accept(br#"{"kind":"stopped","interrupted":1}"#, now);
    assert!(matches!(
        stopped,
        Ok(EngineEvent::Stopped { interrupted: 1 })
    ));
}

#[test]
fn control_pipe_faults_on_anything_else() {
    let now = Instant::now();
    let bad_handshakes: [(&str, String, PipeFault); 7] = [
        ("not JSON", "{\"kind\":".into(), PipeFault::NotAMessage),
        ("not an object", "\"text\"".into(), PipeFault::NotAMessage),
        (
            "request first",
            r#"{"kind":"secret_get","id":1,"name":"a"}"#.into(),
            PipeFault::BeforeHandshake,
        ),
        (
            "extra field",
            handshake().replace("\"protocol\"", "\"extra\":1,\"protocol\""),
            PipeFault::NotAMessage,
        ),
        (
            "other protocol",
            handshake().replace("\"protocol\":1", "\"protocol\":2"),
            PipeFault::Protocol,
        ),
        (
            "LAN address",
            handshake().replace("127.0.0.1:4100", "192.168.1.2:4000"),
            PipeFault::Handshake,
        ),
        (
            "handshake as an array",
            format!(r#"["handshake",1,"http://127.0.0.1:4100","{TOKEN}"]"#),
            PipeFault::NotAMessage,
        ),
    ];
    for (name, json, fault) in bad_handshakes {
        let mut session = PipeSession::default();
        assert_eq!(
            session.accept(json.as_bytes(), now).unwrap_err(),
            fault,
            "{name}"
        );
    }
    let invalid_utf8 = PipeSession::default().accept(b"{\"kind\":\"\xff\"}", now);
    assert_eq!(invalid_utf8.unwrap_err(), PipeFault::NotAMessage);

    let after_handshake: [(&str, &str, PipeFault); 9] = [
        (
            "unknown kind",
            r#"{"kind":"secret_set","id":1,"name":"a"}"#,
            PipeFault::NotAMessage,
        ),
        (
            "missing field",
            r#"{"kind":"health","scheduling":true}"#,
            PipeFault::NotAMessage,
        ),
        (
            "fractional id",
            r#"{"kind":"secret_get","id":1.5,"name":"a"}"#,
            PipeFault::NotAMessage,
        ),
        (
            "unasked stopped",
            r#"{"kind":"stopped","interrupted":0}"#,
            PipeFault::Stopped,
        ),
        ("array", "[1,2]", PipeFault::NotAMessage),
        (
            "request as an array",
            r#"["secret_get",5,"acme"]"#,
            PipeFault::NotAMessage,
        ),
        (
            "health without lastTick",
            r#"{"kind":"health","scheduling":true,"paused":false,"activeRuns":0,"runsWaiting":0,"nextRoutineAt":null}"#,
            PipeFault::NotAMessage,
        ),
        (
            "repeated kind",
            r#"{"kind":"stopped","kind":"secret_get","id":1,"name":"a"}"#,
            PipeFault::NotAMessage,
        ),
        (
            "repeated id",
            r#"{"kind":"secret_get","id":1,"id":2,"name":"a"}"#,
            PipeFault::NotAMessage,
        ),
    ];
    for (name, json, fault) in after_handshake {
        let mut session = open_session(now);
        assert_eq!(
            session.accept(json.as_bytes(), now).unwrap_err(),
            fault,
            "{name}"
        );
    }
    let mut session = open_session(now);
    assert_eq!(
        session.accept(handshake().as_bytes(), now).unwrap_err(),
        PipeFault::SecondHandshake
    );
}

#[test]
fn control_pipe_faults_on_repeated_or_lower_ids_and_after_stopped() {
    let now = Instant::now();
    let mut session = open_session(now);
    session
        .accept(br#"{"kind":"secret_get","id":3,"name":"a"}"#, now)
        .unwrap();
    let repeated = session.accept(br#"{"kind":"token_get","id":3,"name":"a"}"#, now);
    assert_eq!(repeated.unwrap_err(), PipeFault::RequestId);

    let mut session = open_session(now);
    session
        .accept(br#"{"kind":"secret_get","id":3,"name":"a"}"#, now)
        .unwrap();
    let lower = session.accept(br#"{"kind":"secret_get","id":2,"name":"a"}"#, now);
    assert_eq!(lower.unwrap_err(), PipeFault::RequestId);

    let mut session = open_session(now);
    session.stop_sent();
    session
        .accept(br#"{"kind":"stopped","interrupted":0}"#, now)
        .unwrap();
    let after = session.accept(
        br#"{"kind":"health","scheduling":false,"paused":false,"activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#,
        now,
    );
    assert_eq!(after.unwrap_err(), PipeFault::Stopped);
}

#[test]
fn control_pipe_faults_never_hold_the_frame() {
    let mut session = PipeSession::default();
    let leaky = handshake().replace("127.0.0.1:4100", "example.com");
    let fault = session
        .accept(leaky.as_bytes(), Instant::now())
        .unwrap_err();
    for text in [fault.to_string(), format!("{fault:?}")] {
        assert!(!text.contains(TOKEN), "{text}");
        assert!(!text.contains("example.com"), "{text}");
    }
}

#[test]
fn control_pipe_drops_health_beyond_one_a_second() {
    let start = Instant::now();
    let mut session = open_session(start);
    let health = br#"{"kind":"health","scheduling":true,"paused":false,"activeRuns":0,"runsWaiting":0,"lastTick":"2026-11-23T10:00:00.000Z","nextRoutineAt":null}"#;
    assert!(matches!(
        session.accept(health, start),
        Ok(EngineEvent::Health(_))
    ));
    let soon = start + Duration::from_millis(500);
    assert!(matches!(
        session.accept(health, soon),
        Ok(EngineEvent::Dropped)
    ));
    let later = start + Duration::from_secs(1);
    assert!(matches!(
        session.accept(health, later),
        Ok(EngineEvent::Health(_))
    ));
}

#[test]
fn control_pipe_writes_the_shells_frames() {
    let answer = BrokerAnswer::Refused {
        reason: BrokerRefusal::Busy,
    };
    let cases: [(Vec<u8>, &str); 4] = [
        (stop_json(), r#"{"kind":"stop"}"#),
        (
            sandbox_host_json(None),
            r#"{"kind":"sandbox_host","connection":null}"#,
        ),
        (
            sandbox_host_json(Some(SandboxHost {
                url: "http://127.0.0.1:4200",
                token: "t",
            })),
            r#"{"kind":"sandbox_host","connection":{"url":"http://127.0.0.1:4200","token":"t"}}"#,
        ),
        (
            secret_answer_json(3, &answer),
            r#"{"kind":"secret_answer","id":3,"result":"refused","reason":"busy"}"#,
        ),
    ];
    for (json, expected) in cases {
        assert_eq!(String::from_utf8(json.clone()).unwrap(), expected);
        let mut written = Vec::new();
        write_frame(&mut written, &json).unwrap();
        assert_eq!(read_frame(&mut Cursor::new(written)).unwrap(), Some(json));
    }
    let value = BrokerAnswer::Value {
        value: Some("acme-value".into()),
    };
    let json = String::from_utf8(secret_answer_json(4, &value)).unwrap();
    assert_eq!(
        json,
        r#"{"kind":"secret_answer","id":4,"result":"value","value":"acme-value"}"#
    );
}

#[test]
fn control_pipe_writes_no_empty_or_oversized_frame() {
    let mut written = Vec::new();
    assert_eq!(write_frame(&mut written, b""), Err(PipeFault::Length));
    let over = vec![b' '; MAX_SHELL_FRAME_BYTES + 1];
    assert_eq!(write_frame(&mut written, &over), Err(PipeFault::Length));
    assert!(written.is_empty());
}
