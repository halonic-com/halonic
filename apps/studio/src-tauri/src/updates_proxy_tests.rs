//! The updater's client on Halonic's proxy rules (HAL-12966), against a
//! server and a proxy on loopback that the test serves itself.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, channel};
use std::thread;
use std::time::Duration;

use halonic_http_guard::ProxySetting;
use reqwest::ClientBuilder;
use tauri::test::{MockRuntime, mock_builder};
use url::Url;

use super::{on_proxy_rules, updater_on_proxy_rules, usable};
use crate::http_fetch::HttpFetchState;

/// A loopback server that answers each connection with the next canned
/// reply, and tells the test the head of the request it read.
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
                let mut head = Vec::new();
                let mut buffer = [0u8; 1024];
                while !head.ends_with(b"\r\n\r\n") {
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    if read == 0 {
                        break;
                    }
                    head.extend_from_slice(&buffer[..read]);
                }
                let _ = sender.send(String::from_utf8_lossy(&head).into_owned());
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        Self { port, requests }
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }

    fn address(&self) -> SocketAddr {
        SocketAddr::from((Ipv4Addr::LOCALHOST, self.port))
    }

    fn request(&self) -> String {
        self.requests
            .recv_timeout(Duration::from_secs(20))
            .expect("the server read a request")
    }

    fn was_asked(&self) -> bool {
        self.requests.try_recv().is_ok()
    }
}

/// `HTTPS_PROXY` set to `value`, and nothing else.
fn proxy_setting(value: &str) -> Arc<ProxySetting> {
    Arc::new(ProxySetting::from_env(|name| {
        (name == "HTTPS_PROXY").then(|| value.to_owned())
    }))
}

/// `HTTPS_PROXY` set to `proxy` and `NO_PROXY` to `no_proxy`.
fn proxy_setting_with_no_proxy(proxy: &str, no_proxy: &str) -> Arc<ProxySetting> {
    Arc::new(ProxySetting::from_env(|name| match name {
        "HTTPS_PROXY" => Some(proxy.to_owned()),
        "NO_PROXY" => Some(no_proxy.to_owned()),
        _ => None,
    }))
}

/// A GET with the updater's client on `setting`.
fn get(setting: &Arc<ProxySetting>, url: &str) -> Result<String, reqwest::Error> {
    get_with(ClientBuilder::new(), setting, url)
}

/// A GET with the updater's client on `setting`, built on `client`. The
/// updater installs ring as the crypto provider before it builds a client;
/// so does the test.
fn get_with(
    client: ClientBuilder,
    setting: &Arc<ProxySetting>,
    url: &str,
) -> Result<String, reqwest::Error> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = on_proxy_rules(client, setting).build().expect("a client");
    tauri::async_runtime::block_on(async {
        client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await
    })
}

fn reply(status: &str, headers: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn ok() -> String {
    reply("200 OK", "", "direct")
}

fn no_tunnel() -> String {
    reply("407 Proxy Authentication Required", "", "")
}

fn redirect_to(location: &str) -> String {
    reply("302 Found", &format!("Location: {location}\r\n"), "")
}

/// `url` with the made-up user name `made` and password `up`, put together
/// here so the leak guard doesn't take it for a real login.
fn with_login(url: &str) -> String {
    url.replacen("://", &format!("://made:up{}", '@'), 1)
}

#[test]
fn updates_proxy_test_asks_the_proxy_for_a_tunnel_to_a_public_name() {
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = proxy_setting(&with_login(&proxy.url("")));
    get(&setting, "https://updates.test/latest.json").expect_err("the proxy refused the tunnel");
    let connect = proxy.request();
    assert!(
        connect.starts_with("CONNECT updates.test:443 "),
        "{connect}"
    );
    // `made:up`, encoded for the CONNECT line only.
    assert!(connect.contains("Basic bWFkZTp1cA=="), "{connect}");
}

#[test]
fn updates_proxy_test_with_a_proxy_reaches_this_computer_directly() {
    let server = Server::serve(vec![ok()]);
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = proxy_setting(&proxy.url(""));
    let body = get(&setting, &server.url("/")).expect("an answer");
    assert_eq!(body, "direct");
    assert!(!proxy.was_asked());
}

#[test]
fn updates_proxy_test_reaches_a_host_on_no_proxy_directly() {
    let server = Server::serve(vec![ok()]);
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = proxy_setting_with_no_proxy(&proxy.url(""), "updates.test");
    // `updates.test` is a public name to `route_for`; the client finds it
    // on the loopback server, so only a direct call can reach it.
    let client = ClientBuilder::new().resolve("updates.test", server.address());
    let url = format!("http://updates.test:{}/latest.json", server.port);
    let body = get_with(client, &setting, &url).expect("an answer");
    assert_eq!(body, "direct");
    assert!(server.request().starts_with("GET /latest.json "));
    assert!(!proxy.was_asked());
}

#[test]
fn updates_proxy_test_never_sends_plain_http_to_a_public_name_directly_with_a_proxy_set() {
    let server = Server::serve(vec![ok()]);
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = proxy_setting(&proxy.url(""));
    // Going direct would reach the loopback server; `route_for` refuses
    // the request, so it reaches neither the server nor the proxy.
    let client = ClientBuilder::new().resolve("updates.test", server.address());
    let url = format!("http://updates.test:{}/latest.json", server.port);
    get_with(client, &setting, &url).expect_err("the request is refused");
    assert!(!server.was_asked());
    assert!(!proxy.was_asked());
}

#[test]
fn updates_proxy_test_refuses_a_plain_http_hop_to_a_public_name_with_a_proxy_set() {
    let server = Server::serve(vec![redirect_to("http://updates.test/latest.json")]);
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = proxy_setting(&proxy.url(""));
    let error = get(&setting, &server.url("/")).expect_err("the hop is refused");
    assert!(error.is_redirect(), "{error}");
    assert!(!proxy.was_asked());
}

#[test]
fn updates_proxy_test_follows_a_plain_http_hop_without_a_proxy() {
    let target = Server::serve(vec![ok()]);
    let server = Server::serve(vec![redirect_to(&target.url("/"))]);
    let body = get(&Arc::new(ProxySetting::None), &server.url("/")).expect("an answer");
    assert_eq!(body, "direct");
}

#[test]
fn updates_proxy_test_sends_nothing_with_an_unusable_setting() {
    let unusable = proxy_setting(&with_login("socks5://127.0.0.1:1080"));
    let error = usable(&unusable).expect_err("refused");
    let message = error.to_string();
    assert!(message.contains("Nothing was sent."), "{message}");
    assert!(
        !message.contains("made") && !message.contains(":up"),
        "{message}"
    );
    assert!(usable(&ProxySetting::None).is_ok());
    assert!(usable(&proxy_setting("http://127.0.0.1:3128")).is_ok());
}

/// The app's updater on `setting`, built from the shell's own config.
fn updater_app(setting: ProxySetting) -> tauri::App<MockRuntime> {
    mock_builder()
        .manage(HttpFetchState::with_proxy(setting))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(tauri::generate_context!())
        .expect("the app builds on the mock runtime")
}

#[test]
fn updates_proxy_test_updater_asks_the_proxy_and_keeps_the_callers_settings() {
    let proxy = Server::serve(vec![no_tunnel()]);
    let setting = Arc::unwrap_or_clone(proxy_setting(&with_login(&proxy.url(""))));
    let app = updater_app(setting);
    let configured = Arc::new(AtomicBool::new(false));
    let seen = Arc::clone(&configured);
    let updater = updater_on_proxy_rules(app.handle(), move |client| {
        seen.store(true, Ordering::SeqCst);
        client
    })
    .expect("a usable setting")
    .endpoints(vec![
        Url::parse("https://updates.test/latest.json").expect("a URL"),
    ])
    .expect("an https endpoint")
    .build()
    .expect("an updater");
    tauri::async_runtime::block_on(updater.check()).expect_err("the proxy refused the tunnel");
    let connect = proxy.request();
    assert!(
        connect.starts_with("CONNECT updates.test:443 "),
        "{connect}"
    );
    assert!(connect.contains("Basic bWFkZTp1cA=="), "{connect}");
    assert!(configured.load(Ordering::SeqCst));
}

#[test]
fn updates_proxy_test_updater_with_an_unusable_setting_is_refused() {
    let unusable = Arc::unwrap_or_clone(proxy_setting(&with_login("socks5://127.0.0.1:1080")));
    let app = updater_app(unusable);
    let Err(error) = updater_on_proxy_rules(app.handle(), |client| client) else {
        panic!("an unusable setting gives no updater");
    };
    let message = error.to_string();
    assert!(message.contains("Nothing was sent."), "{message}");
    assert!(
        !message.contains("made") && !message.contains(":up"),
        "{message}"
    );
}
