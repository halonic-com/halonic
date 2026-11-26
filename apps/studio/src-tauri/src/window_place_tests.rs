//! The window places (`studio.src-tauri.window-place`).

use super::*;
use crate::focused_apps::FocusedApp;

/// The board's screen: one 7680×2160 ultrawide, its work area above a
/// 48-pixel taskbar.
const ULTRAWIDE: Rect = Rect {
    x: 0,
    y: 0,
    width: 7680,
    height: 2160,
};
const ULTRAWIDE_WORK_AREA: Rect = Rect {
    x: 0,
    y: 0,
    width: 7680,
    height: 2112,
};

/// A second screen to the right of the ultrawide.
const RIGHT_SCREEN: Rect = Rect {
    x: 7680,
    y: 0,
    width: 1920,
    height: 1080,
};

/// The frame slack at 100%.
const SLACK: i64 = 8;

fn window(x: i32, y: i32, width: u32, height: u32) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

#[test]
fn keeps_position_size_maximised_and_fullscreen_but_never_whether_it_shows() {
    // StateFlags has no `==`, so its bits are compared.
    assert_eq!(
        kept().bits(),
        (StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN)
            .bits()
    );
    assert!(!kept().contains(StateFlags::VISIBLE));
}

#[test]
fn keeps_each_app_window_under_its_own_label() {
    assert!(is_kept("main"));
    assert!(is_kept(FocusedApp::Inbox.name()));
    assert!(is_kept(FocusedApp::Messenger.name()));
}

#[test]
fn leaves_the_other_windows_alone() {
    for label in ["feedback-unavailable", "server-session-brief", ""] {
        assert!(!is_kept(label), "{label:?}");
    }
}

#[test]
fn a_window_snapped_to_a_zone_stays_exactly_there() {
    // FancyZones puts the frame's invisible border a few pixels past the
    // screen's edge; the place is kept to the pixel.
    let inbox = window(-7, 0, 2574, 2119);
    let messenger = window(2553, 0, 2574, 2119);
    assert_eq!(
        fallback(inbox, &[ULTRAWIDE], Some(ULTRAWIDE_WORK_AREA), SLACK),
        None
    );
    assert_eq!(
        fallback(messenger, &[ULTRAWIDE], Some(ULTRAWIDE_WORK_AREA), SLACK),
        None
    );
}

#[test]
fn a_window_on_a_second_screen_stays_there() {
    let inbox = window(8000, 100, 1200, 800);
    assert_eq!(
        fallback(
            inbox,
            &[ULTRAWIDE, RIGHT_SCREEN],
            Some(ULTRAWIDE_WORK_AREA),
            SLACK
        ),
        None
    );
}

#[test]
fn a_window_on_a_screen_now_gone_moves_to_the_middle_of_the_primary() {
    let inbox = window(8000, 100, 1200, 800);
    assert_eq!(
        fallback(inbox, &[ULTRAWIDE], Some(ULTRAWIDE_WORK_AREA), SLACK),
        Some(window(3240, 656, 1200, 800))
    );
}

#[test]
fn a_window_bigger_than_the_primary_shrinks_to_its_work_area() {
    let laptop = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    let laptop_work_area = Rect {
        height: 1032,
        ..laptop
    };
    let studio = window(-9000, 0, 3840, 2112);
    assert_eq!(
        fallback(studio, &[laptop], Some(laptop_work_area), SLACK),
        Some(window(0, 0, 1920, 1032))
    );
}

#[test]
fn a_window_barely_on_screen_moves_fully_onto_it() {
    // Only 20 pixels of it are left on the ultrawide's right edge.
    let messenger = window(7660, 400, 1200, 800);
    assert_eq!(
        fallback(
            messenger,
            &[ULTRAWIDE_WORK_AREA],
            Some(ULTRAWIDE_WORK_AREA),
            SLACK
        ),
        Some(window(6480, 400, 1200, 800))
    );
}

#[test]
fn a_window_partly_below_the_taskbar_moves_up_onto_the_work_area() {
    let inbox = window(1000, 1700, 1200, 800);
    assert_eq!(
        fallback(
            inbox,
            &[ULTRAWIDE_WORK_AREA],
            Some(ULTRAWIDE_WORK_AREA),
            SLACK
        ),
        Some(window(1000, 1312, 1200, 800))
    );
}

#[test]
fn after_the_resolution_went_down_a_window_shrinks_onto_the_screen() {
    // Kept on a 2560×1440 screen that now runs at 1920×1080.
    let smaller = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1032,
    };
    let studio = window(400, 200, 2000, 1200);
    assert_eq!(
        fallback(studio, &[smaller], Some(smaller), SLACK),
        Some(window(0, 0, 1920, 1032))
    );
}

#[test]
fn a_window_across_two_screens_of_different_scales_moves_onto_the_one_it_overlaps_most() {
    // A 4K screen at 150% and a 1080p screen at 100% to its right: both
    // work areas in physical pixels, as the monitors report them.
    let left_4k = Rect {
        x: 0,
        y: 0,
        width: 3840,
        height: 2088,
    };
    let right_1080p = Rect {
        x: 3840,
        y: 0,
        width: 1920,
        height: 1032,
    };
    // Its lower part on the right is below the 1080p screen's work area.
    let messenger = window(3500, 600, 1000, 700);
    assert_eq!(
        fallback(messenger, &[left_4k, right_1080p], Some(left_4k), SLACK),
        Some(window(3840, 332, 1000, 700))
    );
}

#[test]
fn a_window_across_two_screens_all_on_them_stays() {
    let left = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1032,
    };
    let right = Rect { x: 1920, ..left };
    let messenger = window(1500, 100, 1000, 700);
    assert_eq!(fallback(messenger, &[left, right], Some(left), SLACK), None);
}

#[test]
fn the_frame_slack_grows_with_the_scale() {
    assert_eq!(frame_slack(1.0), 8);
    assert_eq!(frame_slack(2.0), 16);
    assert_eq!(frame_slack(3.0), 24);
    assert_eq!(frame_slack(0.5), 8);
}

#[test]
fn a_window_snapped_on_a_screen_at_300_percent_stays_exactly_there() {
    // The invisible border is about 21 pixels at 300%.
    let screen = Rect {
        x: 0,
        y: 0,
        width: 3840,
        height: 2088,
    };
    let inbox = window(-21, 0, 1962, 2109);
    assert_eq!(
        fallback(inbox, &[screen], Some(screen), frame_slack(3.0)),
        None
    );
}

#[test]
fn a_maximised_window_on_a_screen_still_there_stays() {
    assert_eq!(
        stretched_fallback(
            RIGHT_SCREEN,
            &[ULTRAWIDE, RIGHT_SCREEN],
            Some(ULTRAWIDE_WORK_AREA),
        ),
        None
    );
}

#[test]
fn a_maximised_or_fullscreen_window_on_a_screen_now_gone_stretches_over_the_primary() {
    assert_eq!(
        stretched_fallback(RIGHT_SCREEN, &[ULTRAWIDE], Some(ULTRAWIDE_WORK_AREA)),
        Some(ULTRAWIDE_WORK_AREA)
    );
}

#[test]
fn a_primary_screen_off_the_origin_is_centred_in_its_own_area() {
    let left_primary = Rect {
        x: -1920,
        y: -200,
        width: 1920,
        height: 1080,
    };
    assert_eq!(
        fallback(
            window(9000, 9000, 1000, 600),
            &[left_primary],
            Some(left_primary),
            SLACK,
        ),
        Some(window(-1460, 40, 1000, 600))
    );
}

#[test]
fn with_no_primary_screen_the_window_stays_where_it_is() {
    let inbox = window(8000, 100, 1200, 800);
    assert_eq!(fallback(inbox, &[], None, SLACK), None);
}

#[test]
fn no_capability_grants_the_window_state_commands() {
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    for entry in std::fs::read_dir(&folder).expect("the capabilities folder") {
        let path = entry.expect("a capability").path();
        if path.extension().is_none_or(|extension| extension != "json") {
            continue;
        }
        let capability = std::fs::read_to_string(&path).expect("a capability file");
        assert!(
            !capability.contains("window-state"),
            "{} grants the window state plugin",
            path.display()
        );
    }
}
