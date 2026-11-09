//! Where a link or redirect in the app window may go (flow-install-update
//! 5.4, HAL-1137). The shell's navigation guard asks this for every
//! navigation and does what it says.

use crate::address::{Address, parse_address};

/// A navigation's target, read from its URL by the shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NavigationTarget<'a> {
    /// The scheme, lowercase, for example `http`.
    pub scheme: &'a str,
    /// The host, if the URL has one. IPv6 addresses are in brackets.
    pub host: Option<&'a str>,
    /// The port, or the scheme's own port when the URL doesn't name one.
    pub port: Option<u16>,
}

/// What the guard does with a navigation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Destination {
    /// Let it load in the app window.
    Stay,
    /// Cancel it and open the connect screen with the address filled in:
    /// the served About page's Change address link, `halonic-app://connect`.
    BackToConnect,
    /// Cancel it and open the link in the phone's browser.
    Browser,
    /// Cancel it: `javascript:`, `file:`, `intent:` and anything else that
    /// isn't a web page.
    Nowhere,
}

/// Decides where a navigation goes. Only the app's own connect page and the
/// address the last Connect confirmed stay in the window; any other web page
/// opens in the browser.
pub fn navigation_destination(
    target: &NavigationTarget,
    confirmed: Option<&Address>,
) -> Destination {
    if target.scheme == "halonic-app" && target.host == Some("connect") {
        return Destination::BackToConnect;
    }
    if is_connect_page(target) {
        return Destination::Stay;
    }
    if target.scheme != "http" && target.scheme != "https" {
        return Destination::Nowhere;
    }
    let (Some(host), Some(port)) = (target.host, target.port) else {
        return Destination::Nowhere;
    };
    let address = parse_address(&format!("{}://{host}:{port}", target.scheme));
    match (address, confirmed) {
        (Ok(address), Some(confirmed)) if address == *confirmed => Destination::Stay,
        _ => Destination::Browser,
    }
}

/// Decides whether a page that has started loading may stay in the window:
/// only where [`navigation_destination`] would have let it go. This is the
/// check after the fact for loads the guard is never asked about. Android
/// WebView asks only about GET requests, so a form sent with POST, a 307 or
/// 308 redirect that keeps the POST, and back and forward load unchecked.
pub fn page_may_stay(target: &NavigationTarget, confirmed: Option<&Address>) -> bool {
    navigation_destination(target, confirmed) == Destination::Stay
}

/// The app's own pages: `tauri://localhost` on desktop, and
/// `http://tauri.localhost` on Android and Windows.
fn is_connect_page(target: &NavigationTarget) -> bool {
    match target.scheme {
        "tauri" => target.host == Some("localhost"),
        "http" | "https" => target.host == Some("tauri.localhost"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target<'a>(scheme: &'a str, host: &'a str, port: u16) -> NavigationTarget<'a> {
        NavigationTarget {
            scheme,
            host: Some(host),
            port: Some(port),
        }
    }

    fn confirmed(input: &str) -> Address {
        parse_address(input).expect("a test address")
    }

    #[test]
    fn navigation_guard_keeps_only_the_confirmed_address() {
        let laptop = confirmed("192.168.1.20:4280");
        let at = |target: NavigationTarget| navigation_destination(&target, Some(&laptop));
        assert_eq!(at(target("http", "192.168.1.20", 4280)), Destination::Stay);
        assert_eq!(
            at(target("http", "192.168.1.20", 4281)),
            Destination::Browser
        );
        assert_eq!(
            at(target("https", "192.168.1.20", 4280)),
            Destination::Browser
        );
        assert_eq!(
            at(target("http", "192.168.1.21", 4280)),
            Destination::Browser
        );
        assert_eq!(
            at(target("https", "halonic.dev", 443)),
            Destination::Browser
        );
    }

    #[test]
    fn navigation_guard_compares_names_and_ipv6_like_the_connect_check() {
        let named = confirmed("My-Laptop.local:4280");
        assert_eq!(
            navigation_destination(&target("http", "my-laptop.local", 4280), Some(&named)),
            Destination::Stay
        );
        let ipv6 = confirmed("[fd00::20]:4280");
        assert_eq!(
            navigation_destination(&target("http", "[fd00::20]", 4280), Some(&ipv6)),
            Destination::Stay
        );
    }

    #[test]
    fn navigation_guard_sends_every_web_page_to_the_browser_before_a_connect() {
        assert_eq!(
            navigation_destination(&target("http", "192.168.1.20", 4280), None),
            Destination::Browser
        );
    }

    #[test]
    fn navigation_guard_keeps_the_connect_page() {
        for page in [
            target("tauri", "localhost", 0),
            target("http", "tauri.localhost", 80),
            target("https", "tauri.localhost", 443),
        ] {
            assert_eq!(
                navigation_destination(&page, None),
                Destination::Stay,
                "{page:?}"
            );
        }
    }

    #[test]
    fn navigation_guard_returns_to_the_connect_screen_for_change_address() {
        let link = NavigationTarget {
            scheme: "halonic-app",
            host: Some("connect"),
            port: None,
        };
        let laptop = confirmed("192.168.1.20:4280");
        assert_eq!(
            navigation_destination(&link, Some(&laptop)),
            Destination::BackToConnect
        );
        let other = NavigationTarget {
            host: Some("settings"),
            ..link
        };
        assert_eq!(
            navigation_destination(&other, Some(&laptop)),
            Destination::Nowhere
        );
    }

    #[test]
    fn navigation_guard_checks_every_loaded_page_again() {
        let laptop = confirmed("192.168.1.20:4280");
        let may_stay = |target: NavigationTarget| page_may_stay(&target, Some(&laptop));
        assert!(may_stay(target("http", "192.168.1.20", 4280)));
        assert!(may_stay(target("http", "tauri.localhost", 80)));
        // A form sent with POST, or a 307 redirect of one, that ends here.
        assert!(!may_stay(target("http", "192.168.1.21", 4280)));
        assert!(!may_stay(target("https", "halonic.dev", 443)));
        let blob = NavigationTarget {
            scheme: "blob",
            host: None,
            port: None,
        };
        assert!(!may_stay(blob));
        assert!(!page_may_stay(&target("http", "192.168.1.20", 4280), None));
    }

    #[test]
    fn navigation_guard_cancels_everything_that_is_not_a_web_page() {
        let laptop = confirmed("192.168.1.20:4280");
        for scheme in ["javascript", "file", "intent", "data", "blob", "about"] {
            let page = NavigationTarget {
                scheme,
                host: None,
                port: None,
            };
            assert_eq!(
                navigation_destination(&page, Some(&laptop)),
                Destination::Nowhere,
                "{scheme}"
            );
        }
    }
}
