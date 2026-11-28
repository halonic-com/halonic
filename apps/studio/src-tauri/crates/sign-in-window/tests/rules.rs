//! Requirement `studio.src-tauri.crates.sign-in-window.sign-in-window`: the
//! default browsers that get a sign-in window, the browser's path in its
//! open command, the address check, the window's place and its command line.

use std::path::{Path, PathBuf};

use halonic_sign_in_window::{
    Browser, MIN_HEIGHT, MIN_WIDTH, Rect, Url, browser_exe, chromium_browser, launch_arguments,
    popup_rect, sign_in_url,
};

const CHROME: &str = r"C:\Program Files\Google\Chrome\Application\chrome.exe"; // leak-guard: allow absolute-path standard browser install paths under test

fn everything_exists(_: &Path) -> bool {
    true
}

#[test]
fn chrome_edge_and_brave_are_chromium() {
    assert_eq!(chromium_browser("ChromeHTML"), Some(Browser::Chrome));
    assert_eq!(chromium_browser("MSEdgeHTM"), Some(Browser::Edge));
    assert_eq!(chromium_browser("BraveHTML"), Some(Browser::Brave));
    assert_eq!(chromium_browser("ChromeHTML.ABC123"), Some(Browser::Chrome));
}

#[test]
fn any_other_browser_or_a_changed_name_is_not() {
    for prog_id in [
        "FirefoxURL-308046B0AF4A39CB",
        "SafariURL",
        "IE.HTTPS",
        "",
        "chromehtml",
        "ChromeHTMLX",
        "ChromeHTML.",
        r"ChromeHTML.A\shell",
        "ChromeHTML.A B",
        "MSEdgeHTML",
    ] {
        assert_eq!(chromium_browser(prog_id), None, "{prog_id:?}");
    }
}

#[test]
fn the_browser_is_the_quoted_program_of_its_open_command() {
    let command = format!("\"{CHROME}\" --single-argument %1");
    assert_eq!(
        browser_exe(&command, everything_exists),
        Some(PathBuf::from(CHROME))
    );
    let edge =
        r#""C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --single-argument %1"#; // leak-guard: allow absolute-path standard browser install paths under test
    assert_eq!(
        browser_exe(edge, everything_exists),
        Some(PathBuf::from(
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" // leak-guard: allow absolute-path standard browser install paths under test
        ))
    );
}

#[test]
fn an_unquoted_program_is_its_first_word() {
    assert_eq!(
        browser_exe(r"  C:\Brave\brave.EXE -- %1", everything_exists), // leak-guard: allow absolute-path standard browser install paths under test
        Some(PathBuf::from(r"C:\Brave\brave.EXE")) // leak-guard: allow absolute-path standard browser install paths under test
    );
}

#[test]
fn anything_but_an_existing_exe_on_a_drive_is_refused() {
    for command in [
        "",
        "   ",
        "%1",
        "\"%1\"",
        "\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --single-argument %1", // leak-guard: allow absolute-path standard browser install paths under test
        r#""C:\Tools\open.bat" %1"#, // leak-guard: allow absolute-path standard browser install paths under test
        r#""chrome.exe" %1"#,
        r#""\\server\share\chrome.exe" %1"#,
        r#""C:\Program Files\Google\Chrome\Application\chrome.exe\x" %1"#, // leak-guard: allow absolute-path standard browser install paths under test
        r"rundll32.exe url.dll,FileProtocolHandler %1",
    ] {
        assert_eq!(browser_exe(command, everything_exists), None, "{command:?}");
    }
    let command = format!("\"{CHROME}\" %1");
    assert_eq!(browser_exe(&command, |_| false), None);
}

#[test]
fn https_and_plain_http_to_this_computer_may_open() {
    for address in [
        "https://paperclip.acme.test/cli-auth/challenge-1",
        "https://accounts.example.com/o/oauth2/auth?client_id=a&state=b",
        "http://localhost:3100/cli-auth/challenge-1",
        "http://127.0.0.1:3100/x",
        "http://[::1]:3100/x",
    ] {
        assert!(sign_in_url(address).is_some(), "{address:?}");
    }
}

#[test]
fn any_other_address_is_refused() {
    for address in [
        "",
        "paperclip.acme.test/cli-auth",
        "/cli-auth/challenge-1",
        "http://paperclip.acme.test/cli-auth",
        "http://localhost.acme.test/",
        "https://user@paperclip.acme.test/",
        "file:///C:/Windows/System32/calc.exe",
        "javascript:alert(1)",
        "data:text/html,hi",
        "chrome://settings",
        "--disable-web-security",
    ] {
        assert!(sign_in_url(address).is_none(), "{address:?}");
    }
}

#[test]
fn an_address_with_a_password_is_refused() {
    let mut url = Url::parse("https://paperclip.acme.test/").expect("an address");
    url.set_username("user").expect("a user name");
    url.set_password(Some("fake")).expect("a password");
    assert!(sign_in_url(url.as_str()).is_none());
}

#[test]
fn the_address_is_one_app_argument_with_the_size_and_place() {
    let url = sign_in_url("https://paperclip.acme.test/a b?q=\"x\" --y").expect("an address");
    let rect = Rect {
        x: 10,
        y: -20,
        width: 800,
        height: 600,
    };
    let arguments = launch_arguments(&url, rect, 1.0);
    assert_eq!(
        arguments,
        [
            "--app=https://paperclip.acme.test/a%20b?q=%22x%22%20--y".to_owned(),
            "--window-size=800,600".to_owned(),
            "--window-position=10,-20".to_owned(),
        ]
    );
}

const SCREEN: Rect = Rect {
    x: 0,
    y: 0,
    width: 3440,
    height: 1400,
};

#[test]
fn four_fifths_of_the_window_centred_on_it() {
    let studio = Rect {
        x: 100,
        y: 50,
        width: 1500,
        height: 1000,
    };
    assert_eq!(
        popup_rect(studio, SCREEN),
        Rect {
            x: 250,
            y: 150,
            width: 1200,
            height: 800
        }
    );
}

#[test]
fn a_small_window_gets_the_smallest_sign_in_window() {
    let studio = Rect {
        x: 1000,
        y: 400,
        width: 400,
        height: 300,
    };
    let rect = popup_rect(studio, SCREEN);
    assert_eq!((rect.width, rect.height), (MIN_WIDTH, MIN_HEIGHT));
    assert_eq!((rect.x, rect.y), (960, 270));
}

#[test]
fn a_window_at_the_screen_edge_keeps_the_sign_in_on_the_screen() {
    let studio = Rect {
        x: -200,
        y: -100,
        width: 500,
        height: 400,
    };
    assert_eq!(
        popup_rect(studio, SCREEN),
        Rect {
            x: 0,
            y: 0,
            width: MIN_WIDTH,
            height: MIN_HEIGHT
        }
    );
    let right = Rect {
        x: 3300,
        y: 1200,
        width: 500,
        height: 400,
    };
    assert_eq!(
        popup_rect(right, SCREEN),
        Rect {
            x: 3440 - 480,
            y: 1400 - 560,
            width: MIN_WIDTH,
            height: MIN_HEIGHT
        }
    );
}

#[test]
fn a_second_monitor_left_of_the_first_is_its_own_area() {
    let left_screen = Rect {
        x: -1920,
        y: 0,
        width: 1920,
        height: 1040,
    };
    let studio = Rect {
        x: -1900,
        y: 0,
        width: 1920,
        height: 1040,
    };
    assert_eq!(
        popup_rect(studio, left_screen),
        Rect {
            x: -1900 + 192,
            y: 104,
            width: 1536,
            height: 832
        }
    );
}

#[test]
fn a_screen_smaller_than_the_least_size_bounds_it() {
    let tiny = Rect {
        x: 0,
        y: 0,
        width: 400,
        height: 500,
    };
    let studio = Rect {
        x: 0,
        y: 0,
        width: 400,
        height: 500,
    };
    assert_eq!(
        popup_rect(studio, tiny),
        Rect {
            x: 0,
            y: 0,
            width: 400,
            height: 500
        }
    );
}
