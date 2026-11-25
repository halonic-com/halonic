//! The command that runs the agent host's engine role for one workspace
//! (B1, design note D1 of HAL-14206).

use std::path::Path;
use std::process::Command;

use crate::console_window::new_command;

/// `<executable> --engine --profile-folder <p> --workspace <w>`, both folders
/// absolute. Nothing else goes on its command line: secrets come over its
/// control pipe. On Windows it starts without a console window.
pub fn engine_command(executable: &Path, profile_folder: &Path, workspace: &Path) -> Command {
    let mut command = new_command(executable);
    command
        .arg("--engine")
        .arg("--profile-folder")
        .arg(profile_folder)
        .arg("--workspace")
        .arg(workspace);
    command
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::engine_command;

    #[test]
    fn names_exactly_the_engine_role_and_its_two_folders() {
        let command = engine_command(
            Path::new("halonic-agent-host"),
            Path::new("<profile>"),
            Path::new("<workspace>"),
        );
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(
            args,
            [
                "--engine",
                "--profile-folder",
                "<profile>",
                "--workspace",
                "<workspace>",
            ]
        );
    }
}
