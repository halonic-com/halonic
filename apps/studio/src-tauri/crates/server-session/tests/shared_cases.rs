//! The shared cases in `packages/core/action-steppers`: the same hosts,
//! users, ports, task ids and golden launcher the TypeScript tests run, so
//! the shell's check and the page's can't drift apart.

use halonic_server_session::{
    BriefRefusal, MAX_BRIEF_BYTES, check_brief, is_task_id, render_launcher, validate_target,
};
use serde_json::{Value, json};

fn cases() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../../packages/core/action-steppers/src/golden/server-session-cases.json"
    ))
    .expect("the shared cases are JSON")
}

fn list<'a>(cases: &'a Value, group: &str, kind: &str) -> &'a Vec<Value> {
    cases[group][kind].as_array().expect("a list of cases")
}

#[test]
fn launch_takes_and_refuses_the_shared_hosts() {
    let cases = cases();
    let user = json!("ops");
    for host in list(&cases, "hosts", "valid") {
        assert!(
            validate_target(Some(host), Some(&user), None).is_ok(),
            "{host}"
        );
    }
    for host in list(&cases, "hosts", "refused") {
        assert!(
            validate_target(Some(host), Some(&user), None).is_err(),
            "{host}"
        );
    }
}

#[test]
fn launch_takes_and_refuses_the_shared_users() {
    let cases = cases();
    let host = json!("build.acme.example");
    for user in list(&cases, "users", "valid") {
        assert!(
            validate_target(Some(&host), Some(user), None).is_ok(),
            "{user}"
        );
    }
    for user in list(&cases, "users", "refused") {
        assert!(
            validate_target(Some(&host), Some(user), None).is_err(),
            "{user}"
        );
    }
}

#[test]
fn launch_takes_and_refuses_the_shared_ports() {
    let cases = cases();
    let (host, user) = (json!("build.acme.example"), json!("ops"));
    for port in list(&cases, "ports", "valid") {
        assert!(
            validate_target(Some(&host), Some(&user), Some(port)).is_ok(),
            "{port}"
        );
    }
    for port in list(&cases, "ports", "refused") {
        assert!(
            validate_target(Some(&host), Some(&user), Some(port)).is_err(),
            "{port}"
        );
    }
}

#[test]
fn launch_refuses_a_host_or_user_that_is_missing_or_not_text() {
    let (host, user) = (json!("build.acme.example"), json!("ops"));
    assert!(validate_target(None, Some(&user), None).is_err());
    assert!(validate_target(Some(&host), None, None).is_err());
    assert!(validate_target(Some(&json!(7)), Some(&user), None).is_err());
    assert!(validate_target(Some(&host), Some(&json!(["ops"])), None).is_err());
}

#[test]
fn launch_takes_and_refuses_the_shared_task_ids() {
    let cases = cases();
    for task in list(&cases, "tasks", "valid") {
        assert!(is_task_id(task.as_str().expect("text")), "{task}");
    }
    for task in list(&cases, "tasks", "refused") {
        assert!(!is_task_id(task.as_str().expect("text")), "{task}");
    }
}

#[test]
fn launch_renders_the_shared_golden_launcher() {
    let cases = cases();
    let launcher = &cases["launcher"];
    let target = validate_target(
        Some(&launcher["target"]["host"]),
        Some(&launcher["target"]["user"]),
        launcher["target"].get("port"),
    )
    .expect("the golden target is valid");
    let lines: Vec<&str> = launcher["script"]
        .as_array()
        .expect("the script's lines")
        .iter()
        .map(|line| line.as_str().expect("a line"))
        .collect();
    let task = launcher["task"].as_str().expect("the task");
    assert_eq!(render_launcher(&target, task), lines.join("\n"));
}

const BRIEF: &str = "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\n\
This brief was written by Chief, not checked by Halonic.\nSteps:\n1. Restart the worker\n";

#[test]
fn launch_takes_a_brief_that_names_its_task() {
    assert_eq!(check_brief("HAL-1234", BRIEF), Ok(()));
    assert_eq!(
        check_brief("HAL-1234", &BRIEF.replace("worker", "worker\tnow")),
        Ok(())
    );
}

#[test]
fn launch_refuses_a_brief_for_another_task_or_with_another_first_line() {
    for brief in [
        BRIEF.replace("HAL-1234\n", "HAL-12345\n"),
        BRIEF.replace("Task: ", "-oProxyCommand=sh "),
        BRIEF.replace("Task: https://", "Task: a b https://"),
        BRIEF.replace("Task: https://paperclip.acme.example", "Task: "),
        String::new(),
    ] {
        assert_eq!(
            check_brief("HAL-1234", &brief),
            Err(BriefRefusal::NotForTask),
            "{brief}"
        );
    }
}

#[test]
fn launch_refuses_a_brief_with_a_control_character_or_over_8_kb() {
    for control in ["\r", "\u{1b}[2J", "\u{0}", "\u{7f}", "\u{85}"] {
        let brief = BRIEF.replace("worker", &format!("worker{control}"));
        assert_eq!(
            check_brief("HAL-1234", &brief),
            Err(BriefRefusal::ControlCharacter)
        );
    }
    let long = format!("{BRIEF}{}", "x".repeat(MAX_BRIEF_BYTES));
    assert_eq!(check_brief("HAL-1234", &long), Err(BriefRefusal::TooLarge));
}
