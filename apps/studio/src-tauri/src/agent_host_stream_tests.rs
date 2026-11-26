//! Requirement `agent-host-commands`: the page's streams through the host,
//! against the stand-in host of `agent_host_tests.rs`.

use serde_json::json;
use tauri::Manager;

use super::super::{agent_host_stream_end, end_page_streams};
use super::{
    AfterHandshake, AgentHostState, FakeHost, Seen, Shell, WAIT, as_json, open_stream, page,
};

#[test]
fn agent_host_commands_answer_a_refused_stream_and_pass_on_an_opened_one() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let (refused, _) = open_stream(&shell.handle(), "POST /v1/sandbox/sessions/blocked", 1);
    let refused = as_json(&refused.expect("the host's answer"));
    assert!(refused.contains(r#""status":404"#), "{refused}");
    assert!(refused.contains("unknown_session"), "{refused}");

    // A refused stream's id is free again.
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 1);
    assert_eq!(as_json(&opened.expect("opened")), r#"{"stream":1}"#);
    assert_eq!(
        lines.recv_timeout(WAIT).expect("a line"),
        json!({"type": "line", "line": {"type": "started"}})
    );
}

#[test]
fn agent_host_commands_refuse_a_stream_id_the_page_already_uses() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (first, _lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 4);
    assert!(first.is_ok());
    let (second, _) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 4);
    assert!(as_json(&second.expect_err("in use")).contains("stream_in_use"));
}

#[test]
fn agent_host_commands_hang_up_when_the_page_ends_a_stream() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 2);
    assert!(opened.is_ok());
    lines.recv_timeout(WAIT).expect("the first line");
    let _ = fake.next();

    agent_host_stream_end(page(&shell.handle()), 2);
    assert_eq!(
        fake.next(),
        Seen::HungUp("/v1/harnesses/runs/start".to_owned())
    );
}

#[test]
fn agent_host_commands_hang_up_on_the_streams_of_a_page_that_reloads() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let (opened, lines) = open_stream(&shell.handle(), "POST /v1/harnesses/runs/start", 3);
    assert!(opened.is_ok());
    lines.recv_timeout(WAIT).expect("the first line");
    let _ = fake.next();

    // What the shell does when the page starts loading, or its window closes.
    end_page_streams(shell.app.handle(), "main");
    assert_eq!(
        fake.next(),
        Seen::HungUp("/v1/harnesses/runs/start".to_owned())
    );
}

#[test]
fn agent_host_commands_hang_up_on_a_stream_the_page_ended_before_the_host_answered() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let opening = {
        let app = shell.handle();
        std::thread::spawn(move || as_json(&open_stream(&app, "POST /v1/bridge/open", 5).0))
    };
    // The host has the request, and holds its answer.
    let _ = fake.next();
    agent_host_stream_end(page(&shell.handle()), 5);
    fake.release_bridge.send(()).expect("the fake waits");

    let opened = opening.join().expect("the call ends");
    assert!(opened.contains("stream_ended"), "{opened}");
    assert_eq!(fake.next(), Seen::HungUp("/v1/bridge/open".to_owned()));
}

#[test]
fn agent_host_commands_take_the_end_of_a_stream_that_isnt_open() {
    // An id that has already ended, or never opened, is fine.
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    agent_host_stream_end(page(&shell.handle()), 99);
    let state = shell.app.state::<AgentHostState>();
    assert!(state.streams.lock().expect("the streams").is_empty());
}
