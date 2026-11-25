//! The launcher the shell writes next to the brief and opens in a terminal,
//! rendered exactly as `renderServerSessionLauncher` in
//! `packages/core/action-steppers` renders it; both are pinned by the
//! golden launcher in the shared cases.
//!
//! It holds no path: it moves into its own folder through `$0` and uses
//! relative names, so a folder with a quote or a `%` in its name can't
//! change what runs. Its only variables are the checked host, user, port
//! and task id, and no brief text is in it. The remote commands assume a
//! POSIX-like login shell on the server, not csh or tcsh.

use crate::target::ServerTarget;

/// The folder in the user's home on the server that holds briefs.
const BRIEF_FOLDER: &str = ".halonic/briefs";

/// The local brief's file name for `task`.
pub fn brief_file_name(task: &str) -> String {
    format!("brief-{task}.md")
}

/// The launcher's file name for `task`: a `.command` file on macOS, which
/// Terminal runs when it opens it, and a `.sh` file elsewhere.
pub fn launcher_file_name(task: &str) -> String {
    let ending = if cfg!(target_os = "macos") {
        "command"
    } else {
        "sh"
    };
    format!("run-{task}.{ending}")
}

/// What the server runs to receive the brief on its input. A sweep that
/// fails doesn't fail the upload: the copy has already worked.
fn remote_upload_command(task: &str) -> String {
    format!(
        "umask 077 && mkdir -p {BRIEF_FOLDER} && cat > {BRIEF_FOLDER}/{task}.md && \
{{ find {BRIEF_FOLDER} -maxdepth 1 -type f -name \"HAL-*.md\" -mmin +60 -delete || true; }}"
    )
}

/// What the server runs to start Claude Code: no flag, only a constant
/// prompt that names the brief's file, then the brief is deleted.
fn remote_run_command(task: &str) -> String {
    format!(
        "claude \"Read the file {BRIEF_FOLDER}/{task}.md and follow it.\"; \
rm -f {BRIEF_FOLDER}/{task}.md"
    )
}

/// Renders the launcher for a checked target and a task id that has passed
/// [`is_task_id`](crate::is_task_id).
pub fn render_launcher(target: &ServerTarget, task: &str) -> String {
    let options = target
        .port()
        .map(|port| format!("-p {port} "))
        .unwrap_or_default();
    let destination = format!("'{}@{}'", target.user(), target.host());
    [
        "#!/bin/sh".to_owned(),
        "cd -- \"$(dirname -- \"$0\")\" || exit 1".to_owned(),
        format!(
            "ssh {options}-- {destination} '{}' < ./brief-{task}.md",
            remote_upload_command(task)
        ),
        "upload=$?".to_owned(),
        format!("rm -f -- ./brief-{task}.md ./run-{task}.command ./run-{task}.sh"),
        "if [ \"$upload\" -ne 0 ]; then".to_owned(),
        "  echo 'Halonic: the brief could not be copied to the server, so Claude Code was not started.'".to_owned(),
        "  exit 1".to_owned(),
        "fi".to_owned(),
        format!(
            "exec ssh -t {options}-- {destination} '{}'",
            remote_run_command(task)
        ),
        String::new(),
    ]
    .join("\n")
}
