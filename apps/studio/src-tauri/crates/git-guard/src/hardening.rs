//! The config and environment the runner gives every git call
//! (requirement `git-hardening`).

/// Config the runner gives every call (requirement `git-hardening`), after
/// `core.hooksPath` and before what neutralises the repository's own config. It is given in the environment (`GIT_CONFIG_COUNT`),
/// which beats every config file and, unlike `-c`, takes any key as it is.
/// The system and the user's global config still apply otherwise, because
/// commits need `user.name`, push needs the credential helper, and the
/// working tree needs `core.autocrlf`: Git for Windows and Homebrew's git
/// keep those in the system config. Only the person or an administrator can
/// write either file, never the opened folder, and every key here beats
/// both.
pub(crate) const HARDENING_CONFIG: &[(&str, &str)] = &[
    ("core.fsmonitor", "false"),
    // Signing and checking signatures run the gpg, x509 or ssh signing
    // programs, and `gpg.ssh.defaultKeyCommand`.
    ("commit.gpgSign", "false"),
    ("tag.gpgSign", "false"),
    ("push.gpgSign", "false"),
    ("log.showSignature", "false"),
    ("merge.verifySignatures", "false"),
    // git never goes into a submodule to fetch, check out, push or sum up:
    // there it would read the submodule's own config.
    ("submodule.recurse", "false"),
    ("fetch.recurseSubmodules", "false"),
    ("push.recurseSubmodules", "no"),
    ("status.submoduleSummary", "false"),
    // `diff.submodule=diff` would run `git diff` inside each submodule,
    // without `--no-ext-diff` and `--no-textconv`.
    ("diff.submodule", "short"),
    // Run through the shell for every alternate when fetching; `true`
    // names no refs, which only loses a shortcut.
    ("core.alternateRefsCommand", "true"),
    // No automatic maintenance after `commit` or `pull`: it runs
    // `gc.recentObjectsHook`, and `gc` detaches from the process group the
    // time limit stops.
    ("maintenance.auto", "false"),
    ("gc.auto", "0"),
    // A bundle named here is read on `pull`, from any file, and its objects
    // and refs go into the repository, ready to be pushed. Empty: none.
    ("fetch.bundleURI", ""),
    // A cookie file the repository names is never written to.
    ("http.saveCookies", "false"),
];

/// Environment the runner sets after removing every inherited `GIT_*`
/// variable, so nothing interactive can start.
pub(crate) const HARDENING_ENVIRONMENT: &[(&str, &str)] = &[
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GIT_PAGER", "cat"),
    // An editor that changes nothing, so a call that would open one goes
    // on at once instead of waiting.
    ("GIT_EDITOR", "true"),
    ("GIT_SEQUENCE_EDITOR", "true"),
    // Empty: git asks no program for a password, and does not fall back to
    // `core.askPass` or `SSH_ASKPASS`.
    ("GIT_ASKPASS", ""),
    // Only https and ssh, whatever `protocol.*` the config sets. No `ext::`
    // command, and no local remote: git runs a local remote's own hooks and
    // config, which no setting here reaches.
    ("GIT_ALLOW_PROTOCOL", "https:ssh"),
    // git never fetches an object it lacks from a remote on its own, so a
    // call that only reads the repository never connects anywhere. git
    // before 2.44 ignores it; the repository's partial-clone keys are
    // refused for that (requirement `no-lazy-fetch`).
    ("GIT_NO_LAZY_FETCH", "1"),
    // Every path is a file name, never a pattern or `:(…)` magic.
    ("GIT_LITERAL_PATHSPECS", "1"),
];
