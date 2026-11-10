/** One git config entry, as `[key, value]`. */
export type ConfigEntry = readonly [key: string, value: string];

/**
 * Config every call gets after `core.hooksPath`, whatever the repository's
 * own config says (the `Vcs` port's hardening list). It is given in the
 * environment (`GIT_CONFIG_COUNT`), which beats every config file and,
 * unlike `-c`, takes any key as it is. The same list as the desktop's
 * `git-guard` (`runner.rs`).
 */
export const hardeningConfig: readonly ConfigEntry[] = [
  ["core.fsmonitor", "false"],
  // Signing and checking signatures run the gpg, x509 or ssh signing
  // programs, and `gpg.ssh.defaultKeyCommand`.
  ["commit.gpgSign", "false"],
  ["tag.gpgSign", "false"],
  ["push.gpgSign", "false"],
  ["log.showSignature", "false"],
  ["merge.verifySignatures", "false"],
  // git never goes into a submodule to fetch, check out, push or sum up:
  // there it would read the submodule's own config.
  ["submodule.recurse", "false"],
  ["fetch.recurseSubmodules", "false"],
  ["push.recurseSubmodules", "no"],
  ["status.submoduleSummary", "false"],
  // `diff.submodule=diff` would run `git diff` inside each submodule,
  // without `--no-ext-diff` and `--no-textconv`.
  ["diff.submodule", "short"],
  // Run through the shell for every alternate when fetching; `true` names
  // no refs, which only loses a shortcut.
  ["core.alternateRefsCommand", "true"],
  // No automatic maintenance after `commit` or `pull`: it runs
  // `gc.recentObjectsHook`, and `gc` detaches from the process group the
  // time limit stops.
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
  // A bundle named here is read on `pull`, from any file, and its objects
  // and refs go into the repository, ready to be pushed. Empty: none.
  ["fetch.bundleURI", ""],
  // A cookie file the repository names is never written to.
  ["http.saveCookies", "false"],
  // Only Halonic's own helper may follow; the repository's are blanked too.
  ["credential.helper", ""],
  // The message is the one given, never a file `commit.template` names.
  ["commit.template", ""],
  // With no user config git still reads `$XDG_CONFIG_HOME/git/ignore` and
  // `git/attributes` (or under `$HOME/.config`). Neither is the
  // workspace's: the first would hide files from a snapshot, the second
  // could name a diff or filter driver. Empty: neither is read.
  ["core.excludesFile", ""],
  ["core.attributesFile", ""],
];

/**
 * Environment every call gets, after every inherited `GIT_*` variable is
 * removed, so nothing interactive starts and no config outside the
 * repository is read.
 */
export const hardeningEnvironment: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: "0",
  // No system or user config: neither is the workspace's, and either could
  // name a program. git maps `/dev/null` to `nul` on Windows.
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_PAGER: "cat",
  // An editor that changes nothing, so a call that would open one goes on
  // at once instead of waiting.
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  // Empty: git asks no program for a password, and doesn't fall back to
  // `core.askPass` or `SSH_ASKPASS`.
  GIT_ASKPASS: "",
  // `core.sshCommand` and `ssh.variant` from the repository don't apply.
  GIT_SSH_COMMAND: "ssh",
  // Only https and ssh, whatever `protocol.*` the config sets. No `ext::`
  // command, and no local remote: git runs a local remote's own hooks and
  // config, which no setting here reaches.
  GIT_ALLOW_PROTOCOL: "https:ssh",
  // Every path is a file name, never a pattern or `:(…)` magic.
  GIT_LITERAL_PATHSPECS: "1",
  // Messages in English, so the adapter's errors read the same everywhere.
  LC_ALL: "C",
};

/**
 * The environment for one git call: `inherited` without any `GIT_*`
 * variable (Windows names ignore case, so the match does too), then the
 * hardening, then `config` given as `GIT_CONFIG_COUNT`,
 * `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>`.
 */
export function hardenedEnvironment(
  inherited: Readonly<Record<string, string | undefined>>,
  extra: Readonly<Record<string, string>>,
  config: readonly ConfigEntry[],
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) {
    if (value === undefined || name.toUpperCase().startsWith("GIT_")) continue;
    environment[name] = value;
  }
  Object.assign(environment, hardeningEnvironment, extra);
  environment["GIT_CONFIG_COUNT"] = String(config.length);
  for (const [index, [key, value]] of config.entries()) {
    environment[`GIT_CONFIG_KEY_${index}`] = key;
    environment[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return environment;
}
