use std::fmt;

/// Why a git call was refused or failed before git could answer.
///
/// A git call that runs and exits with an error is not a `GitError`: it
/// comes back as a [`crate::GitOutput`] with its exit code and stderr.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitError {
    /// The call had no arguments, so no subcommand.
    NoSubcommand,
    /// The first argument is not a subcommand on the allow-list. Global
    /// options such as `-c` and `--git-dir` land here too.
    SubcommandNotAllowed { subcommand: String },
    /// An option that is not on its subcommand's list, matched exactly.
    OptionNotAllowed { subcommand: String, option: String },
    /// An allowed option whose value breaks the option's rule.
    ValueNotAllowed { subcommand: String, option: String },
    /// An option that takes a value came last, with no value.
    MissingValue { subcommand: String, option: String },
    /// An argument that is not an option and that the subcommand refuses,
    /// such as a URL given to `push`.
    ArgumentNotAllowed {
        subcommand: String,
        argument: String,
    },
    /// The folder is not inside a folder the user opened.
    FolderNotOpened,
    /// The folder does not exist or cannot be read.
    FolderUnreadable,
    /// The repository's own config sets a key that makes git run a program.
    RepoConfigRunsPrograms { key: String },
    /// The empty hooks folder has files in it, so it no longer stops hooks.
    HooksFolderNotEmpty,
    /// No `git` program was found on the PATH.
    GitNotFound,
    /// git ran past its time limit and was stopped.
    TimedOut,
    /// git wrote more than the output limit and was stopped.
    OutputTooLarge,
    /// The git process could not be started or read.
    Io { message: String },
}

impl GitError {
    /// A short, stable name for the error, for the page to pick its words.
    pub fn kind(&self) -> &'static str {
        match self {
            GitError::NoSubcommand => "no_subcommand",
            GitError::SubcommandNotAllowed { .. } => "subcommand_not_allowed",
            GitError::OptionNotAllowed { .. } => "option_not_allowed",
            GitError::ValueNotAllowed { .. } => "value_not_allowed",
            GitError::MissingValue { .. } => "missing_value",
            GitError::ArgumentNotAllowed { .. } => "argument_not_allowed",
            GitError::FolderNotOpened => "folder_not_opened",
            GitError::FolderUnreadable => "folder_unreadable",
            GitError::RepoConfigRunsPrograms { .. } => "repo_config_runs_programs",
            GitError::HooksFolderNotEmpty => "hooks_folder_not_empty",
            GitError::GitNotFound => "git_not_found",
            GitError::TimedOut => "timed_out",
            GitError::OutputTooLarge => "output_too_large",
            GitError::Io { .. } => "io",
        }
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitError::NoSubcommand => write!(formatter, "no git subcommand given"),
            GitError::SubcommandNotAllowed { subcommand } => {
                write!(formatter, "git {subcommand} is not allowed")
            }
            GitError::OptionNotAllowed { subcommand, option } => {
                write!(
                    formatter,
                    "git {subcommand}: option {option} is not allowed"
                )
            }
            GitError::ValueNotAllowed { subcommand, option } => {
                write!(
                    formatter,
                    "git {subcommand}: the value of {option} is not allowed"
                )
            }
            GitError::MissingValue { subcommand, option } => {
                write!(formatter, "git {subcommand}: option {option} needs a value")
            }
            GitError::ArgumentNotAllowed {
                subcommand,
                argument,
            } => {
                write!(
                    formatter,
                    "git {subcommand}: argument {argument} is not allowed"
                )
            }
            GitError::FolderNotOpened => write!(formatter, "the folder is not an opened folder"),
            GitError::FolderUnreadable => write!(formatter, "the folder cannot be read"),
            GitError::RepoConfigRunsPrograms { key } => write!(
                formatter,
                "the repository's config sets {key}, which can run a program"
            ),
            GitError::HooksFolderNotEmpty => write!(formatter, "the empty hooks folder has files"),
            GitError::GitNotFound => write!(formatter, "git was not found"),
            GitError::TimedOut => write!(formatter, "git ran past its time limit"),
            GitError::OutputTooLarge => write!(formatter, "git wrote more than the output limit"),
            GitError::Io { message } => write!(formatter, "git could not run: {message}"),
        }
    }
}

impl std::error::Error for GitError {}
