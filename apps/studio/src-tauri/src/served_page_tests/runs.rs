//! The served page and the run commands: the connect page may append to and
//! read runs on desktop, and no remote page may.

use serde_json::{Value, json};

#[cfg(desktop)]
use super::{CONNECT_PAGE, app_window, invoke};

#[cfg(desktop)]
#[test]
fn served_page_test_sees_the_connect_page_allowed_the_run_commands_on_desktop() {
    // Each call gets through to its command, which refuses the workspace
    // before it reads or writes anything: no folder is opened yet.
    let window = app_window();
    let folder = json!({"workspace": ".", "deployment": null});
    let run = json!({"workspace": ".", "deployment": null, "runId": "r1"});
    let append = json!({
        "workspace": ".",
        "deployment": null,
        "runId": "r1",
        "expectedSeq": 0,
        "lines": "{}\n",
        "snapshot": null,
    });
    for (command, body) in [
        ("run_append", append),
        ("run_events", run.clone()),
        ("run_snapshot", run),
        ("run_logs", folder),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("no folder is opened yet");
        assert_eq!(refusal["kind"], "folder_not_open", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_runs_granted_to_the_local_main_window_only() {
    // A remote page must never reach the runs: the served Studio could
    // then read every run of every opened workspace.
    let text = include_str!("../../capabilities/desktop-runs.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-run-append",
            "allow-run-events",
            "allow-run-snapshot",
            "allow-run-logs"
        ])
    );
}
