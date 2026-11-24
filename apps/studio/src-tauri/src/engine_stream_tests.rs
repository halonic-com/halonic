//! Requirement `engine-commands`: a stream route's events reach the page,
//! and the shell caps a page's streams and hangs up when one ends.

use halonic_agent_host::read_handshake;
use serde_json::{Value, json};
use tauri::test::MockRuntime;
use tauri::{App, Manager};

use super::super::{EngineState, end_page, engine_stream_end};
use super::{FakeEngine, Seen, TOKEN, WAIT, as_json, open_stream, page, shell};

#[test]
fn engine_commands_pass_on_a_streams_events_then_its_end() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let params = json!({"run": "r1", "after": 0});
    let (opened, events) = open_stream(&app, "GET /api/runs/{run}/events", 1, params);
    assert_eq!(as_json(&opened.expect("opened")), json!({"stream": 1}));
    let received: Vec<Value> = (0..3)
        .map(|_| events.recv_timeout(WAIT).expect("a message"))
        .collect();
    assert_eq!(
        received,
        [
            json!({"type": "event", "event": "run", "data": "{\"seq\":1}", "id": "1"}),
            json!({"type": "event", "event": "end", "data": "{}"}),
            json!({"type": "end"}),
        ]
    );

    let missing = json!({"run": "missing", "after": 0});
    let (refused, _) = open_stream(&app, "GET /api/runs/{run}/events", 2, missing);
    let refused = as_json(&refused.expect("the engine's answer"));
    assert_eq!(refused["answer"]["status"], 404, "{refused}");
}

#[test]
fn engine_commands_end_a_stream_whose_event_is_too_large() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let params = json!({"run": "big", "after": 0});
    let (opened, events) = open_stream(&app, "GET /api/runs/{run}/events", 1, params);
    assert!(opened.is_ok());
    let message = events.recv_timeout(WAIT).expect("a message");
    assert_eq!(message["type"], "failed", "{message}");
}

#[test]
fn engine_commands_cap_the_streams_a_page_has_open() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let mut open = Vec::new();
    for stream in 0..16 {
        let (opened, events) = open_stream(&app, "GET /api/run-updates", stream, json!({}));
        assert!(opened.is_ok(), "stream {stream}");
        open.push(events);
    }
    let (refused, _) = open_stream(&app, "GET /api/run-updates", 16, json!({}));
    assert_eq!(
        as_json(&refused.expect_err("one too many"))["kind"],
        "too_many_streams"
    );
    let (in_use, _) = open_stream(&app, "GET /api/run-updates", 3, json!({}));
    assert_eq!(
        as_json(&in_use.expect_err("in use"))["kind"],
        "stream_in_use"
    );
}

/// One way a stream ends: by the page, by a reload, or by the engine going.
type EndStream = dyn Fn(&App<MockRuntime>, u64);

#[test]
fn engine_commands_hang_up_when_the_page_ends_reloads_or_the_engine_goes() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let ends: [&EndStream; 3] = [
        &|app, stream| engine_stream_end(page(app), stream),
        &|app, _| end_page(app, "main"),
        &|app, _| {
            app.state::<EngineState>()
                .disconnect("main")
                .expect("disconnected");
        },
    ];
    for (stream, end) in (0_u64..).zip(ends) {
        let app_state = app.state::<EngineState>();
        if stream > 0 {
            let line = format!(
                r#"{{"url":"http://127.0.0.1:{}","token":"{TOKEN}"}}"#,
                fake.port
            );
            let handshake = read_handshake(&line).expect("a valid handshake");
            app_state.connect("main", handshake).expect("connected");
        }
        let (opened, events) = open_stream(&app, "GET /api/run-updates", stream, json!({}));
        assert!(opened.is_ok());
        events.recv_timeout(WAIT).expect("the first event");
        assert_eq!(fake.next_route(), "GET /api/run-updates");

        end(&app, stream);
        assert_eq!(fake.next(), Seen::HungUp("/api/run-updates".to_owned()));
        assert_eq!(app_state.streams.count(), 0);
    }
}
