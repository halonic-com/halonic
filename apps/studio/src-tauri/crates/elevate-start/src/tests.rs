//! The rules of [`Starts`] against a pretend Windows.

use super::{Launch, Outcome, StartError, Starts, Verb, Wait};
use std::collections::VecDeque;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

const HELPER: &str = "halonic-sandbox-elevate.exe";
const LIMIT: Duration = Duration::from_secs(300);

/// Answers each call from a script, and records the calls.
#[derive(Default)]
struct Pretend {
    starts: Mutex<VecDeque<Result<u32, StartError>>>,
    waits: Mutex<VecDeque<Result<Wait, String>>>,
    calls: Mutex<Vec<String>>,
}

impl Pretend {
    fn start_with(self, result: Result<u32, StartError>) -> Self {
        self.starts.lock().unwrap().push_back(result);
        self
    }

    fn wait_with(self, result: Result<Wait, String>) -> Self {
        self.waits.lock().unwrap().push_back(result);
        self
    }

    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

impl Launch for Pretend {
    type Process = u32;

    fn start(&self, helper: &Path, verb: Verb, owner: isize) -> Result<u32, StartError> {
        let call = format!("start {} {} {owner}", helper.display(), verb.argument());
        self.calls.lock().unwrap().push(call);
        self.starts
            .lock()
            .unwrap()
            .pop_front()
            .expect("a scripted start")
    }

    fn wait(&self, process: &u32, limit: Duration) -> Result<Wait, String> {
        let call = format!("wait {process} {}", limit.as_secs());
        self.calls.lock().unwrap().push(call);
        self.waits
            .lock()
            .unwrap()
            .pop_front()
            .expect("a scripted wait")
    }
}

fn run(starts: &Starts<Pretend>, verb: Verb) -> Outcome {
    starts.run(Path::new(HELPER), verb, 7, LIMIT)
}

#[test]
fn elevate_start_gives_the_helpers_exit_code() {
    let starts = Starts::new(
        Pretend::default()
            .start_with(Ok(1))
            .wait_with(Ok(Wait::Exited(0))),
    );
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
    let calls = starts.launch.calls();
    assert_eq!(
        calls,
        [format!("start {HELPER} setup 7"), "wait 1 300".to_owned()]
    );
}

#[test]
fn elevate_start_passes_only_the_verb() {
    let starts = Starts::new(
        Pretend::default()
            .start_with(Ok(1))
            .wait_with(Ok(Wait::Exited(14))),
    );
    assert_eq!(run(&starts, Verb::Remove), Outcome::Exited(14));
    assert_eq!(starts.launch.calls()[0], format!("start {HELPER} remove 7"));
}

#[test]
fn elevate_start_reports_a_turned_down_prompt_and_frees_the_slot() {
    let pretend = Pretend::default()
        .start_with(Err(StartError::Cancelled))
        .start_with(Ok(2))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = Starts::new(pretend);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Cancelled);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
}

#[test]
fn elevate_start_reports_why_windows_didnt_start_it() {
    let reason = "The system cannot find the file specified.".to_owned();
    let starts = Starts::new(Pretend::default().start_with(Err(StartError::Other(reason.clone()))));
    assert_eq!(run(&starts, Verb::Setup), Outcome::Failed(reason));
}

#[test]
fn elevate_start_times_out_and_doesnt_ask_again_while_the_helper_runs() {
    let pretend = Pretend::default()
        .start_with(Ok(3))
        .wait_with(Ok(Wait::Running))
        .wait_with(Ok(Wait::Running));
    let starts = Starts::new(pretend);
    assert_eq!(run(&starts, Verb::Setup), Outcome::TimedOut);
    assert_eq!(run(&starts, Verb::Remove), Outcome::StillRunning);
    // One start only; the second call only looked at the first helper.
    assert_eq!(starts.launch.calls()[1..], ["wait 3 300", "wait 3 0"]);
}

#[test]
fn elevate_start_asks_again_once_the_helper_left_running_has_ended() {
    let pretend = Pretend::default()
        .start_with(Ok(3))
        .wait_with(Ok(Wait::Running))
        .wait_with(Ok(Wait::Exited(0)))
        .start_with(Ok(4))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = Starts::new(pretend);
    assert_eq!(run(&starts, Verb::Setup), Outcome::TimedOut);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
    assert_eq!(
        starts.launch.calls().last().map(String::as_str),
        Some("wait 4 300")
    );
}

#[test]
fn elevate_start_counts_a_failed_wait_as_still_running() {
    let pretend = Pretend::default()
        .start_with(Ok(5))
        .wait_with(Err("the wait failed".to_owned()))
        .wait_with(Err("the wait failed".to_owned()));
    let starts = Starts::new(pretend);
    assert_eq!(
        run(&starts, Verb::Setup),
        Outcome::Failed("the wait failed".to_owned())
    );
    assert_eq!(run(&starts, Verb::Setup), Outcome::StillRunning);
}

#[test]
fn elevate_start_never_asks_twice_at_once() {
    let starts = Starts::new(Pretend::default());
    *starts.slot.lock().unwrap() = super::Slot::Busy;
    assert_eq!(run(&starts, Verb::Setup), Outcome::StillRunning);
    assert!(starts.launch.calls().is_empty());
}
