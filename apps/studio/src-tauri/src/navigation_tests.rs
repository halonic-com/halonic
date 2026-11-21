//! The navigation guard in the shell: how a URL is read into a target, what
//! the guard decides for it, and the confirmed address it decides with.
//! `halonic_connect` has its own tests for the decision on made-up targets;
//! these start from real URLs, the way the webview hands them over.

use std::sync::{Arc, mpsc};
use std::thread;
use std::time::Duration;

use halonic_connect::{Destination, navigation_destination, page_may_stay, parse_address};
use tauri::test::mock_builder;
use tauri::{Manager, Url};

use super::{
    CHANGE_ADDRESS_PAGE, ConfirmedAddress, back_to_connect, off_the_calling_thread, target,
};
use crate::shell;

/// The origin the app's pages load from on this platform, without a path.
const APP_ORIGIN: &str = if cfg!(any(windows, target_os = "android")) {
    "http://tauri.localhost"
} else {
    "tauri://localhost"
};

/// The page the window opens and that may stay in it: the connect page on
/// Android, the Studio on desktop. The other isn't bundled.
const APP_PAGE: &str = if cfg!(target_os = "android") {
    "/connect.html"
} else {
    "/studio.html"
};

/// The page the window doesn't open on this platform.
const OTHER_PAGE: &str = if cfg!(target_os = "android") {
    "/studio.html"
} else {
    "/connect.html"
};

fn app_page() -> String {
    format!("{APP_ORIGIN}{APP_PAGE}")
}

fn confirmed(input: &str) -> halonic_connect::Address {
    parse_address(input).expect("a test address")
}

/// What the guard decides for `url` once Connect confirmed `confirmed_input`
/// (or before any Connect, for `None`).
fn decide(url: &str, confirmed_input: Option<&str>) -> Destination {
    let url = Url::parse(url).expect("a test URL");
    let confirmed = confirmed_input.map(confirmed);
    navigation_destination(&target(&url), confirmed.as_ref())
}

fn assert_all(urls: &[&str], confirmed_input: Option<&str>, expected: Destination) {
    for url in urls {
        assert_eq!(decide(url, confirmed_input), expected, "{url}");
    }
}

#[test]
fn target_reads_scheme_host_and_port_from_the_url() {
    let url = Url::parse("https://My-Laptop.local:8443/a?b=c#d").unwrap();
    let read = target(&url);
    assert_eq!(read.scheme, "https");
    assert_eq!(read.host, Some("my-laptop.local"));
    assert_eq!(read.port, Some(8443));
}

#[test]
fn target_fills_in_the_port_a_scheme_uses_when_the_url_names_none() {
    let http = Url::parse("http://192.168.1.20/").unwrap();
    assert_eq!(target(&http).port, Some(80));
    let https = Url::parse("https://halonic.dev/").unwrap();
    assert_eq!(target(&https).port, Some(443));
}

#[test]
fn target_keeps_ipv6_hosts_in_brackets() {
    let url = Url::parse("http://[fd00::20]:4280/").unwrap();
    assert_eq!(target(&url).host, Some("[fd00::20]"));
}

#[test]
fn target_leaves_out_the_host_and_port_a_url_does_not_have() {
    for url in ["data:text/html,hi", "javascript:alert(1)", "about:blank"] {
        let url = Url::parse(url).unwrap();
        let read = target(&url);
        assert_eq!(read.host, None, "{url}");
        assert_eq!(read.port, None, "{url}");
    }
}

#[test]
fn guard_keeps_the_confirmed_address_in_the_window() {
    assert_all(
        &[
            "http://192.168.1.20:4280",
            "http://192.168.1.20:4280/",
            "http://192.168.1.20:4280/settings?tab=about#top",
        ],
        Some("192.168.1.20:4280"),
        Destination::Stay,
    );
}

#[test]
fn guard_compares_hosts_without_regard_to_case_and_fills_in_the_scheme_port() {
    assert_all(
        &[
            "http://MY-LAPTOP.LOCAL:4280/",
            "http://my-laptop.local:4280/",
        ],
        Some("My-Laptop.local:4280"),
        Destination::Stay,
    );
    assert_all(
        &["https://halonic.example/", "https://halonic.example:443/"],
        Some("https://halonic.example"),
        Destination::Stay,
    );
    assert_all(
        &["http://[fd00::20]:4280/"],
        Some("[fd00::20]:4280"),
        Destination::Stay,
    );
}

#[test]
fn guard_keeps_the_apps_own_page_in_the_window_with_or_without_a_confirmed_address() {
    assert_all(&[app_page().as_str()], None, Destination::Stay);
    assert_all(
        &[app_page().as_str()],
        Some("192.168.1.20:4280"),
        Destination::Stay,
    );
}

/// The window opens the page `tauri.conf.json` (`tauri.android.conf.json` on
/// Android) names, so that page has to be one the guard keeps. If the
/// configuration moves, the window must not be cut off from its own page.
#[test]
fn guard_keeps_the_page_the_window_opens() {
    let app = shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    let window = app.config().app.windows.first().expect("a window").clone();
    let tauri::utils::config::WebviewUrl::App(path) = &window.url else {
        panic!("the window opens a page of the app: {:?}", window.url);
    };
    let url = format!("{APP_ORIGIN}/{}", path.display());
    assert_eq!(url, app_page());
    assert_all(&[url.as_str()], None, Destination::Stay);
}

#[test]
fn guard_keeps_the_connect_page_with_the_change_address_fragment_on_android_only() {
    // Not bundled on desktop, and the Studio reads no fragment.
    for fragment in ["change-address", "page-not-shown"] {
        let page = format!("{APP_ORIGIN}/connect.html#{fragment}");
        assert_eq!(
            decide(&page, None) == Destination::Stay,
            cfg!(target_os = "android"),
            "{fragment}"
        );
    }
}

/// Every other page of the app origin has the window's capabilities too, so
/// none of them may stay, and neither may the app's page with a query or a
/// fragment it doesn't read.
/// What the guard does instead depends on the platform's scheme.
#[test]
fn guard_keeps_no_other_page_of_the_app_origin_in_the_window() {
    // The URL parser resolves dot segments, so these name the other page.
    let dotted = [
        format!("{APP_PAGE}/..{OTHER_PAGE}"),
        format!("/%2e%2e{OTHER_PAGE}"),
    ];
    let paths = [
        OTHER_PAGE,
        "/studio.html#change-address",
        "/studio.html#page-not-shown",
        "/studio.html#",
        "/studio.html#other",
        "/studio.html?x=1",
        "/studio.html/",
        "/",
        "/index.html",
        "/connect.html/",
        "/connect.html/..%2fstudio.html",
        "/connect%2Ehtml",
        "/connect.html?x=1",
        "/connect.html?",
        "/connect.html?x=1#change-address",
        "/connect.html#Page-Not-Shown",
        "/connect.html#other",
        "/connect.html#",
        "/studio.html/..%2fconnect.html",
    ];
    let paths = paths
        .iter()
        .copied()
        .chain(dotted.iter().map(String::as_str));
    for path in paths {
        let url = format!("{APP_ORIGIN}{path}");
        assert_ne!(decide(&url, None), Destination::Stay, "{url}");
        let confirmed = Some("192.168.1.20:4280");
        assert_ne!(decide(&url, confirmed), Destination::Stay, "{url}");
        let page = Url::parse(&url).unwrap();
        assert!(!page_may_stay(&target(&page), None), "{url}");
    }
}

#[test]
fn guard_keeps_the_apps_own_page_only_on_its_own_port() {
    for port in [8080, 9999, 0] {
        let url = format!("{APP_ORIGIN}:{port}{APP_PAGE}");
        assert_ne!(decide(&url, None), Destination::Stay, "{url}");
    }
}

#[test]
fn guard_sends_the_connect_link_back_to_the_connect_screen() {
    assert_all(
        &["halonic-app://connect", "halonic-app://connect/?from=about"],
        Some("192.168.1.20:4280"),
        Destination::BackToConnect,
    );
    assert_all(&["halonic-app://connect"], None, Destination::BackToConnect);
}

#[test]
fn guard_cancels_other_halonic_app_links() {
    assert_all(
        &["halonic-app://other", "halonic-app://connect.evil.com/"],
        Some("192.168.1.20:4280"),
        Destination::Nowhere,
    );
}

#[test]
fn guard_opens_outside_links_in_the_browser() {
    assert_all(
        &[
            "https://halonic.dev/",
            "http://example.com/page",
            "https://example.com:8443/",
        ],
        Some("192.168.1.20:4280"),
        Destination::Browser,
    );
}

#[test]
fn guard_opens_every_web_page_in_the_browser_before_a_connect() {
    assert_all(
        &["http://192.168.1.20:4280/", "https://halonic.dev/"],
        None,
        Destination::Browser,
    );
}

#[test]
fn guard_does_not_keep_another_port_on_the_confirmed_host() {
    assert_all(
        &[
            "http://192.168.1.20:4281/",
            "http://192.168.1.20/",
            "http://192.168.1.20:80/",
        ],
        Some("192.168.1.20:4280"),
        Destination::Browser,
    );
}

#[test]
fn guard_does_not_keep_the_other_scheme_on_the_confirmed_host() {
    assert_all(
        &["https://192.168.1.20:4280/"],
        Some("192.168.1.20:4280"),
        Destination::Browser,
    );
    assert_all(
        &["http://halonic.example:443/", "http://halonic.example/"],
        Some("https://halonic.example"),
        Destination::Browser,
    );
}

#[test]
fn guard_reads_the_host_of_a_url_with_user_info_not_the_user_name() {
    // The text before the `@` is a user name, so it can't pass for the host.
    assert_all(
        &[
            "http://192.168.1.20:4280@example.com/",
            "http://192.168.1.20@example.com:4280/",
            "http://user:pass@example.com:4280/",
        ],
        Some("192.168.1.20:4280"),
        Destination::Browser,
    );
    // The host after the `@` is the confirmed one, so the page really comes
    // from the confirmed address.
    assert_all(
        &["http://example.com@192.168.1.20:4280/"],
        Some("192.168.1.20:4280"),
        Destination::Stay,
    );
}

#[test]
fn guard_does_not_keep_names_that_only_look_like_the_confirmed_one() {
    assert_all(
        &[
            "http://my-laptop.local.example.com:4280/",
            "http://evil-my-laptop.local:4280/",
            "http://xmy-laptop.local:4280/",
            "http://my-laptop.locale:4280/",
            "http://my-laptop:4280/",
            "http://local:4280/",
        ],
        Some("my-laptop.local:4280"),
        Destination::Browser,
    );
}

#[test]
fn guard_does_not_keep_a_host_with_a_trailing_dot() {
    assert_all(
        &["http://my-laptop.local.:4280/"],
        Some("my-laptop.local:4280"),
        Destination::Browser,
    );
}

#[test]
fn guard_does_not_treat_localhost_127_0_0_1_and_ipv6_loopback_as_one_address() {
    assert_all(
        &["http://localhost:4280/", "http://[::1]:4280/"],
        Some("127.0.0.1:4280"),
        Destination::Browser,
    );
    assert_all(
        &["http://localhost:4280/", "http://127.0.0.1:4280/"],
        Some("[::1]:4280"),
        Destination::Browser,
    );
    assert_all(
        &["http://127.0.0.1:4280/", "http://[::1]:4280/"],
        Some("localhost:4280"),
        Destination::Browser,
    );
    assert_all(
        &["http://127.0.0.1:4280/"],
        Some("127.0.0.1:4280"),
        Destination::Stay,
    );
}

#[test]
fn guard_cancels_what_is_not_a_web_page() {
    assert_all(
        &[
            "data:text/html,<h1>hi</h1>",
            "javascript:alert(1)",
            "file:///etc/hosts",
            "file://192.168.1.20/share",
            "intent://scan#Intent;scheme=zxing;end",
            "blob:http://192.168.1.20:4280/0b4c9f4e",
            "about:blank",
            "ftp://192.168.1.20:4280/",
            "ws://192.168.1.20:4280/",
            "tauri://example.com/",
        ],
        Some("192.168.1.20:4280"),
        Destination::Nowhere,
    );
}

#[test]
fn guard_checks_a_loaded_page_with_the_same_rule() {
    let laptop = confirmed("192.168.1.20:4280");
    let may_stay = |url: &str| {
        let url = Url::parse(url).unwrap();
        page_may_stay(&target(&url), Some(&laptop))
    };
    assert!(may_stay("http://192.168.1.20:4280/"));
    assert!(may_stay(&app_page()));
    assert!(!may_stay("http://192.168.1.20:4281/"));
    assert!(!may_stay("https://halonic.dev/"));
    assert!(!may_stay("data:text/html,hi"));
    assert!(!may_stay("halonic-app://connect"));
}

#[test]
fn change_address_page_is_the_apps_own_page_and_on_android_says_the_page_is_not_shown() {
    let page = Url::parse(CHANGE_ADDRESS_PAGE).expect("a valid page address");
    assert_eq!(
        page.as_str().contains("#page-not-shown"),
        cfg!(target_os = "android")
    );
    assert_eq!(page.as_str().split('#').next(), Some(app_page().as_str()));
    // The load that `back_to_connect` starts must pass the guard itself.
    assert_eq!(
        navigation_destination(&target(&page), None),
        Destination::Stay
    );
}

#[test]
fn confirmed_address_starts_empty_and_remembers_the_last_one_set() {
    let state = ConfirmedAddress::default();
    assert_eq!(state.get(), None);
    state.set(Some(confirmed("192.168.1.20:4280")));
    assert_eq!(state.get(), Some(confirmed("192.168.1.20:4280")));
    state.set(Some(confirmed("my-laptop.local:4280")));
    assert_eq!(state.get(), Some(confirmed("my-laptop.local:4280")));
}

#[test]
fn confirmed_address_forgets_the_address_when_set_to_none() {
    let state = ConfirmedAddress::default();
    state.set(Some(confirmed("192.168.1.20:4280")));
    state.set(None);
    assert_eq!(state.get(), None);
}

#[test]
fn confirmed_address_still_answers_after_a_thread_panicked_holding_it() {
    let state = Arc::new(ConfirmedAddress::default());
    state.set(Some(confirmed("192.168.1.20:4280")));
    let holder = Arc::clone(&state);
    let panicked = thread::spawn(move || {
        let _held = holder.0.lock().unwrap();
        panic!("a thread dies while it holds the address");
    })
    .join();
    assert!(panicked.is_err());
    assert_eq!(state.get(), Some(confirmed("192.168.1.20:4280")));
    state.set(None);
    assert_eq!(state.get(), None);
}

#[test]
fn back_to_connect_forgets_the_confirmed_address() {
    let app = shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    let window = crate::window::open(&app).expect("the main window opens");
    let webview: &tauri::Webview<_> = window.as_ref();
    let state = app.state::<ConfirmedAddress>();
    state.set(Some(confirmed("192.168.1.20:4280")));

    back_to_connect(webview);

    assert_eq!(state.get(), None);
}

/// The opener on Android: it asks the thread the guard runs on, and waits
/// for that thread's answer. Run on the calling thread, `work` would wait
/// for itself and time out here (HAL-1375 phone checks 6, 16 and 23).
#[test]
fn work_handed_off_the_calling_thread_may_wait_for_the_calling_thread() {
    let (answer, answers) = mpsc::channel::<()>();
    let (report, reports) = mpsc::channel::<bool>();

    off_the_calling_thread(move || {
        let answered = answers.recv_timeout(Duration::from_secs(5)).is_ok();
        report.send(answered).expect("the test still listens");
    });
    // The calling thread answers only once it has its control back.
    answer.send(()).expect("the work still listens");

    let answered = reports.recv().expect("the work reports");
    assert!(
        answered,
        "the work could not get the calling thread's answer"
    );
}
