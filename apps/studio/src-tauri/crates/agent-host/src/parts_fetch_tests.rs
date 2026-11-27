//! The parts allow-list on its own, by the URL parts it decides on.
//! Requirement `studio.src-tauri.sandbox-parts-download`.

use super::{UrlView, part_url_allowed};

fn view<'a>(scheme: &'a str, host: &'a str, port: u16, path: &'a str) -> UrlView<'a> {
    UrlView {
        scheme,
        has_credentials: false,
        host,
        port: Some(port),
        path,
    }
}

const RELEASE_PATH: &str = "/halonic-com/halonic/releases/download/v0.1.1/halonic-wsl-3.tar.gz";

/// Requirement `studio.src-tauri.sandbox-parts-download`: the allow-list
/// takes the two release paths and the asset host after a redirect.
#[test]
fn the_allow_list_takes_halonic_release_downloads() {
    assert_eq!(
        part_url_allowed(&view("https", "github.com", 443, RELEASE_PATH), 0),
        Ok(())
    );
    let preview = "/halonic-com/halonic-preview/releases/download/v0.2.0-preview.4/a.tar.gz";
    assert_eq!(
        part_url_allowed(&view("https", "github.com", 443, preview), 0),
        Ok(())
    );
    let asset = view(
        "https",
        "release-assets.githubusercontent.com",
        443,
        "/github/1",
    );
    assert_eq!(part_url_allowed(&asset, 1), Ok(()));
    assert_eq!(part_url_allowed(&asset, 3), Ok(()));
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: each refusal.
#[test]
fn the_allow_list_refuses_everything_else() {
    let refused = [
        (view("http", "github.com", 80, RELEASE_PATH), 0),
        (view("https", "github.com", 8443, RELEASE_PATH), 0),
        (
            UrlView {
                has_credentials: true,
                ..view("https", "github.com", 443, RELEASE_PATH)
            },
            0,
        ),
        (
            view(
                "https",
                "github.com",
                443,
                "/halonic-com/halonic/archive/main.tar.gz",
            ),
            0,
        ),
        (
            view(
                "https",
                "github.com",
                443,
                "/someone/halonic/releases/download/v1/a",
            ),
            0,
        ),
        (
            view(
                "https",
                "github.com",
                443,
                "/halonic-com/halonic/releases/download/../../x",
            ),
            0,
        ),
        (
            view("https", "release-assets.githubusercontent.com", 443, "/a"),
            0,
        ),
        (view("https", "raw.githubusercontent.com", 443, "/a"), 1),
        (view("https", "gist.githubusercontent.com", 443, "/a"), 1),
        (view("https", "github.com", 443, RELEASE_PATH), 1),
        (
            view("https", "release-assets.githubusercontent.com", 443, "/a"),
            4,
        ),
    ];
    for (url, redirects) in refused {
        assert!(
            part_url_allowed(&url, redirects).is_err(),
            "{url:?} after {redirects}"
        );
    }
}
