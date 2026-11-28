//! Requirement `action-commands`: the real reqwest client the `action_*`
//! commands send with follows no redirect (Liam's review of HAL-17525).
//! Two servers on 127.0.0.1: the first answers `302` to the second, which
//! must never be called, with the token's header or without it.

use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

use halonic_action_send::{Outgoing, Transport};
use halonic_http_guard::ProxySetting;
use url::Url;

use super::{PaperclipTransport, action_client, send_with};

/// Answers one request with `response`, and returns the port and what the
/// request said.
fn serve_once(response: String) -> (u16, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a free port");
    let port = listener.local_addr().expect("a bound port").port();
    let served = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("one request");
        let mut request = [0; 4096];
        let read = stream.read(&mut request).unwrap_or(0);
        stream.write_all(response.as_bytes()).expect("answers");
        String::from_utf8_lossy(&request[..read]).into_owned()
    });
    (port, served)
}

#[test]
fn the_action_client_doesnt_follow_a_redirect() {
    // Where the redirect points: it must see no connection at all.
    let elsewhere = TcpListener::bind("127.0.0.1:0").expect("a free port");
    elsewhere.set_nonblocking(true).expect("non-blocking");
    let elsewhere_port = elsewhere.local_addr().expect("a bound port").port();
    let (port, served) = serve_once(format!(
        "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{elsewhere_port}/stolen\r\n\
         Content-Length: 0\r\nConnection: close\r\n\r\n"
    ));
    let client = action_client()
        .no_proxy()
        .build()
        .expect("the client builds");
    let call = Outgoing {
        method: "GET",
        address: Url::parse(&format!("http://127.0.0.1:{port}/repos/acme/app")).expect("a URL"),
        headers: vec![(
            "authorization".to_owned(),
            "Bearer acme-user-token-0001".to_owned(),
        )],
        body: None,
    };
    let answer = tauri::async_runtime::block_on(send_with(&client, call)).expect("an answer");
    assert_eq!(answer.status, 302);
    assert!(answer.body.is_empty());
    let request = served.join().expect("the server ran");
    assert!(request.starts_with("GET /repos/acme/app "), "{request}");
    // The client has returned, so a followed redirect would already have
    // connected to the second server.
    match elsewhere.accept() {
        Err(error) if error.kind() == ErrorKind::WouldBlock => {}
        other => panic!("the redirect was followed: {other:?}"),
    }
}

fn paperclip_call(address: &str) -> Outgoing {
    Outgoing {
        method: "GET",
        address: Url::parse(address).expect("a URL"),
        headers: Vec::new(),
        body: None,
    }
}

fn paperclip_transport() -> PaperclipTransport {
    PaperclipTransport {
        proxy: Arc::new(ProxySetting::None),
    }
}

#[test]
fn a_paperclip_on_this_computer_is_reached_over_http() {
    // Julian's review of #6946: `admin_origin` takes a loopback `http`
    // origin, so its calls must not fail on `https_only`.
    let (port, served) = serve_once(
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".to_owned(),
    );
    let call = paperclip_call(&format!("http://127.0.0.1:{port}/api/cli-auth/me"));
    let answer =
        tauri::async_runtime::block_on(paperclip_transport().send(call)).expect("an answer");
    assert_eq!(answer.status, 200);
    let request = served.join().expect("the server ran");
    assert!(request.starts_with("GET /api/cli-auth/me "), "{request}");
}

#[test]
fn a_paperclip_elsewhere_still_needs_https() {
    // Refused before any lookup or connection, so no network is needed.
    let call = paperclip_call("http://paperclip.acme.example/api/cli-auth/me");
    let sent = tauri::async_runtime::block_on(paperclip_transport().send(call));
    assert!(sent.is_err(), "{sent:?}");
}
