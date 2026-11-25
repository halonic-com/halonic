//! "Run with Claude" on the user's own server (HAL-17834, plan sections 2
//! to 4): the shell's half of `server_session_open`, with no Tauri types.
//!
//! It checks the server from the profile's settings and the task id as
//! `packages/core/action-steppers` does, against the same shared cases;
//! checks the brief's shape; writes the brief and a launcher that holds no
//! path into a private folder; and builds the command that opens the
//! launcher in a terminal. No brief text is ever in a command's arguments:
//! the brief reaches the server only over ssh's input.

mod brief;
mod files;
mod launcher;
mod target;
mod terminal;

pub use brief::{BriefRefusal, MAX_BRIEF_BYTES, check_brief};
pub use files::{
    FOLDER_NAME, SessionFiles, create_private_file, prepare_folder, sweep_old_files,
    write_session_files,
};
pub use launcher::{brief_file_name, launcher_file_name, render_launcher};
pub use target::{ServerTarget, TargetRefusal, is_host, is_task_id, is_user, validate_target};
#[cfg(unix)]
pub use terminal::terminal_command;
pub use terminal::{KEPT_VARIABLES, TERMINALS, Terminal, find_terminal, terminal_environment};
