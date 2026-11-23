//! The one-shot WSL setup's command and answers. Stand-in scripts take the
//! host's place on Unix, as in `wsl/tests.rs`.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::ffi::OsStr;
use std::path::Path;

use super::{WslSetupEnd, read_wsl_setup_end, resume_command, wsl_setup_command};

#[test]
fn sandbox_wsl_setup_command_passes_only_the_shells_own_arguments() {
    let command = wsl_setup_command(
        Path::new("app/halonic-agent-host.exe"),
        Path::new("profile"),
        Path::new("app/halonic-wsl.tar.gz"),
        "\"app/Halonic.exe\"",
    );
    assert_eq!(
        command.get_program(),
        OsStr::new("app/halonic-agent-host.exe")
    );
    let arguments: Vec<&OsStr> = command.get_args().collect();
    assert_eq!(
        arguments,
        [
            "--wsl-setup",
            "--profile-folder",
            "profile",
            "--wsl-image",
            "app/halonic-wsl.tar.gz",
            "--wsl-resume",
            "\"app/Halonic.exe\"",
        ]
        .map(OsStr::new)
    );
}

#[test]
fn sandbox_wsl_setup_command_resumes_with_the_app_quoted() {
    assert_eq!(
        resume_command(Path::new("C:/Program Files/Halonic/Halonic.exe")),
        "\"C:/Program Files/Halonic/Halonic.exe\""
    );
}

#[test]
fn sandbox_wsl_setup_command_reads_each_ending_from_the_last_line() {
    let cases = [
        (
            "{\"outcome\":\"done\",\"residuals\":[\"default-distro\"],\"runtime\":\"left-to-shell\"}\n",
            WslSetupEnd::Done,
        ),
        (
            "{\"outcome\":\"restart-needed\"}",
            WslSetupEnd::RestartNeeded,
        ),
        ("{\"outcome\":\"cancelled\"}\n\n", WslSetupEnd::Cancelled),
        (
            "{\"outcome\":\"blocked\",\"reason\":\"virtualisation-off\",\"detail\":\"d\"}",
            WslSetupEnd::Blocked {
                reason: "virtualisation-off".to_owned(),
                detail: "d".to_owned(),
            },
        ),
        (
            "a notice first\n{\"outcome\":\"failed\",\"code\":\"distro-not-ours\",\"reason\":\"other\",\"detail\":\"d\",\"fix\":\"update-wsl\"}\n",
            WslSetupEnd::Failed {
                reason: "other".to_owned(),
                code: "distro-not-ours".to_owned(),
                detail: "d".to_owned(),
            },
        ),
        (
            "{\"outcome\":\"refused\",\"code\":\"bad-flags\",\"detail\":\"d\"}",
            WslSetupEnd::Refused {
                code: "bad-flags".to_owned(),
                detail: "d".to_owned(),
            },
        ),
        (
            "{\"outcome\":\"error\",\"detail\":\"wsl.exe didn't start\"}",
            WslSetupEnd::Error {
                detail: "wsl.exe didn't start".to_owned(),
            },
        ),
    ];
    for (output, expected) in cases {
        assert_eq!(
            read_wsl_setup_end(output.as_bytes()),
            Some(expected),
            "{output}"
        );
    }
}

#[test]
fn sandbox_wsl_setup_command_reads_no_answer_from_anything_else() {
    for output in [
        "",
        "\n",
        "not JSON",
        "{\"outcome\":\"installed\"}",
        "{\"outcome\":\"failed\",\"reason\":\"other\"}",
        "{\"outcome\":\"refused\",\"detail\":\"d\"}",
        "{\"outcome\":\"done\"}\nnot JSON",
        "[]",
    ] {
        assert_eq!(read_wsl_setup_end(output.as_bytes()), None, "{output}");
    }
}

#[cfg(unix)]
mod runs {
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    use super::super::{WslSetupEnd, WslSetupRun, WslSetupRuns};

    /// A stand-in host that runs `script` with `/bin/sh`, its output piped
    /// as the real command's is.
    fn stand_in(script: &str) -> Command {
        let mut command = Command::new("/bin/sh");
        command
            .arg("-c")
            .arg(script)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    #[test]
    fn sandbox_wsl_setup_command_answers_how_the_run_ended() {
        let runs = WslSetupRuns::default();
        let limit = Duration::from_secs(30);
        let done = stand_in("echo '{\"outcome\":\"done\",\"residuals\":[]}'; exit 0");
        assert_eq!(runs.run(done, limit), WslSetupRun::Ended(WslSetupEnd::Done));
        // The slot is free again once a run has ended.
        let cancelled = stand_in("echo '{\"outcome\":\"cancelled\"}'; exit 1");
        assert_eq!(
            runs.run(cancelled, limit),
            WslSetupRun::Ended(WslSetupEnd::Cancelled)
        );
        let silent = stand_in("echo oops >&2; exit 3");
        assert_eq!(runs.run(silent, limit), WslSetupRun::Unreadable(Some(3)));
    }

    #[test]
    fn sandbox_wsl_setup_command_leaves_a_slow_run_and_starts_no_second() {
        let runs = WslSetupRuns::default();
        let slow = stand_in("sleep 5");
        assert_eq!(
            runs.run(slow, Duration::from_millis(100)),
            WslSetupRun::TimedOut
        );
        let second = stand_in("echo '{\"outcome\":\"done\"}'");
        assert_eq!(
            runs.run(second, Duration::from_secs(30)),
            WslSetupRun::StillRunning
        );
    }

    #[test]
    fn sandbox_wsl_setup_command_says_when_the_host_doesnt_start() {
        let runs = WslSetupRuns::default();
        let missing = Command::new(PathBuf::from("no-such-halonic-agent-host"));
        assert!(matches!(
            runs.run(missing, Duration::from_secs(30)),
            WslSetupRun::NotStarted(_)
        ));
        // A start that failed leaves the slot free.
        let done = stand_in("echo '{\"outcome\":\"done\"}'");
        assert_eq!(
            runs.run(done, Duration::from_secs(30)),
            WslSetupRun::Ended(WslSetupEnd::Done)
        );
    }
}
