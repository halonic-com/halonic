//! Tests for `studio.src-tauri.crates.engine-pipe.routine-pause`. Each name
//! starts with `routine_pause_` until the trace check reads `cargo test`.

use std::time::Instant;

use halonic_engine_pipe::{
    EngineEvent, EngineHealth, PipeFault, PipeSession, RoutinePause, pause_routines_json,
};

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

fn open_session(now: Instant) -> PipeSession {
    let handshake = format!(
        r#"{{"kind":"handshake","protocol":1,"url":"http://127.0.0.1:4100","token":"{TOKEN}"}}"#
    );
    let mut session = PipeSession::default();
    session.accept(handshake.as_bytes(), now).unwrap();
    session
}

fn text(json: Vec<u8>) -> String {
    String::from_utf8(json).unwrap()
}

#[test]
fn routine_pause_writes_the_pause_routines_frame() {
    assert_eq!(
        text(pause_routines_json(true)),
        r#"{"kind":"pause_routines","paused":true}"#
    );
    assert_eq!(
        text(pause_routines_json(false)),
        r#"{"kind":"pause_routines","paused":false}"#
    );
}

#[test]
fn routine_pause_is_sent_again_after_every_handshake() {
    let mut pause = RoutinePause::default();
    assert!(!pause.is_paused());
    // A fresh start, as after a full Quit: the engine still waits for the word.
    assert_eq!(
        text(pause.after_handshake()),
        r#"{"kind":"pause_routines","paused":false}"#
    );
    assert_eq!(
        text(pause.set(true)),
        r#"{"kind":"pause_routines","paused":true}"#
    );
    // A crash and a restart: the new engine hears the pause again.
    for _launch in 0..2 {
        assert_eq!(
            text(pause.after_handshake()),
            r#"{"kind":"pause_routines","paused":true}"#
        );
    }
    pause.set(false);
    assert!(!pause.is_paused());
    assert_eq!(
        text(pause.after_handshake()),
        r#"{"kind":"pause_routines","paused":false}"#
    );
}

#[test]
fn routine_pause_reads_paused_from_health() {
    let now = Instant::now();
    let mut session = open_session(now);
    let health =
        br#"{"kind":"health","scheduling":true,"paused":true,"activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#;
    let event = session.accept(health, now).unwrap();
    let EngineEvent::Health(health) = event else {
        panic!("not health: {event:?}");
    };
    assert_eq!(
        health,
        EngineHealth {
            scheduling: true,
            paused: true,
            active_runs: 0,
            runs_waiting: 0,
            last_tick: None,
            next_routine_at: None,
        }
    );
}

#[test]
fn routine_pause_health_without_paused_or_with_a_wrong_one_is_a_fault() {
    let now = Instant::now();
    let cases = [
        r#"{"kind":"health","scheduling":true,"activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#,
        r#"{"kind":"health","scheduling":true,"paused":"no","activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#,
        r#"{"kind":"health","scheduling":true,"paused":null,"activeRuns":0,"runsWaiting":0,"lastTick":null,"nextRoutineAt":null}"#,
    ];
    for json in cases {
        let mut session = open_session(now);
        assert_eq!(
            session.accept(json.as_bytes(), now).unwrap_err(),
            PipeFault::NotAMessage,
            "{json}"
        );
    }
}
