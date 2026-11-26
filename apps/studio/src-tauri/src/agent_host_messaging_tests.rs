//! Requirement `agent-host-messaging`: which host the shell calls, against
//! two stand-in hosts. Each is a small script that prints the handshake of a
//! fake host the test serves on loopback, which records the paths it is
//! asked for.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, channel};
use std::time::Duration;

use serde_json::json;
use tauri::test::{MockRuntime, mock_app};
use tauri::webview::WebviewWindowBuilder;
use tauri::{Manager, Webview, WebviewUrl};

use super::super::{AgentHostState, agent_host_request};
use super::{MESSAGING_PREFIXES, is_messaging_path, running_messaging_host};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";

/// Long enough for a script or a thread to start on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

static NEXT_SCRIPT: AtomicU32 = AtomicU32::new(0);

/// A fake host on loopback that answers every request `200 {}` and records
/// its path.
struct FakeHost {
    port: u16,
    paths: Receiver<String>,
}

impl FakeHost {
    fn serve() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (sender, paths) = channel();
        std::thread::spawn(move || {
            for connection in listener.incoming().flatten() {
                let mut reader = BufReader::new(connection.try_clone().expect("a second handle"));
                let mut request_line = String::new();
                let _ = reader.read_line(&mut request_line);
                let mut length = 0;
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length: ")
                    {
                        length = value.trim().parse().unwrap_or(0);
                    }
                }
                let _ = reader.read_exact(&mut vec![0; length]);
                let path = request_line.split_whitespace().nth(1).unwrap_or_default();
                let _ = sender.send(path.to_owned());
                let mut connection = connection;
                let _ = write!(
                    connection,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
                );
            }
        });
        Self { port, paths }
    }

    /// The path of the next request it got.
    fn next(&self) -> String {
        self.paths
            .recv_timeout(WAIT)
            .expect("the fake host is asked")
    }

    /// A command that starts a stand-in host for this fake, counting starts.
    fn stand_in(&self, starts: &Arc<AtomicUsize>) -> impl Fn() -> Command + Send + Sync + 'static {
        let line = format!(
            r#"{{"url":"http://127.0.0.1:{}","token":"{TOKEN}"}}"#,
            self.port
        );
        let starts = Arc::clone(starts);
        move || {
            starts.fetch_add(1, Ordering::SeqCst);
            let number = NEXT_SCRIPT.fetch_add(1, Ordering::Relaxed);
            let name = format!(
                "halonic-agent-host-messaging-{}-{number}",
                std::process::id()
            );
            write_script(std::env::temp_dir().join(name), &line)
        }
    }
}

/// A script that prints `line` and waits until its input closes, as the host
/// does. Run through `sh`: executing a file just written can fail with "text
/// file busy" while another test thread starts a process.
#[cfg(unix)]
fn write_script(base: PathBuf, line: &str) -> Command {
    let path = base.with_extension("sh");
    std::fs::write(&path, format!("printf '%s\\n' '{line}'\ncat > /dev/null\n"))
        .expect("write the script");
    let mut command = Command::new("/bin/sh");
    command.arg(path);
    command
}

#[cfg(windows)]
fn write_script(base: PathBuf, line: &str) -> Command {
    let path = base.with_extension("cmd");
    std::fs::write(
        &path,
        format!("@echo off\r\necho {line}\r\nfindstr \"^\" >nul\r\n"),
    )
    .expect("write the script");
    Command::new(path)
}

fn counter() -> Arc<AtomicUsize> {
    Arc::new(AtomicUsize::new(0))
}

fn request(app: &tauri::AppHandle<MockRuntime>, route: &str) {
    let body = route.starts_with("POST").then(|| json!({}));
    tauri::async_runtime::block_on(agent_host_request(page(app), route.to_owned(), body))
        .expect("the host answers");
}

/// Studio's window, opened on the first call.
fn page(app: &tauri::AppHandle<MockRuntime>) -> Webview<MockRuntime> {
    let window = app.get_webview_window("main").unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
            .build()
            .expect("the main window opens")
    });
    window.as_ref().clone()
}

#[test]
fn agent_host_messaging_names_its_prefixes_in_one_place() {
    assert_eq!(MESSAGING_PREFIXES, ["/v1/messaging/", "/v1/paperclip/"]);
    assert!(is_messaging_path("/v1/paperclip/connections"));
    assert!(is_messaging_path("/v1/messaging/read"));
    for path in [
        "/v1/health",
        "/v1/harnesses/runs/start",
        "/v1/paperclip",
        "/v1/messagingx/read",
    ] {
        assert!(!is_messaging_path(path), "{path}");
    }
}

#[test]
fn agent_host_messaging_calls_go_to_the_messaging_host_and_the_rest_to_the_harness_host() {
    let (harness, messaging) = (FakeHost::serve(), FakeHost::serve());
    let (harness_starts, messaging_starts) = (counter(), counter());
    let app = mock_app();
    app.manage(AgentHostState::with_messaging_command(
        harness.stand_in(&harness_starts),
        messaging.stand_in(&messaging_starts),
    ));

    request(app.handle(), "POST /v1/paperclip/connections");
    assert_eq!(messaging.next(), "/v1/paperclip/connections");
    request(app.handle(), "POST /v1/messaging/read");
    assert_eq!(messaging.next(), "/v1/messaging/read");
    request(app.handle(), "GET /v1/health");
    assert_eq!(harness.next(), "/v1/health");

    assert_eq!(messaging_starts.load(Ordering::SeqCst), 1);
    assert_eq!(harness_starts.load(Ordering::SeqCst), 1);
}

#[test]
fn agent_host_messaging_a_second_call_reuses_the_one_messaging_host() {
    let (harness, messaging) = (FakeHost::serve(), FakeHost::serve());
    let (harness_starts, messaging_starts) = (counter(), counter());
    let app = mock_app();
    app.manage(AgentHostState::with_messaging_command(
        harness.stand_in(&harness_starts),
        messaging.stand_in(&messaging_starts),
    ));

    let first = tauri::async_runtime::block_on(running_messaging_host(app.handle()))
        .expect("it starts")
        .expect("one is wanted");
    let second = tauri::async_runtime::block_on(running_messaging_host(app.handle()))
        .expect("it runs")
        .expect("one is wanted");

    assert_eq!(second.url(), first.url());
    assert_eq!(messaging_starts.load(Ordering::SeqCst), 1);
    assert_eq!(harness_starts.load(Ordering::SeqCst), 0);
}

#[test]
fn agent_host_messaging_where_none_is_wanted_the_one_host_serves_the_messaging() {
    let harness = FakeHost::serve();
    let starts = counter();
    let app = mock_app();
    app.manage(AgentHostState::with_command(harness.stand_in(&starts)));

    let messaging = tauri::async_runtime::block_on(running_messaging_host(app.handle()))
        .expect("nothing to start");
    assert!(messaging.is_none());
    request(app.handle(), "POST /v1/paperclip/connections");
    assert_eq!(harness.next(), "/v1/paperclip/connections");
    assert_eq!(starts.load(Ordering::SeqCst), 1);
}
