//! Requirement `risky-answer-confirm`: through `agent_host_request`, an
//! answer that approves a risky item reaches the host again only after the
//! person's yes in the shell's own dialog, built from the host's copy; the
//! page can't send the confirmed answer itself. Against the stand-in host of
//! `agent_host_tests.rs`, which asks for the yes as either engine's host
//! does: the shell can't tell them apart, and needn't.

use std::sync::mpsc::TryRecvError;
use std::sync::{Arc, Mutex};

use halonic_agent_host::{Answer, find_route};
use serde_json::{Value, json};

use super::super::risky_answer::send_answer;
use super::{AfterHandshake, FakeHost, HostAnswer, HostRefusal, Seen, Shell, as_json, request};

/// The page's approve of `item`.
fn approve(item: &str) -> Value {
    json!({
        "workspace": "/work/acme",
        "item": item,
        "answer": { "kind": "option", "option": "approve" },
    })
}

/// Sends the page's `body` as an inbox answer, answering the shell's
/// question `yes`, and gives the answer and the question it asked.
fn answer_with(
    shell: &Shell,
    body: Value,
    yes: bool,
) -> (Result<HostAnswer, HostRefusal>, Option<String>) {
    let route = find_route("POST /v1/messaging/answer", Answer::Json).expect("the page's route");
    let asked = Arc::new(Mutex::new(None));
    let recorded = Arc::clone(&asked);
    let answer = tauri::async_runtime::block_on(send_answer(
        &shell.handle(),
        route,
        Some(body),
        move |question| {
            *recorded.lock().expect("the question") = Some(question);
            yes
        },
    ));
    let question = asked.lock().expect("the question").take();
    (answer, question)
}

fn next_request(fake: &FakeHost) -> (String, Value) {
    match fake.next() {
        Seen::Request { route, body, .. } => (route, serde_json::from_str(&body).expect("JSON")),
        Seen::HungUp(path) => panic!("a request, not a hang-up on {path}"),
    }
}

/// Whether the fake host saw nothing more.
fn saw_nothing_more(fake: &FakeHost) -> bool {
    matches!(fake.seen.try_recv(), Err(TryRecvError::Empty))
}

#[test]
fn a_risky_approve_without_the_persons_yes_sends_nothing_more() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let (answer, question) = answer_with(&shell, approve("risky"), false);

    let refusal = answer.expect_err("declined");
    assert_eq!(refusal.kind, "declined");
    let question = question.expect("the shell asked");
    assert!(
        question.starts_with("Ada asks: Hire an agent\n"),
        "{question}"
    );
    assert!(
        question.contains("- ACME_DEPLOY_TOKEN (gets a secret)"),
        "{question}"
    );
    assert_eq!(
        next_request(&fake),
        ("POST /v1/messaging/answer".to_owned(), approve("risky"))
    );
    assert!(saw_nothing_more(&fake), "no confirmed answer was sent");
}

#[test]
fn a_risky_approve_after_the_persons_yes_goes_with_the_hosts_digest() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let (answer, question) = answer_with(&shell, approve("risky"), true);

    let answer = answer.expect("sent");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.body["result"]["outcome"], "answered");
    assert!(question.is_some(), "the shell asked");
    let _ = next_request(&fake);
    let mut confirmed = approve("risky");
    confirmed["digest"] = json!("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    assert_eq!(
        next_request(&fake),
        ("POST /v1/messaging/answer-confirmed".to_owned(), confirmed)
    );
}

#[test]
fn any_other_answer_goes_through_without_asking() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);

    let answer = request(
        &shell.handle(),
        "POST /v1/messaging/answer",
        Some(approve("normal")),
    )
    .expect("sent");

    assert_eq!(answer.status, 200);
    assert_eq!(
        next_request(&fake),
        ("POST /v1/messaging/answer".to_owned(), approve("normal"))
    );
    assert!(saw_nothing_more(&fake));
}

#[test]
fn the_page_cant_send_a_confirmed_answer() {
    let fake = FakeHost::serve();
    let shell = Shell::new(&fake, AfterHandshake::WaitForInput);
    let mut body = approve("risky");
    body["digest"] = json!("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

    let refusal = request(
        &shell.handle(),
        "POST /v1/messaging/answer-confirmed",
        Some(body),
    )
    .expect_err("only the shell confirms");

    assert!(as_json(&refusal).contains(r#""kind":"unknown_route""#));
    // Refused before anything reached a host: none was even started.
    assert_eq!(shell.starts(), 0);
}
