//! The `connect` command, the connect page's one call into the shell
//! (flow-install-update 5.3 and 5.4). The checks and the result live in the
//! `halonic-connect` crate; this file only adds what needs the network: the
//! name lookup off the main thread, and the hello call itself.

use std::time::Instant;

use halonic_connect::{
    AppVersions, CheckedAddress, ConnectError, ConnectResult, HELLO_TIMEOUT, HelloBody, HelloReply,
    Host, SystemResolver, TimedResolver, Version, check_address,
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_http::reqwest;

use crate::navigation::ConfirmedAddress;

/// The oldest Halonic on a computer that this app works with. A computer
/// older than this gets "Halonic on your computer (…) is too old for this
/// app". Raise it when the app starts to need something newer.
const OLDEST_COMPUTER: &str = "0.1.0";

/// Checks the address as typed, makes the hello call and returns what the
/// page shows. The whole press, name lookup and hello call together, ends
/// within [`HELLO_TIMEOUT`]. Only a press that ends connected lets the
/// navigation guard keep that address in the window.
#[tauri::command]
pub async fn connect<R: Runtime>(app: AppHandle<R>, address: String) -> ConnectResult {
    let confirmed = app.state::<ConfirmedAddress>();
    confirmed.set(None);
    let deadline = Instant::now() + HELLO_TIMEOUT;
    let input = address.clone();
    // The lookup blocks, so it runs on a worker thread, never the UI's.
    // If the worker thread itself fails, the page shows "Can't reach".
    let checked = tauri::async_runtime::spawn_blocking(move || {
        check_address(&input, &TimedResolver::new(SystemResolver, HELLO_TIMEOUT))
    })
    .await
    .unwrap_or(Err(ConnectError::NotAnswering));
    let checked = match checked {
        Ok(checked) => checked,
        Err(error) => return ConnectResult::refused(error, &address),
    };
    let reply = call_hello(&checked, deadline).await;
    let result = ConnectResult::after_hello(&checked, &reply, &app_versions(&app));
    if matches!(result, ConnectResult::Connected { .. }) {
        confirmed.set(Some(checked.address));
    }
    result
}

/// `GET /api/hello` on exactly the checked IP addresses: no proxy, no
/// redirects, and no second name lookup that could land somewhere else.
async fn call_hello(checked: &CheckedAddress, deadline: Instant) -> HelloReply {
    let mut client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(deadline.saturating_duration_since(Instant::now()));
    if let Host::Name(name) = &checked.address.host {
        client = client.resolve_to_addrs(name, &checked.socket_addrs);
    }
    let Ok(client) = client.build() else {
        return HelloReply::NoAnswer;
    };
    let Ok(mut response) = client.get(checked.hello_url()).send().await else {
        return HelloReply::NoAnswer;
    };
    let status = response.status().as_u16();
    let mut body = HelloBody::default();
    // A body cut short by the time limit or a dropped connection is read as
    // far as it came, and then isn't Halonic.
    while let Ok(Some(chunk)) = response.chunk().await {
        if !body.push(&chunk) {
            break;
        }
    }
    HelloReply::Answer { status, body }
}

/// This app's version, from the shell's package, and [`OLDEST_COMPUTER`].
fn app_versions<R: Runtime>(app: &AppHandle<R>) -> AppVersions {
    let version = |text: &str| Version::parse(text).expect("the shell's versions are valid");
    AppVersions {
        app: version(&app.package_info().version.to_string()),
        oldest_computer: version(OLDEST_COMPUTER),
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::thread;

    use halonic_connect::parse_address;

    use super::*;

    /// Answers one request on 127.0.0.1 with `response`, and returns the port.
    fn serve_once(response: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a free port");
        let port = listener.local_addr().expect("a bound port").port();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("one request");
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(response.as_bytes());
        });
        port
    }

    /// `input` checked as if its name resolved to 127.0.0.1 on `port`.
    fn checked(input: &str, port: u16) -> CheckedAddress {
        CheckedAddress {
            address: parse_address(input).expect("a test address"),
            socket_addrs: vec![SocketAddr::from(([127, 0, 0, 1], port))],
        }
    }

    fn call(checked: &CheckedAddress) -> HelloReply {
        tauri::async_runtime::block_on(call_hello(checked, Instant::now() + HELLO_TIMEOUT))
    }

    #[test]
    fn shell_versions_parse() {
        // `app_versions` expects both versions to parse. This test fails on
        // a bad package version, so Connect never panics on one.
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        let versions = app_versions(app.handle());
        assert!(
            versions.oldest_computer <= versions.app,
            "OLDEST_COMPUTER is newer than the app: {versions:?}"
        );
    }

    #[test]
    fn hello_call_reaches_only_the_checked_addresses() {
        let port =
            serve_once("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        // `.invalid` never resolves, so an answer proves the call used the
        // checked address and didn't look the name up again.
        let reply = call(&checked(&format!("halonic-test.invalid:{port}"), port));
        assert!(
            matches!(reply, HelloReply::Answer { status: 200, .. }),
            "{reply:?}"
        );
    }

    #[test]
    fn hello_call_does_not_follow_redirects() {
        let port = serve_once(
            "HTTP/1.1 302 Found\r\nLocation: http://8.8.8.8/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        let reply = call(&checked(&format!("127.0.0.1:{port}"), port));
        assert!(
            matches!(reply, HelloReply::Answer { status: 302, .. }),
            "{reply:?}"
        );
    }

    #[test]
    fn hello_call_reports_no_answer_when_nothing_listens() {
        let port = TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .expect("a free port")
            .port();
        let reply = call(&checked(&format!("127.0.0.1:{port}"), port));
        assert!(matches!(reply, HelloReply::NoAnswer), "{reply:?}");
    }
}
