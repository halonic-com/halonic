//! Requirement `http-fetch-command`: the command's run against a server on
//! loopback that the test serves itself. Plain `http` to this computer is
//! allowed, so the whole path runs without a network.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Receiver, channel};
use std::thread;
use std::time::Duration;

use halonic_http_guard::{PageRequest, ProxySetting, check_request};

use super::{CallKey, HttpFetchState, next_hop, run};

/// A loopback server that answers each connection with the next canned
/// reply, and tells the test the request it read.
struct Server {
    port: u16,
    requests: Receiver<String>,
}

impl Server {
    fn serve(replies: Vec<String>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("its address").port();
        let (sender, requests) = channel();
        thread::spawn(move || {
            for reply in replies {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let _ = sender.send(read_request(&mut stream));
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        Self { port, requests }
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }

    fn request(&self) -> String {
        self.requests
            .recv_timeout(Duration::from_secs(20))
            .expect("the server read a request")
    }
}

/// Reads one request's head, and its body when the head has a length.
fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 1024];
    loop {
        let read = stream.read(&mut buffer).unwrap_or(0);
        bytes.extend_from_slice(&buffer[..read]);
        let text = String::from_utf8_lossy(&bytes).into_owned();
        if let Some((head, body)) = text.split_once("\r\n\r\n") {
            let length = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")?
                        .parse()
                        .ok()
                })
                .unwrap_or(0usize);
            if body.len() >= length || read == 0 {
                return text;
            }
        } else if read == 0 {
            return text;
        }
    }
}

fn reply(status: &str, headers: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn page_request(method: &str, url: &str, body: Option<&str>, follow: bool) -> PageRequest {
    PageRequest {
        method: method.to_owned(),
        url: url.to_owned(),
        headers: vec![("X-Test".to_owned(), "one".to_owned())],
        body: body.map(str::to_owned),
        follow_redirects: follow,
    }
}

fn fetch(request: PageRequest) -> Result<super::FetchAnswer, super::FetchRefusal> {
    fetch_with(request, &ProxySetting::None)
}

fn fetch_with(
    request: PageRequest,
    proxy: &ProxySetting,
) -> Result<super::FetchAnswer, super::FetchRefusal> {
    let checked = check_request(request).expect("the guard accepts it");
    tauri::async_runtime::block_on(run(checked, proxy))
}

/// `HTTPS_PROXY` set to `value`, and nothing else.
fn proxy_setting(value: &str) -> ProxySetting {
    ProxySetting::from_env(|name| (name == "HTTPS_PROXY").then(|| value.to_owned()))
}

#[test]
fn http_fetch_test_returns_status_headers_and_body() {
    let server = Server::serve(vec![reply("201 Created", "X-Seen: yes\r\n", "héllo")]);
    let answer = fetch(page_request(
        "POST",
        &server.url("/a?k=v"),
        Some("{}"),
        false,
    ))
    .expect("an answer");
    assert_eq!(answer.status, 201);
    assert_eq!(answer.body, "héllo");
    assert!(
        answer
            .headers
            .iter()
            .any(|(n, v)| n == "x-seen" && v == "yes")
    );
    let seen = server.request();
    assert!(seen.starts_with("POST /a?k=v HTTP/1.1"), "{seen}");
    assert!(seen.to_ascii_lowercase().contains("x-test: one"), "{seen}");
    assert!(seen.ends_with("{}"), "{seen}");
}

#[test]
fn http_fetch_test_reaches_a_name_that_resolves_to_this_computer() {
    let server = Server::serve(vec![reply("200 OK", "", "ok")]);
    let url = server.url("/").replace("127.0.0.1", "localhost");
    let answer = fetch(page_request("GET", &url, None, false)).expect("an answer");
    assert_eq!(answer.body, "ok");
}

#[test]
fn http_fetch_test_returns_a_redirect_when_it_may_not_follow() {
    let server = Server::serve(vec![reply("302 Found", "Location: /next\r\n", "")]);
    let answer = fetch(page_request("GET", &server.url("/"), None, false)).expect("an answer");
    assert_eq!(answer.status, 302);
    assert!(
        answer
            .headers
            .iter()
            .any(|(n, v)| n == "location" && v == "/next")
    );
}

#[test]
fn http_fetch_test_follows_a_redirect_by_hand_and_drops_the_body_after_a_303() {
    let server = Server::serve(vec![
        reply("303 See Other", "Location: /next\r\n", ""),
        reply("200 OK", "", "landed"),
    ]);
    let answer =
        fetch(page_request("POST", &server.url("/"), Some("secret"), true)).expect("an answer");
    assert_eq!(answer.body, "landed");
    assert!(answer.url.ends_with("/next"), "{}", answer.url);
    assert!(server.request().starts_with("POST / "));
    let second = server.request();
    assert!(second.starts_with("GET /next "), "{second}");
    assert!(!second.contains("secret"), "{second}");
}

#[test]
fn http_fetch_test_refuses_a_redirect_to_a_refused_address() {
    let server = Server::serve(vec![reply(
        "302 Found",
        "Location: http://169.254.169.254/latest\r\n",
        "",
    )]);
    let refusal = fetch(page_request("GET", &server.url("/"), None, true)).expect_err("refused");
    assert_eq!(refusal.kind, "address_refused", "{}", refusal.message);
    assert!(!refusal.message.contains("169.254"), "{}", refusal.message);
}

#[test]
fn http_fetch_test_stops_after_too_many_redirects() {
    let again = reply("302 Found", "Location: /again\r\n", "");
    let server = Server::serve(vec![again; 8]);
    let refusal = fetch(page_request("GET", &server.url("/"), None, true)).expect_err("stopped");
    assert_eq!(refusal.kind, "too_many_redirects");
}

#[test]
fn http_fetch_test_reports_a_connection_that_fails_without_the_address() {
    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        listener.local_addr().expect("its address").port()
    };
    let url = format!("http://127.0.0.1:{port}/path?key=hunter2");
    let refusal = fetch(page_request("GET", &url, None, false)).expect_err("nobody listens");
    assert_eq!(refusal.kind, "network");
    assert!(!refusal.message.contains("hunter2"), "{}", refusal.message);
}

#[test]
fn http_fetch_test_keeps_only_safe_headers_on_a_hop_to_another_origin_and_all_on_the_same() {
    let mut request = page_request("GET", "http://127.0.0.1:1/", None, true);
    for name in [
        "Authorization",
        "X-Api-Key",
        "Api-Key",
        "X-Goog-Api-Key",
        "X-Custom-Token",
    ] {
        request.headers.push((name.to_owned(), "k".to_owned()));
    }
    request
        .headers
        .push(("Accept".to_owned(), "application/json".to_owned()));
    let from = check_request(request).expect("accepted");
    let same = next_hop(&from, "/other", 302).expect("same origin");
    assert_eq!(same.headers.len(), 7);
    let other = next_hop(&from, "http://127.0.0.1:2/", 302).expect("other origin");
    assert_eq!(
        other.headers,
        vec![("Accept".to_owned(), "application/json".to_owned())]
    );
}

#[test]
fn http_fetch_test_changes_a_post_to_a_get_for_301_and_302_but_not_307() {
    let from = check_request(page_request("POST", "http://127.0.0.1:1/", Some("b"), true))
        .expect("accepted");
    assert_eq!(next_hop(&from, "/x", 301).expect("hop").method, "GET");
    assert_eq!(next_hop(&from, "/x", 302).expect("hop").body, None);
    let kept = next_hop(&from, "/x", 307).expect("hop");
    assert_eq!(
        (kept.method.as_str(), kept.body.as_deref()),
        ("POST", Some("b"))
    );
}

#[test]
fn http_fetch_test_abort_ends_only_the_named_call_of_that_page() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    let state = HttpFetchState::with_proxy(ProxySetting::None);
    let aborted = Arc::new(AtomicUsize::new(0));
    let key = |page: &str, call| CallKey {
        page: page.to_owned(),
        call,
    };
    for (page, call) in [("main", 1), ("main", 2), ("other", 1)] {
        let aborted = Arc::clone(&aborted);
        state
            .add(
                key(page, call),
                Box::new(move || {
                    aborted.fetch_add(1, Ordering::SeqCst);
                }),
            )
            .expect("added");
    }
    let again = state.add(key("main", 1), Box::new(|| {}));
    assert_eq!(again.expect_err("in use").kind, "call_in_use");
    state.abort(|k| k.page == "main" && k.call == 1);
    assert_eq!(aborted.load(Ordering::SeqCst), 1);
    state.abort(|k| k.page == "main");
    assert_eq!(aborted.load(Ordering::SeqCst), 2);
    state.forget(&key("other", 1));
    state.abort(|_| true);
    assert_eq!(aborted.load(Ordering::SeqCst), 2);
}

#[test]
fn http_fetch_test_with_a_proxy_reaches_this_computer_directly() {
    let server = Server::serve(vec![reply("200 OK", "", "direct")]);
    let proxy = Server::serve(vec![reply("502 Bad Gateway", "", "")]);
    let setting = proxy_setting(&proxy.url(""));
    let url = server.url("/").replace("127.0.0.1", "localhost");
    let answer = fetch_with(page_request("GET", &url, None, false), &setting).expect("an answer");
    assert_eq!(answer.body, "direct");
}

#[test]
fn http_fetch_test_asks_the_proxy_for_a_tunnel_to_the_name_on_a_redirect_hop() {
    let server = Server::serve(vec![reply(
        "302 Found",
        "Location: https://model.test/v1?key=hunter2\r\n",
        "",
    )]);
    let proxy = Server::serve(vec![reply("407 Proxy Authentication Required", "", "")]);
    let with_login = proxy
        .url("")
        .replace("http://", &format!("http://made:up{}", '@'));
    let setting = proxy_setting(&with_login);
    let refusal = fetch_with(page_request("GET", &server.url("/"), None, true), &setting)
        .expect_err("the proxy refused the tunnel");
    assert_eq!(refusal.kind, "proxy", "{}", refusal.message);
    assert!(!refusal.message.contains("hunter2"), "{}", refusal.message);
    let connect = proxy.request();
    assert!(connect.starts_with("CONNECT model.test:443 "), "{connect}");
    // `made:up`, encoded for the CONNECT line only.
    assert!(connect.contains("Basic bWFkZTp1cA=="), "{connect}");
    assert!(
        !connect.contains("hunter2") && !connect.contains("X-Test"),
        "{connect}"
    );
}

#[test]
fn http_fetch_test_with_a_proxy_refuses_plain_http_to_a_public_name_and_an_unusable_setting() {
    let proxied = proxy_setting("http://127.0.0.1:9");
    let plain = page_request("GET", "http://api.example.com/", None, false);
    let refusal = fetch_with(plain, &proxied).expect_err("refused");
    assert_eq!(refusal.kind, "plain_http_proxied");
    let unusable = proxy_setting("socks5://127.0.0.1:1080");
    let secure = page_request("GET", "https://api.example.com/", None, false);
    let refusal = fetch_with(secure, &unusable).expect_err("refused");
    assert_eq!(refusal.kind, "proxy_refused");
}
