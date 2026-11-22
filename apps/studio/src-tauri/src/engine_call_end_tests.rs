//! Requirement `engine-commands`: a JSON call the page ends, or that a
//! reload ends, hangs up on the engine, so the engine stops what it was
//! doing for it (HAL-15998). The fake engine holds a chat turn open until
//! the shell hangs up, as a model call that is still running would.

use std::thread::JoinHandle;
use std::time::Duration;

use halonic_agent_host::Answer;
use serde_json::{Value, json};
use tauri::test::MockRuntime;
use tauri::{App, Manager};

use super::super::calls::time_limit;
use super::super::{
    EngineAnswer, EngineRefusal, EngineState, end_page, engine_request, engine_request_end,
};
use super::{FakeEngine, Seen, as_json, page, shell};
use crate::engine_routes::find_engine_route;

/// Starts the page's chat turn `call` on its own thread, as the page's
/// `invoke` waits for it.
fn start_chat_turn(
    app: &App<MockRuntime>,
    call: u64,
) -> JoinHandle<Result<EngineAnswer, EngineRefusal>> {
    let webview = page(app);
    std::thread::spawn(move || {
        tauri::async_runtime::block_on(engine_request(
            webview,
            "POST /api/chat-turn".to_owned(),
            call,
            None,
            Some(json!({"messages": []})),
        ))
    })
}

fn refusal_kind(call: JoinHandle<Result<EngineAnswer, EngineRefusal>>) -> Value {
    let answer = call.join().expect("the call's thread ends");
    as_json(&answer.expect_err("the call ends without an answer"))["kind"].clone()
}

/// One way a call ends before the engine answers: by the page, or by a reload.
type EndCall = dyn Fn(&App<MockRuntime>, u64);

#[test]
fn engine_commands_hang_up_when_the_page_ends_a_call_or_reloads() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let ends: [&EndCall; 2] = [
        &|app, call| engine_request_end(page(app), call),
        &|app, _| end_page(app, "main"),
    ];
    for (call, end) in (1_u64..).zip(ends) {
        let turn = start_chat_turn(&app, call);
        assert_eq!(fake.next_route(), "POST /api/chat-turn");

        end(&app, call);
        assert_eq!(fake.next(), Seen::HungUp("/api/chat-turn".to_owned()));
        assert_eq!(refusal_kind(turn), "call_ended");
        assert_eq!(app.state::<EngineState>().calls.count(), 0);
    }
}

#[test]
fn engine_commands_refuse_a_call_id_in_use_without_sending_it() {
    let fake = FakeEngine::serve(0);
    let app = shell(&fake);
    let turn = start_chat_turn(&app, 5);
    assert_eq!(fake.next_route(), "POST /api/chat-turn");

    let second = tauri::async_runtime::block_on(engine_request(
        page(&app),
        "GET /api/hello".to_owned(),
        5,
        None,
        None,
    ));
    assert_eq!(as_json(&second.expect_err("in use"))["kind"], "call_in_use");

    // Ending another id leaves the turn running; the engine then sees the
    // hang-up, never the refused call.
    engine_request_end(page(&app), 6);
    assert_eq!(app.state::<EngineState>().calls.count(), 1);
    engine_request_end(page(&app), 5);
    assert_eq!(fake.next(), Seen::HungUp("/api/chat-turn".to_owned()));
    assert_eq!(refusal_kind(turn), "call_ended");
}

#[test]
fn engine_commands_give_a_chat_turn_longer_than_other_json_routes() {
    let route = |name| find_engine_route(name, Answer::Json).expect("a route of the table");
    assert_eq!(
        time_limit(route("POST /api/chat-turn")),
        Duration::from_secs(600)
    );
    assert_eq!(
        time_limit(route("POST /api/runs")),
        Duration::from_secs(120)
    );
}
