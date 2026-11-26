//! Requirement `open-timings`: each step's name and milliseconds, the
//! whole, and nothing else.

use std::time::{Duration, Instant};

use super::{StepTimes, engine_open_line, ready_line};

#[test]
fn names_each_step_with_its_milliseconds_and_the_whole() {
    let began = Instant::now();
    let mut times = StepTimes::starting_at(began);
    times.ended("wsl", began + Duration::from_millis(812));
    times.ended("start", began + Duration::from_millis(4812));
    assert_eq!(
        times.line("the agent host started in the distro"),
        "the agent host started in the distro: wsl 812 ms, start 4000 ms (4812 ms in all)"
    );
}

#[test]
fn a_timed_step_returns_what_it_returned() {
    let mut times = StepTimes::starting_at(Instant::now());
    let answer = times.timed("copy", || 42);
    assert_eq!(answer, 42);
    assert!(times.line("copied").starts_with("copied: copy "));
}

#[test]
fn says_when_the_start_was_ready_only_once_the_page_load_is_known() {
    assert_eq!(
        ready_line(Some(Duration::from_millis(9001))).as_deref(),
        Some("Studio's start was ready 9001 ms after the page loaded")
    );
    assert_eq!(ready_line(None), None);
}

#[test]
fn says_how_long_the_engine_took_and_when_it_was_asked() {
    assert_eq!(
        engine_open_line(
            Some(Duration::from_millis(12_000)),
            Duration::from_millis(3_250)
        ),
        "a window's engine answered in 3250 ms, asked 12000 ms after the page loaded"
    );
    assert_eq!(
        engine_open_line(None, Duration::from_millis(2)),
        "a window's engine answered in 2 ms"
    );
}
