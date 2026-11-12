//! Starts stand-in login shells: small scripts that act as an rc file
//! would (print, set a variable, hang) and then run the real `/bin/sh`.
#![cfg(unix)]

use halonic_login_shell::{LoginShellError, RESOLVING_VARIABLE, login_variables};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const NAMES: &[&str] = &["HALONIC_HOME", "XDG_DATA_HOME", "SEEN_RESOLVING"];
const ENOUGH: Duration = Duration::from_secs(10);
const SHORT: Duration = Duration::from_millis(300);

/// Held while a test writes a stand-in shell or starts any process. Linux
/// refuses to run a script while another thread's newly started process
/// still holds it open for writing ("Text file busy"), which tests running
/// side by side would otherwise hit now and then.
static STARTING: Mutex<()> = Mutex::new(());

/// [`login_variables`], started while no other test writes a shell.
fn ask(
    shell: &Path,
    names: &[&str],
    timeout: Duration,
) -> Result<BTreeMap<String, OsString>, LoginShellError> {
    let _starting = STARTING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    login_variables(shell, names, timeout)
}

/// A test's own folder in the temp directory, removed when the test ends.
struct Folder(PathBuf);

impl Folder {
    fn new(name: &str) -> Folder {
        let path =
            std::env::temp_dir().join(format!("halonic-login-shell-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&path).expect("make the folder");
        Folder(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    /// A stand-in shell that runs `rc`, then `/bin/sh` with the arguments
    /// it was given.
    fn shell(&self, rc: &str) -> PathBuf {
        let path = self.0.join("shell");
        let script = format!(
            "#!/bin/sh\n{rc}\nexport SEEN_RESOLVING=\"${RESOLVING_VARIABLE}\"\n\
             for last; do :; done\nexec /bin/sh -c \"$last\"\n"
        );
        let _starting = STARTING
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::fs::write(&path, script).expect("write the shell");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        path
    }
}

impl Drop for Folder {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// An rc line that starts a program in the background which, a second
/// later, leaves the file `left` in `folder`, unless it was stopped.
fn leaves_a_file_later(folder: &Folder) -> (String, PathBuf) {
    let left = folder.path().join("left");
    (format!("(sleep 1; touch '{}') &", left.display()), left)
}

#[test]
fn login_shell_reads_a_variable_the_rc_file_sets() {
    let folder = Folder::new("sets");
    let shell = folder.shell("echo 'Welcome back'\nexport HALONIC_HOME=/srv/from-rc");
    let found = ask(&shell, NAMES, ENOUGH).expect("variables");
    assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/from-rc"));
    assert_eq!(found["SEEN_RESOLVING"], OsString::from("1"));
}

#[test]
fn login_shell_leaves_out_a_variable_nobody_sets() {
    let folder = Folder::new("unset");
    let shell = folder.shell("unset XDG_DATA_HOME HALONIC_HOME");
    let found = ask(&shell, NAMES, ENOUGH).expect("variables");
    assert!(!found.contains_key("HALONIC_HOME"));
    assert!(!found.contains_key("XDG_DATA_HOME"));
}

#[test]
fn login_shell_stops_a_shell_that_hangs() {
    let folder = Folder::new("hangs");
    let shell = folder.shell("sleep 30");
    let started = Instant::now();
    let error = ask(&shell, NAMES, SHORT).expect_err("timed out");
    assert!(matches!(error, LoginShellError::TimedOut), "{error}");
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn login_shell_doesnt_wait_for_a_program_the_rc_file_leaves_running() {
    let folder = Folder::new("background");
    let shell = folder.shell("export HALONIC_HOME=/srv/bg\nsleep 30 &");
    let started = Instant::now();
    let found = ask(&shell, NAMES, ENOUGH).expect("variables");
    assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/bg"));
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn login_shell_that_hangs_is_stopped_with_what_its_rc_file_started() {
    let folder = Folder::new("hangs-group");
    let (rc, left) = leaves_a_file_later(&folder);
    let shell = folder.shell(&format!("{rc}\nsleep 30"));
    let error = ask(&shell, NAMES, SHORT).expect_err("timed out");
    assert!(matches!(error, LoginShellError::TimedOut), "{error}");
    std::thread::sleep(Duration::from_secs(2));
    assert!(!left.exists(), "the rc file's background program still ran");
}

#[test]
fn login_shell_that_answers_leaves_what_its_rc_file_started_running() {
    // An rc file may start an agent the person wants, such as `ssh-agent`.
    let folder = Folder::new("answers-group");
    let (rc, left) = leaves_a_file_later(&folder);
    let shell = folder.shell(&format!("{rc}\nexport HALONIC_HOME=/srv/agent"));
    let found = ask(&shell, NAMES, ENOUGH).expect("variables");
    assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/agent"));
    std::thread::sleep(Duration::from_secs(2));
    assert!(
        left.exists(),
        "the rc file's background program was stopped"
    );
}

#[test]
fn login_shell_that_exits_early_has_no_environment() {
    let folder = Folder::new("exits");
    let shell = folder.shell("echo 'no environment today'\nexit 1");
    let error = ask(&shell, NAMES, ENOUGH).expect_err("no environment");
    assert!(matches!(error, LoginShellError::NoEnvironment), "{error}");
}

#[test]
fn login_shell_that_doesnt_exist_doesnt_start() {
    let error = ask(&PathBuf::from("/no/such/shell"), NAMES, ENOUGH).expect_err("no shell");
    assert!(matches!(error, LoginShellError::Start(_)), "{error}");
}

/// Set for [`login_shell_from_a_terminal_probe`] when it runs under
/// `script`; without it the probe does nothing.
#[cfg(target_os = "linux")]
const IN_A_TERMINAL: &str = "HALONIC_LOGIN_SHELL_TEST_IN_A_TERMINAL";

#[cfg(target_os = "linux")]
#[test]
fn login_shell_answers_when_studio_has_a_terminal() {
    // `pnpm tauri dev`, or a Studio started from a shell, has a controlling
    // terminal. `script` gives this test binary one and runs the probe below
    // in it, with the real bash, which stops itself when it isn't in the
    // terminal's foreground (HAL-6597).
    let folder = Folder::new("terminal");
    let test = std::env::current_exe().expect("this test binary");
    // Started under the lock too: until `script` runs, its process holds
    // whatever shell another test is writing at that moment.
    let starting = STARTING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut script = std::process::Command::new("script")
        .args(["-q", "-e", "-c"])
        .arg(format!(
            "'{}' --exact login_shell_from_a_terminal_probe --ignored",
            test.display()
        ))
        .arg("/dev/null")
        .env(IN_A_TERMINAL, "1")
        .env("HOME", folder.path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("start `script`");
    drop(starting);
    let status = script.wait().expect("wait for `script`");
    assert!(status.success(), "bash didn't answer in a terminal");
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "run in a terminal by login_shell_answers_when_studio_has_a_terminal"]
fn login_shell_from_a_terminal_probe() {
    if std::env::var_os(IN_A_TERMINAL).is_none() {
        return;
    }
    let started = Instant::now();
    let found = login_variables(Path::new("/bin/bash"), &["HOME"], Duration::from_secs(3))
        .expect("bash answered");
    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(found.get("HOME"), std::env::var_os("HOME").as_ref());
}

#[test]
fn login_shell_reads_the_real_sh() {
    // `/bin/sh` itself, with the flags a login shell gets; the variable
    // comes from this test's own environment, which the shell inherits.
    let found = ask(&PathBuf::from("/bin/sh"), &["HOME"], ENOUGH).expect("variables");
    assert_eq!(
        found.get("HOME"),
        std::env::var_os("HOME").as_ref(),
        "the shell's HOME"
    );
}
