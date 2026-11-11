//! Starts stand-in login shells: small scripts that act as an rc file
//! would (print, set a variable, hang) and then run the real `/bin/sh`.
#![cfg(unix)]

use halonic_login_shell::{LoginShellError, RESOLVING_VARIABLE, login_variables};
use std::ffi::OsString;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const NAMES: &[&str] = &["HALONIC_HOME", "XDG_DATA_HOME", "SEEN_RESOLVING"];
const ENOUGH: Duration = Duration::from_secs(10);
const SHORT: Duration = Duration::from_millis(300);

/// A stand-in shell named `name` that runs `rc`, then `/bin/sh` with the
/// arguments it was given.
fn shell(name: &str, rc: &str) -> PathBuf {
    let folder =
        std::env::temp_dir().join(format!("halonic-login-shell-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("make the folder");
    let path = folder.join(name);
    let script = format!(
        "#!/bin/sh\n{rc}\nexport SEEN_RESOLVING=\"${RESOLVING_VARIABLE}\"\n\
         for last; do :; done\nexec /bin/sh -c \"$last\"\n"
    );
    std::fs::write(&path, script).expect("write the shell");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    path
}

#[test]
fn login_shell_reads_a_variable_the_rc_file_sets() {
    let shell = shell(
        "sets",
        "echo 'Welcome back'\nexport HALONIC_HOME=/srv/from-rc",
    );
    let found = login_variables(&shell, NAMES, ENOUGH).expect("variables");
    assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/from-rc"));
    assert_eq!(found["SEEN_RESOLVING"], OsString::from("1"));
}

#[test]
fn login_shell_leaves_out_a_variable_nobody_sets() {
    let shell = shell("unset", "unset XDG_DATA_HOME HALONIC_HOME");
    let found = login_variables(&shell, NAMES, ENOUGH).expect("variables");
    assert!(!found.contains_key("HALONIC_HOME"));
    assert!(!found.contains_key("XDG_DATA_HOME"));
}

#[test]
fn login_shell_stops_a_shell_that_hangs() {
    let shell = shell("hangs", "sleep 30");
    let started = Instant::now();
    let error = login_variables(&shell, NAMES, SHORT).expect_err("timed out");
    assert!(matches!(error, LoginShellError::TimedOut), "{error}");
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn login_shell_doesnt_wait_for_a_program_the_rc_file_leaves_running() {
    let shell = shell("background", "export HALONIC_HOME=/srv/bg\nsleep 30 &");
    let started = Instant::now();
    let found = login_variables(&shell, NAMES, ENOUGH).expect("variables");
    assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/bg"));
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn login_shell_that_exits_early_has_no_environment() {
    let shell = shell("exits", "echo 'no environment today'\nexit 1");
    let error = login_variables(&shell, NAMES, ENOUGH).expect_err("no environment");
    assert!(matches!(error, LoginShellError::NoEnvironment), "{error}");
}

#[test]
fn login_shell_that_doesnt_exist_doesnt_start() {
    let error =
        login_variables(&PathBuf::from("/no/such/shell"), NAMES, ENOUGH).expect_err("no shell");
    assert!(matches!(error, LoginShellError::Start(_)), "{error}");
}

#[test]
fn login_shell_reads_the_real_sh() {
    // `/bin/sh` itself, with the flags a login shell gets; the variable
    // comes from this test's own environment, which the shell inherits.
    let found = login_variables(&PathBuf::from("/bin/sh"), &["HOME"], ENOUGH).expect("variables");
    assert_eq!(
        found.get("HOME"),
        std::env::var_os("HOME").as_ref(),
        "the shell's HOME"
    );
}
