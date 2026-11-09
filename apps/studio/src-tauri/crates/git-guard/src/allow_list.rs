//! The git calls the Studio may make: each subcommand with its own list of
//! options. Anything not listed here is refused (requirement
//! `git-allow-list`).
//!
//! The list follows what the git adapter needs. Options that read or write
//! files outside the repository (`--output`, `-F`, `--pathspec-from-file`,
//! `--no-index`, `--template`), take a URL or a program (`--upload-pack`,
//! `--receive-pack`, `--exec`, `--repo`), or run a program (`--ext-diff`,
//! `--textconv`, `-S`) are left out on purpose.

/// What an option's value may be.
#[derive(Debug, Clone, Copy)]
pub(crate) enum ValueRule {
    /// Free text: a commit message, a format string, a search pattern.
    Text,
    /// Digits only.
    Number,
    /// One of a fixed set of words.
    OneOf(&'static [&'static str]),
    /// A branch name: letters, digits, `.`, `_`, `/` and `-`, not starting
    /// with `-`, `.` or `/`, and without `..`.
    BranchName,
}

/// One allowed option, matched exactly.
#[derive(Debug, Clone, Copy)]
pub(crate) enum AllowedOption {
    /// An option with no value, such as `--cached`.
    Flag(&'static str),
    /// A long option whose value follows `=`, such as `--format=%H`.
    Joined(&'static str, ValueRule),
    /// A short option whose value is the next argument, such as `-m text`.
    Separate(&'static str, ValueRule),
}

/// What the arguments that are not options may be.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Arguments {
    /// None at all.
    None,
    /// Revisions and paths, with `--` before paths allowed.
    RevisionsAndPaths,
    /// A remote name, then branch names or refspecs. No URLs, no `--`.
    RemoteAndRefs,
    /// `remote`'s own forms, checked by `check_remote`.
    RemoteCommand,
}

/// One allowed subcommand.
#[derive(Debug)]
pub(crate) struct AllowedSubcommand {
    pub name: &'static str,
    pub options: &'static [AllowedOption],
    pub arguments: Arguments,
    /// Talks to another machine, so it gets the longer time limit.
    pub uses_network: bool,
    /// Shows diffs: it also takes the shared [`DIFF_OPTIONS`], and always
    /// gets `--no-ext-diff` and `--no-textconv`.
    pub shows_diffs: bool,
}

use AllowedOption::{Flag, Joined, Separate};
use ValueRule::{BranchName, Number, OneOf, Text};

const UNTRACKED_MODES: &[&str] = &["no", "normal", "all"];
const PORCELAIN_VERSIONS: &[&str] = &["v1", "v2"];
const DATE_FORMATS: &[&str] = &[
    "relative",
    "local",
    "iso",
    "iso-strict",
    "rfc",
    "short",
    "raw",
    "unix",
];

/// The diff options `diff` and `log` share.
pub(crate) const DIFF_OPTIONS: &[AllowedOption] = &[
    Flag("--name-only"),
    Flag("--name-status"),
    Flag("--stat"),
    Flag("--numstat"),
    Flag("--patch"),
    Flag("-p"),
    Flag("--no-color"),
    Flag("--binary"),
    Flag("-z"),
    Flag("--find-renames"),
    Flag("-M"),
    Joined("--unified", Number),
    Joined("--diff-filter", Text),
];

/// Every subcommand the Studio may run, in no particular order.
pub(crate) const ALLOWED_SUBCOMMANDS: &[AllowedSubcommand] = &[
    AllowedSubcommand {
        name: "status",
        options: &[
            Flag("--porcelain"),
            Joined("--porcelain", OneOf(PORCELAIN_VERSIONS)),
            Flag("--short"),
            Flag("-s"),
            Flag("--branch"),
            Flag("-b"),
            Flag("-z"),
            Flag("--ignored"),
            Joined("--untracked-files", OneOf(UNTRACKED_MODES)),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "diff",
        options: &[Flag("--cached"), Flag("--staged")],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: true,
    },
    AllowedSubcommand {
        name: "log",
        options: &[
            Flag("--oneline"),
            Flag("--all"),
            Flag("--follow"),
            Flag("--no-merges"),
            Flag("--decorate"),
            Separate("-n", Number),
            Joined("--max-count", Number),
            Joined("--skip", Number),
            Joined("--format", Text),
            Joined("--pretty", Text),
            Joined("--date", OneOf(DATE_FORMATS)),
            Joined("--since", Text),
            Joined("--until", Text),
            Joined("--author", Text),
            Joined("--grep", Text),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: true,
    },
    AllowedSubcommand {
        name: "add",
        options: &[
            Flag("--all"),
            Flag("-A"),
            Flag("--update"),
            Flag("-u"),
            Flag("--intent-to-add"),
            Flag("-N"),
            Flag("--force"),
            Flag("-f"),
            Flag("--dry-run"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "reset",
        options: &[
            Flag("--soft"),
            Flag("--mixed"),
            Flag("--hard"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "rm",
        options: &[
            Flag("--cached"),
            Flag("-r"),
            Flag("--force"),
            Flag("-f"),
            Flag("-q"),
            Flag("--quiet"),
            Flag("--ignore-unmatch"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "checkout",
        options: &[
            Separate("-b", BranchName),
            Separate("-B", BranchName),
            Flag("--force"),
            Flag("-f"),
            Flag("--ours"),
            Flag("--theirs"),
            Flag("--detach"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "switch",
        options: &[
            Separate("-c", BranchName),
            Separate("-C", BranchName),
            Flag("--detach"),
            Flag("--discard-changes"),
            Flag("--force"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "clean",
        options: &[
            Flag("--force"),
            Flag("-f"),
            Flag("-d"),
            Flag("-x"),
            Flag("-X"),
            Flag("--dry-run"),
            Flag("-n"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "commit",
        options: &[
            Separate("-m", Text),
            Joined("--message", Text),
            Joined("--author", Text),
            Flag("--amend"),
            Flag("--no-edit"),
            Flag("--allow-empty"),
            Flag("--allow-empty-message"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "branch",
        options: &[
            Flag("--list"),
            Flag("--show-current"),
            Flag("--all"),
            Flag("-a"),
            Flag("--remotes"),
            Flag("-r"),
            Flag("-d"),
            Flag("-D"),
            Flag("--delete"),
            Separate("-m", BranchName),
            Joined("--format", Text),
            Joined("--set-upstream-to", BranchName),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "init",
        options: &[
            Separate("-b", BranchName),
            Joined("--initial-branch", BranchName),
            Flag("-q"),
            Flag("--quiet"),
        ],
        // No folder argument: init works only in the opened folder itself.
        arguments: Arguments::None,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "rev-parse",
        options: &[
            Flag("--show-toplevel"),
            Flag("--is-inside-work-tree"),
            Flag("--abbrev-ref"),
            Flag("--symbolic-full-name"),
            Flag("--verify"),
            Flag("--short"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "ls-files",
        options: &[
            Flag("--cached"),
            Flag("-c"),
            Flag("--others"),
            Flag("-o"),
            Flag("--deleted"),
            Flag("--modified"),
            Flag("--exclude-standard"),
            Flag("--full-name"),
            Flag("--error-unmatch"),
            Flag("-z"),
        ],
        arguments: Arguments::RevisionsAndPaths,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "remote",
        options: &[Flag("-v"), Flag("--verbose")],
        arguments: Arguments::RemoteCommand,
        uses_network: false,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "pull",
        options: &[
            Flag("--ff-only"),
            Flag("--rebase"),
            Flag("--no-rebase"),
            Flag("--no-edit"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RemoteAndRefs,
        uses_network: true,
        shows_diffs: false,
    },
    AllowedSubcommand {
        name: "push",
        options: &[
            Flag("--set-upstream"),
            Flag("-u"),
            Flag("--force-with-lease"),
            Flag("--tags"),
            Flag("--delete"),
            Flag("--dry-run"),
            Flag("--porcelain"),
            Flag("-q"),
            Flag("--quiet"),
        ],
        arguments: Arguments::RemoteAndRefs,
        uses_network: true,
        shows_diffs: false,
    },
];

/// Finds an allowed subcommand by its exact name.
pub(crate) fn find_subcommand(name: &str) -> Option<&'static AllowedSubcommand> {
    ALLOWED_SUBCOMMANDS
        .iter()
        .find(|subcommand| subcommand.name == name)
}
