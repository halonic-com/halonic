//! The rules of [`Starts`] against a pretend Windows.

use super::{Launch, Outcome, StartError, Starts, Verb, Wait};
use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const HELPER: &str = "halonic-sandbox-elevate.exe";
const LIMIT: Duration = Duration::from_secs(300);
const PUBLISHER: &str = "Halonic";

/// Answers each call from a script, and records the calls. An open nothing
/// scripted finds the helper signed by [`PUBLISHER`].
#[derive(Default)]
struct Pretend {
    opens: Mutex<VecDeque<Result<Option<String>, String>>>,
    starts: Mutex<VecDeque<Result<u32, StartError>>>,
    waits: Mutex<VecDeque<Result<Wait, String>>>,
    calls: Arc<Mutex<Vec<String>>>,
}

/// An opened helper: records when it is let go of.
struct Opened {
    helper: String,
    calls: Arc<Mutex<Vec<String>>>,
}

impl Drop for Opened {
    fn drop(&mut self) {
        self.calls.lock().unwrap().push("close".to_owned());
    }
}

impl Pretend {
    fn open_with(self, result: Result<Option<String>, String>) -> Self {
        self.opens.lock().unwrap().push_back(result);
        self
    }

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
    type Opened = Opened;
    type Process = u32;

    fn open(&self, helper: &Path) -> Result<(Opened, Option<String>), String> {
        let helper = helper.display().to_string();
        self.calls.lock().unwrap().push(format!("open {helper}"));
        let signer = self
            .opens
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Ok(Some(PUBLISHER.to_owned())))?;
        let calls = Arc::clone(&self.calls);
        Ok((Opened { helper, calls }, signer))
    }

    fn start(&self, helper: &Opened, verb: Verb, owner: isize) -> Result<u32, StartError> {
        let call = format!("start {} {} {owner}", helper.helper, verb.argument());
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

/// Starts as a signed release makes them.
fn signed(pretend: Pretend) -> Starts<Pretend> {
    Starts::new(pretend, Some(PUBLISHER))
}

fn run(starts: &Starts<Pretend>, verb: Verb) -> Outcome {
    starts.run(Path::new(HELPER), verb, 7, LIMIT)
}

#[test]
fn elevate_start_gives_the_helpers_exit_code() {
    let starts = signed(
        Pretend::default()
            .start_with(Ok(1))
            .wait_with(Ok(Wait::Exited(0))),
    );
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
    let calls = starts.launch.calls();
    // The helper is held from before the check until it has started.
    assert_eq!(
        calls,
        [
            format!("open {HELPER}"),
            format!("start {HELPER} setup 7"),
            "close".to_owned(),
            "wait 1 300".to_owned()
        ]
    );
}

#[test]
fn elevate_start_passes_only_the_verb() {
    let starts = signed(
        Pretend::default()
            .start_with(Ok(1))
            .wait_with(Ok(Wait::Exited(14))),
    );
    assert_eq!(run(&starts, Verb::Remove), Outcome::Exited(14));
    assert_eq!(starts.launch.calls()[1], format!("start {HELPER} remove 7"));
}

#[test]
fn elevate_start_reports_a_turned_down_prompt_and_frees_the_slot() {
    let pretend = Pretend::default()
        .start_with(Err(StartError::Cancelled))
        .start_with(Ok(2))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = signed(pretend);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Cancelled);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
}

#[test]
fn elevate_start_reports_why_windows_didnt_start_it() {
    let reason = "The system cannot find the file specified.".to_owned();
    let starts = signed(Pretend::default().start_with(Err(StartError::Other(reason.clone()))));
    assert_eq!(run(&starts, Verb::Setup), Outcome::Failed(reason));
}

#[test]
fn elevate_start_times_out_and_doesnt_ask_again_while_the_helper_runs() {
    let pretend = Pretend::default()
        .start_with(Ok(3))
        .wait_with(Ok(Wait::Running))
        .wait_with(Ok(Wait::Running));
    let starts = signed(pretend);
    assert_eq!(run(&starts, Verb::Setup), Outcome::TimedOut);
    assert_eq!(run(&starts, Verb::Remove), Outcome::StillRunning);
    // One start only; the second call only looked at the first helper.
    assert_eq!(starts.launch.calls()[3..], ["wait 3 300", "wait 3 0"]);
}

#[test]
fn elevate_start_asks_again_once_the_helper_left_running_has_ended() {
    let pretend = Pretend::default()
        .start_with(Ok(3))
        .wait_with(Ok(Wait::Running))
        .wait_with(Ok(Wait::Exited(0)))
        .start_with(Ok(4))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = signed(pretend);
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
    let starts = signed(pretend);
    assert_eq!(
        run(&starts, Verb::Setup),
        Outcome::Failed("the wait failed".to_owned())
    );
    assert_eq!(run(&starts, Verb::Setup), Outcome::StillRunning);
}

#[test]
fn elevate_start_never_asks_twice_at_once() {
    let starts = signed(Pretend::default());
    *starts.slot.lock().unwrap() = super::Slot::Busy;
    assert_eq!(run(&starts, Verb::Setup), Outcome::StillRunning);
    assert!(starts.launch.calls().is_empty());
}

#[test]
fn elevate_start_refuses_a_helper_another_publisher_signed_without_asking_windows() {
    let pretend = Pretend::default()
        .open_with(Ok(Some("Someone else".to_owned())))
        .open_with(Ok(None))
        .start_with(Ok(6))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = signed(pretend);
    let refused = Outcome::Failed(format!(
        "the sandbox helper beside the app isn't signed by {PUBLISHER}, so Windows wasn't asked to start it"
    ));
    assert_eq!(run(&starts, Verb::Setup), refused);
    // Unsigned, or a signature Windows doesn't trust, is refused the same.
    assert_eq!(run(&starts, Verb::Setup), refused);
    // Neither asked Windows, and each freed the slot.
    let calls = starts.launch.calls();
    assert!(
        !calls.iter().any(|call| call.starts_with("start")),
        "{calls:?}"
    );
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
}

#[test]
fn elevate_start_reports_a_helper_it_couldnt_open_without_asking_windows() {
    let reason = "Windows couldn't open the sandbox helper: not found".to_owned();
    let starts = signed(Pretend::default().open_with(Err(reason.clone())));
    assert_eq!(run(&starts, Verb::Setup), Outcome::Failed(reason));
    assert_eq!(starts.launch.calls(), [format!("open {HELPER}")]);
}

#[test]
fn elevate_start_checks_no_publisher_in_a_build_without_one() {
    // Dev and CI builds, and an unsigned release: nothing to check against.
    let pretend = Pretend::default()
        .open_with(Ok(None))
        .start_with(Ok(8))
        .wait_with(Ok(Wait::Exited(0)));
    let starts = Starts::new(pretend, None);
    assert_eq!(run(&starts, Verb::Setup), Outcome::Exited(0));
}
