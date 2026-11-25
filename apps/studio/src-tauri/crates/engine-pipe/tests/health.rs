//! Tests for `studio.src-tauri.crates.engine-pipe.health-status`. Each name
//! starts with `health_status_` until the trace check reads `cargo test`.

use std::time::Instant;

use halonic_engine_pipe::{EngineEvent, EngineHealth, PipeFault, PipeSession};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

fn open_session(now: Instant) -> PipeSession {
    let handshake = format!(
        r#"{{"kind":"handshake","protocol":1,"url":"http://127.0.0.1:4100","token":"{TOKEN}"}}"#
    );
    let mut session = PipeSession::default();
    session.accept(handshake.as_bytes(), now).unwrap();
    session
}

/// A `health` frame with these two fields, and the rest as an engine with 2
/// runs going sends them.
fn health_frame(runs_waiting: &str, next_routine_at: &str) -> String {
    format!(
        r#"{{"kind":"health","scheduling":true,"paused":false,"activeRuns":2,"runsWaiting":{runs_waiting},"lastTick":"2026-11-25T09:00:00.000Z","nextRoutineAt":{next_routine_at}}}"#
    )
}

fn read(json: &str) -> Result<EngineEvent, PipeFault> {
    let now = Instant::now();
    open_session(now).accept(json.as_bytes(), now)
}

#[test]
fn health_status_reads_the_runs_waiting_and_the_next_routine() {
    let event = read(&health_frame("1", r#""2026-11-25T14:00:00.000Z""#)).unwrap();
    let EngineEvent::Health(health) = event else {
        panic!("not health: {event:?}");
    };
    assert_eq!(
        health,
        EngineHealth {
            scheduling: true,
            paused: false,
            active_runs: 2,
            runs_waiting: 1,
            last_tick: Some("2026-11-25T09:00:00.000Z".into()),
            next_routine_at: Some("2026-11-25T14:00:00.000Z".into()),
        }
    );
    let none = read(&health_frame("0", "null")).unwrap();
    let EngineEvent::Health(health) = none else {
        panic!("not health: {none:?}");
    };
    assert_eq!(health.next_routine_at, None);
}

#[test]
fn health_status_faults_on_missing_or_extra_fields() {
    let full = health_frame("0", "null");
    let cases = [
        (
            "without runsWaiting",
            full.replace(r#""runsWaiting":0,"#, ""),
        ),
        (
            "without nextRoutineAt",
            full.replace(r#","nextRoutineAt":null"#, ""),
        ),
        (
            "an unknown field",
            full.replace(r#""runsWaiting":0,"#, r#""runsWaiting":0,"runsQueued":0,"#),
        ),
        ("runsWaiting as text", health_frame(r#""1""#, "null")),
        ("negative runsWaiting", health_frame("-1", "null")),
    ];
    for (name, json) in cases {
        assert_eq!(read(&json).unwrap_err(), PipeFault::NotAMessage, "{name}");
    }
}

#[test]
fn health_status_faults_on_more_waiting_than_going() {
    assert_eq!(
        read(&health_frame("3", "null")).unwrap_err(),
        PipeFault::NotAMessage
    );
    assert!(matches!(
        read(&health_frame("2", "null")),
        Ok(EngineEvent::Health(_))
    ));
}

#[test]
fn health_status_faults_on_a_next_routine_in_another_form() {
    let cases = [
        r#""14:00""#,
        r#""""#,
        r#""2026-11-25T14:00:00Z""#,
        r#""2026-11-25T14:00:00.000+01:00""#,
        r#""2026-11-25 14:00:00.000Z""#,
        r#""2026-13-25T14:00:00.000Z""#,
        r#""2026-11-00T14:00:00.000Z""#,
        r#""2026-11-25T24:00:00.000Z""#,
        r#""2026-11-25T14:60:00.000Z""#,
        r#""2026-11-25T14:00:00.000Z ""#,
        r#""２026-11-25T14:00:00.000Z""#,
        "1764079200000",
    ];
    for next_routine_at in cases {
        assert_eq!(
            read(&health_frame("0", next_routine_at)).unwrap_err(),
            PipeFault::NotAMessage,
            "{next_routine_at}"
        );
    }
}
