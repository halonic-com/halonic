//! Runs the real launcher against a stand-in `ssh` that records its
//! arguments and its input, from a folder whose name holds every character
//! that could break a path in a script, and checks the terminal's command.
#![cfg(unix)]
#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, PoisonError};

use halonic_server_session::{
    TERMINALS, find_terminal, prepare_folder, render_launcher, terminal_command,
    terminal_environment, validate_target, write_session_files,
};
use serde_json::json;

static NEXT_FOLDER: AtomicU32 = AtomicU32::new(0);

/// One launch at a time. A test that writes a program while another starts
/// a process can have that process inherit the open file for a moment, and
/// Linux then refuses to run the program ("Text file busy").
static ONE_LAUNCH: Mutex<()> = Mutex::new(());

/// A parent folder with `'`, a space, `&`, `%`, `"` and `^` in its name.
const AWKWARD_NAME: &str = "acme's data & 100% \"x\" ^y";

/// A stand-in `ssh`: it writes its arguments, one per line, to `argv-<n>`
/// and, for the upload (no `-t`), its input to `stdin-<n>`, then exits with
/// `FAKE_SSH_EXIT`.
const FAKE_SSH: &str = r#"#!/bin/sh
n=$(ls "$FAKE_SSH_LOG" | grep -c '^argv-')
printf '%s\n' "$@" > "$FAKE_SSH_LOG/argv-$n"
case " $* " in
  *" -t "*) ;;
  *) cat > "$FAKE_SSH_LOG/stdin-$n" ;;
esac
exit "${FAKE_SSH_EXIT:-0}"
"#;

/// The brief, holding everything that could break a command line.
const BRIEF: &str = "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\n\
1. It's done'; rm -rf ~; echo '\n2. Say \"$(id)\" and `id` and $HOME ; && | >\n\
3. -oProxyCommand=sh --dangerously-skip-permissions\n";

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let number = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
        let folder = std::env::temp_dir().join(format!(
            "halonic-server-session-run-{name}-{}-{number}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("make the folder");
        Self(folder)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct Launch {
    output: Output,
    folder: PathBuf,
    log: PathBuf,
}

/// Writes the brief and the launcher as the shell does, under a parent
/// folder with an awkward name, and runs the launcher as a terminal would:
/// by its path, with the stand-in `ssh` first on `PATH`.
fn launch(scratch: &Scratch, ssh_exit: u8) -> Launch {
    let _turn = ONE_LAUNCH.lock().unwrap_or_else(PoisonError::into_inner);
    let bin = scratch.0.join("bin");
    let log = scratch.0.join("log");
    fs::create_dir_all(&bin).expect("make bin");
    fs::create_dir_all(&log).expect("make log");
    let ssh = bin.join("ssh");
    fs::write(&ssh, FAKE_SSH).expect("write ssh");
    fs::set_permissions(&ssh, std::os::unix::fs::PermissionsExt::from_mode(0o755))
        .expect("make ssh runnable");
    let folder = prepare_folder(&scratch.0.join(AWKWARD_NAME)).expect("the folder is made");
    let target = validate_target(
        Some(&json!("build.acme.example")),
        Some(&json!("ops")),
        Some(&json!(2222)),
    )
    .expect("a valid target");
    let launcher = render_launcher(&target, "HAL-1234");
    let files = write_session_files(&folder, "HAL-1234", BRIEF, &launcher).expect("written");
    let path = format!(
        "{}:{}",
        bin.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(files.launcher())
        .current_dir(&scratch.0)
        .env("PATH", path)
        .env("FAKE_SSH_LOG", &log)
        .env("FAKE_SSH_EXIT", ssh_exit.to_string())
        .output()
        .expect("the launcher runs");
    Launch {
        output,
        folder,
        log,
    }
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

#[test]
fn launch_uploads_the_brief_and_starts_claude_from_an_awkward_folder() {
    let scratch = Scratch::new("ok");
    let launch = launch(&scratch, 0);
    assert!(
        launch.output.status.success(),
        "{launch_output:?}",
        launch_output = launch.output
    );
    let upload = read(&launch.log.join("argv-0"));
    let mut upload_lines = upload.lines();
    assert_eq!(upload_lines.next(), Some("-p"));
    assert_eq!(upload_lines.next(), Some("2222"));
    assert_eq!(upload_lines.next(), Some("--"));
    assert_eq!(upload_lines.next(), Some("ops@build.acme.example"));
    assert!(
        upload_lines
            .next()
            .is_some_and(|command| command.starts_with("umask 077 && "))
    );
    assert_eq!(read(&launch.log.join("stdin-0")), BRIEF);
    let run = read(&launch.log.join("argv-1"));
    assert_eq!(
        run.lines().collect::<Vec<_>>(),
        [
            "-t",
            "-p",
            "2222",
            "--",
            "ops@build.acme.example",
            "claude \"Read the file .halonic/briefs/HAL-1234.md and follow it.\"; rm -f .halonic/briefs/HAL-1234.md",
        ]
    );
    let left: Vec<_> = fs::read_dir(&launch.folder)
        .expect("read the folder")
        .collect();
    assert!(left.is_empty(), "the launcher removes its files: {left:?}");
}

#[test]
fn launch_never_starts_claude_when_the_upload_fails() {
    let scratch = Scratch::new("failed");
    let launch = launch(&scratch, 1);
    assert_eq!(launch.output.status.code(), Some(1));
    let said = String::from_utf8_lossy(&launch.output.stdout);
    assert!(said.contains("Claude Code was not started"), "{said}");
    assert!(launch.log.join("argv-0").exists(), "the upload ran");
    assert!(
        !launch.log.join("argv-1").exists(),
        "no second ssh started claude"
    );
    let left: Vec<_> = fs::read_dir(&launch.folder)
        .expect("read the folder")
        .collect();
    assert!(left.is_empty(), "the launcher removes its files: {left:?}");
}

#[test]
fn launch_passes_only_the_launchers_path_to_the_terminal() {
    let launcher = Path::new("/data/acme data/server-session/run-HAL-1234.sh");
    for terminal in TERMINALS {
        let command = terminal_command(Path::new("/usr/bin/terminal"), terminal, launcher, &[]);
        assert_eq!(command.get_program(), "/usr/bin/terminal");
        let arguments: Vec<_> = command.get_args().collect();
        let (last, fixed) = arguments.split_last().expect("the launcher is last");
        assert_eq!(*last, launcher.as_os_str());
        assert_eq!(fixed, terminal.arguments);
        for argument in &arguments {
            let argument = argument.to_string_lossy();
            for line in BRIEF.lines() {
                assert!(!argument.contains(line), "{argument} holds brief text");
            }
        }
    }
}

#[test]
fn launch_pins_each_terminals_arguments() {
    let pinned: Vec<(&str, Vec<&str>)> = TERMINALS
        .iter()
        .map(|terminal| (terminal.program, terminal.arguments.to_vec()))
        .collect();
    let expected: Vec<(&str, Vec<&str>)> = if cfg!(target_os = "macos") {
        vec![("open", vec!["-a", "Terminal"])]
    } else {
        vec![
            ("gnome-terminal", vec!["--", "/bin/sh"]),
            ("konsole", vec!["-e", "/bin/sh"]),
            ("x-terminal-emulator", vec!["-e", "/bin/sh"]),
            ("xterm", vec!["-e", "/bin/sh"]),
        ]
    };
    assert_eq!(pinned, expected);
}

#[test]
fn launch_gives_the_terminal_only_path_and_the_kept_variables() {
    let studio: HashMap<&str, &str> = [
        ("HOME", "~ops"),
        ("DISPLAY", ":0"),
        ("SSH_AUTH_SOCK", "agent.sock"),
        ("ACME_TOKEN", "studio-only"),
        ("LD_PRELOAD", "acme.so"),
    ]
    .into_iter()
    .collect();
    let environment = terminal_environment(OsString::from("/usr/bin:/bin"), |name| {
        studio.get(name).map(OsString::from)
    });
    let names: Vec<_> = environment
        .iter()
        .map(|(name, _)| name.to_str().expect("a name"))
        .collect();
    assert_eq!(names, ["PATH", "HOME", "DISPLAY", "SSH_AUTH_SOCK"]);
    let launcher = Path::new("/data/acme/server-session/run-HAL-1234.sh");
    let command = terminal_command(
        Path::new("/usr/bin/xterm"),
        &TERMINALS[0],
        launcher,
        &environment,
    );
    let set: Vec<_> = command
        .get_envs()
        .filter(|(_, value)| value.is_some())
        .collect();
    assert_eq!(set.len(), 4);
    assert!(
        set.iter()
            .all(|(name, _)| *name != "ACME_TOKEN" && *name != "LD_PRELOAD")
    );
}

#[test]
fn launch_looks_for_terminals_in_usr_bin_before_the_path() {
    // A program named like a terminal in a folder on PATH, as in ~/bin.
    let scratch = Scratch::new("terminal");
    let fake = scratch.0.join("xterm");
    fs::write(&fake, "#!/bin/sh\n").expect("write the fake terminal");
    fs::set_permissions(&fake, std::os::unix::fs::PermissionsExt::from_mode(0o755))
        .expect("make it runnable");
    let found = find_terminal(scratch.0.as_os_str()).map(|(program, _)| program);
    let system = TERMINALS
        .iter()
        .any(|terminal| Path::new("/usr/bin").join(terminal.program).is_file());
    if system || cfg!(target_os = "macos") {
        // The system's terminal wins; macOS never looks on PATH at all.
        assert!(
            found
                .as_ref()
                .is_none_or(|program| program.starts_with("/usr/bin")),
            "{found:?}"
        );
    } else {
        assert_eq!(found, Some(fake));
    }
}
