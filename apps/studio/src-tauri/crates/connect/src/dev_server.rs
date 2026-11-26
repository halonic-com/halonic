//! The dev server `tauri dev` loads the app's page from (HAL-19823). With no
//! `devUrl` in tauri.conf.json, the Tauri CLI serves `frontendDist` itself,
//! on `http://127.0.0.1:1430` unless told otherwise, and puts that address
//! in the config the shell is built with. The page then isn't on the app's
//! own origin, so without this the guard sent it to the browser and the
//! window stayed empty. Only a debug build keeps it: a release build ignores
//! any `devUrl`, so its guard is exactly [`navigation_destination`].

use crate::address::{Address, parse_address};
use crate::navigation::{
    Destination, NavigationTarget, is_app_page, is_app_page_path, navigation_destination,
};

/// How the shell was built.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Build {
    /// `tauri dev` or `tauri build --debug`.
    Debug,
    /// The build people install.
    Release,
}

impl Build {
    /// The build this code was compiled in: debug when debug assertions are
    /// on, as they are in Cargo's dev profile and off in its release profile.
    pub fn current() -> Build {
        if cfg!(debug_assertions) {
            Build::Debug
        } else {
            Build::Release
        }
    }
}

/// The dev server's origin, in a debug build that has one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevServer(Address);

impl DevServer {
    /// The dev server at `dev_url` (the config's `build.devUrl`), in a debug
    /// build. None in a release build, and none when `dev_url` is missing or
    /// isn't a bare `http` or `https` origin, such as one with a path.
    pub fn for_build(dev_url: Option<&str>, build: Build) -> Option<DevServer> {
        if build == Build::Release {
            return None;
        }
        parse_address(dev_url?).ok().map(DevServer)
    }

    /// Whether `target` is the app's own page served by this dev server: its
    /// origin, and the same path, query and fragment rules as [`is_app_page`].
    pub fn serves_app_page(&self, target: &NavigationTarget) -> bool {
        let (Some(host), Some(port)) = (target.host, target.port) else {
            return false;
        };
        let origin = parse_address(&format!("{}://{host}:{port}", target.scheme));
        origin.is_ok_and(|origin| origin == self.0) && is_app_page_path(target)
    }
}

/// [`is_app_page`], also true for the app's page on the dev server.
pub fn is_own_page(target: &NavigationTarget, dev_server: Option<&DevServer>) -> bool {
    is_app_page(target) || dev_server.is_some_and(|server| server.serves_app_page(target))
}

/// [`navigation_destination`], except that the app's page on the dev server
/// stays in the window too.
pub fn navigation_destination_with(
    target: &NavigationTarget,
    confirmed: Option<&Address>,
    dev_server: Option<&DevServer>,
) -> Destination {
    if dev_server.is_some_and(|server| server.serves_app_page(target)) {
        return Destination::Stay;
    }
    navigation_destination(target, confirmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The address the Tauri CLI's own dev server puts in `devUrl`.
    const DEV_URL: &str = "http://127.0.0.1:1430/";

    /// The app's own page on the platform the tests run on.
    const APP_PAGE: &str = if cfg!(target_os = "android") {
        "/connect.html"
    } else {
        "/studio.html"
    };

    fn dev_page(path: &str) -> NavigationTarget<'_> {
        NavigationTarget {
            scheme: "http",
            host: Some("127.0.0.1"),
            port: Some(1430),
            path,
            query: None,
            fragment: None,
        }
    }

    #[test]
    fn a_debug_build_keeps_the_app_page_on_its_dev_server() {
        let server = DevServer::for_build(Some(DEV_URL), Build::Debug);
        assert!(server.is_some());
        let page = dev_page(APP_PAGE);
        assert_eq!(
            navigation_destination_with(&page, None, server.as_ref()),
            Destination::Stay
        );
        assert!(is_own_page(&page, server.as_ref()));
    }

    #[test]
    fn a_release_build_sends_the_dev_server_to_the_browser() {
        let server = DevServer::for_build(Some(DEV_URL), Build::Release);
        assert_eq!(server, None);
        let page = dev_page(APP_PAGE);
        assert_eq!(
            navigation_destination_with(&page, None, server.as_ref()),
            Destination::Browser
        );
        assert!(!is_own_page(&page, server.as_ref()));
    }

    #[test]
    fn the_dev_server_keeps_only_the_app_page() {
        let server = DevServer::for_build(Some(DEV_URL), Build::Debug);
        let others = [
            dev_page("/"),
            dev_page("/index.html"),
            dev_page("/assets/app.js"),
            NavigationTarget {
                query: Some("a=b"),
                ..dev_page(APP_PAGE)
            },
            NavigationTarget {
                fragment: Some("other"),
                ..dev_page(APP_PAGE)
            },
            NavigationTarget {
                port: Some(1431),
                ..dev_page(APP_PAGE)
            },
            NavigationTarget {
                host: Some("127.0.0.2"),
                ..dev_page(APP_PAGE)
            },
            NavigationTarget {
                scheme: "https",
                ..dev_page(APP_PAGE)
            },
        ];
        for page in others {
            assert_ne!(
                navigation_destination_with(&page, None, server.as_ref()),
                Destination::Stay,
                "{page:?}"
            );
        }
    }

    #[test]
    fn the_guard_is_unchanged_for_every_other_page() {
        let server = DevServer::for_build(Some(DEV_URL), Build::Debug);
        let laptop = parse_address("192.168.1.20:4280").expect("a test address");
        let confirmed = NavigationTarget {
            host: Some("192.168.1.20"),
            port: Some(4280),
            ..dev_page("/")
        };
        assert_eq!(
            navigation_destination_with(&confirmed, Some(&laptop), server.as_ref()),
            Destination::Stay
        );
        let javascript = NavigationTarget {
            scheme: "javascript",
            host: None,
            port: None,
            ..dev_page("")
        };
        assert_eq!(
            navigation_destination_with(&javascript, Some(&laptop), server.as_ref()),
            Destination::Nowhere
        );
    }

    #[test]
    fn a_debug_build_has_no_dev_server_without_a_bare_dev_url() {
        for dev_url in [
            None,
            Some("http://127.0.0.1:1430/studio"),
            Some("tauri://localhost"),
        ] {
            assert_eq!(
                DevServer::for_build(dev_url, Build::Debug),
                None,
                "{dev_url:?}"
            );
        }
    }
}
