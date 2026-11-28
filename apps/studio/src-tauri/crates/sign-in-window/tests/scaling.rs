//! Requirement `studio.src-tauri.crates.sign-in-window.sign-in-window`: on a
//! scaled display the size and place on the browser's command line are in
//! the device-independent pixels Chromium takes, so the window starts over
//! Halonic at the size meant (HAL-20663).

use halonic_sign_in_window::{Rect, browser_rect, launch_arguments, popup_rect, sign_in_url};

/// Studio at 1500 by 1000 logical pixels, on the left of a 2560 by 1440
/// logical screen scaled to 150 %, all in physical pixels.
const STUDIO_AT_150: Rect = Rect {
    x: 150,
    y: 75,
    width: 2250,
    height: 1500,
};
const SCREEN_AT_150: Rect = Rect {
    x: 0,
    y: 0,
    width: 3840,
    height: 2100,
};

#[test]
fn at_150_percent_the_command_line_is_in_device_independent_pixels() {
    let url = sign_in_url(
        "https://paperclip.acme.test/cli-auth/challenge-1",
        "https://paperclip.acme.test",
    )
    .expect("an address");
    let rect = popup_rect(STUDIO_AT_150, SCREEN_AT_150);
    assert_eq!(
        rect,
        Rect {
            x: 375,
            y: 225,
            width: 1800,
            height: 1200,
        }
    );
    let arguments = launch_arguments(&url, rect, 1.5);
    assert_eq!(
        arguments,
        [
            "--app=https://paperclip.acme.test/cli-auth/challenge-1".to_owned(),
            "--window-size=1200,800".to_owned(),
            "--window-position=250,150".to_owned(),
        ]
    );
}

#[test]
fn a_monitor_left_of_the_main_one_keeps_its_negative_place() {
    let rect = Rect {
        x: -2400,
        y: -301,
        width: 1201,
        height: 900,
    };
    assert_eq!(
        browser_rect(rect, 1.5),
        Rect {
            x: -1600,
            y: -201,
            width: 801,
            height: 600,
        }
    );
}

#[test]
fn at_100_percent_or_with_no_usable_scale_nothing_changes() {
    let rect = Rect {
        x: 10,
        y: -20,
        width: 800,
        height: 600,
    };
    for scale_factor in [1.0, 0.0, -1.5, f64::NAN, f64::INFINITY] {
        assert_eq!(browser_rect(rect, scale_factor), rect, "{scale_factor}");
    }
}
