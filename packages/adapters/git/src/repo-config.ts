import type { ConfigEntry } from "./hardening.ts";

/** One entry of `git config --list --show-scope --includes -z`. */
export interface ListedConfig {
  /** `local`, `worktree`, `command` and so on. */
  scope: string;
  /** The key as git writes it: section and name in lower case, the subsection as it is. */
  key: string;
  value: string;
}

/** Scopes that come from the repository itself; with no system or user config, every other is the adapter's own. */
const repositoryScopes = new Set(["local", "worktree"]);

/**
 * Keys naming one program each, and the value git uses when none is set.
 * A repository's value goes back to that default: no user config is read.
 */
const programKeys: readonly ConfigEntry[] = [
  ["core.sshCommand", "ssh"],
  ["gpg.program", "gpg"],
  ["gpg.openpgp.program", "gpg"],
  ["gpg.x509.program", "gpgsm"],
  ["gpg.ssh.program", "ssh-keygen"],
  ["gpg.ssh.defaultKeyCommand", ""],
];

/**
 * Keys naming the program at the other end of a remote, per remote, and
 * git's default. `pull` and `push` name the program themselves too; this
 * covers every other call that reaches a remote.
 */
const remoteProgramKeys: readonly ConfigEntry[] = [
  ["uploadpack", "git-upload-pack"],
  ["receivepack", "git-receive-pack"],
];

/** A merge driver that always reports a conflict; git runs it through its shell, which has `exit` built in. */
const conflictMergeDriver = "exit 1";

/** Reads the output of `git config --list --show-scope --includes -z`. */
export function parseConfigListing(listing: Buffer): ListedConfig[] {
  const fields = listing.toString("utf8").split("\0");
  const entries: ListedConfig[] = [];
  for (let at = 0; at + 1 < fields.length; at += 2) {
    const scope = fields[at] ?? "";
    const entry = fields[at + 1] ?? "";
    // A key and its value are split by the first newline; a key with no value has none.
    const newline = entry.indexOf("\n");
    entries.push({
      scope,
      key: newline === -1 ? entry : entry.slice(0, newline),
      value: newline === -1 ? "" : entry.slice(newline + 1),
    });
  }
  return entries;
}

/**
 * Refuses a repository whose own config sets a key no override neutralises
 * safely (see {@link isRefusedKey}).
 *
 * @throws Error naming the key
 */
export function checkRefusedKeys(entries: readonly ListedConfig[]): void {
  const refused = fromRepository(entries).find((entry) => isRefusedKey(entry.key));
  if (refused !== undefined) {
    throw new Error(
      `The repository's config sets ${refused.key}, which Halonic doesn't allow. Remove it from .git/config and try again.`,
    );
  }
}

/**
 * Whether the repository may not set `key` at all:
 *
 * - `branch.<name>.mergeOptions`, which the `git merge` behind `pull` reads
 *   as options, so `-F <file>` would make any file the merge commit's
 *   message. An empty value from the adapter doesn't override it.
 * - `include.path` and `includeIf.<condition>.path`, which bring in config
 *   from a file the workspace can change, or only once a `checkout` or
 *   `merge` has run, after the listing the call was checked against.
 * - `url.<base>.insteadOf` and `pushInsteadOf`, which send `pull` and
 *   `push` to another server than the remote the person sees.
 * - `http.sslVerify`, `http.sslCAInfo` and `http.sslCAPath`, also per URL
 *   (`http.<url>.sslVerify`), which turn the certificate check off or
 *   trust the repository's own authority. With either, a proxy or anyone
 *   on the network reads what git sends. A per-URL key beats the same key
 *   from the adapter, so it can't be overridden.
 * - Every `hook.<name>.*` key: newer git runs `hook.<name>.command` as a
 *   hook, and nothing says `core.hooksPath` covers it.
 */
function isRefusedKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower === "include.path" || lower.startsWith("hook.")) return true;
  if (subsectionKey(key, "includeif")?.name.toLowerCase() === "path") return true;
  if (subsectionKey(key, "branch")?.name.toLowerCase() === "mergeoptions") return true;
  const url = subsectionKey(key, "url")?.name.toLowerCase();
  if (url === "insteadof" || url === "pushinsteadof") return true;
  return weakensCertificateCheck(lower);
}

/** `http.<name>` or `http.<url>.<name>` for a name that weakens the certificate check; `key` in lower case. */
function weakensCertificateCheck(key: string): boolean {
  if (!key.startsWith("http.")) return false;
  const name = key.slice(key.lastIndexOf(".") + 1);
  return name === "sslverify" || name === "sslcainfo" || name === "sslcapath";
}

/** The names of the filter drivers the repository's own config defines. */
export function filterNames(entries: readonly ListedConfig[]): string[] {
  const names = new Set<string>();
  for (const entry of fromRepository(entries)) {
    const filter = subsectionKey(entry.key, "filter");
    if (filter !== null) names.add(filter.subsection);
  }
  return [...names];
}

/** Config that blanks the given filter drivers: a blank command is no filter, so content goes in and out as it is. */
export function blankFilters(names: readonly string[]): ConfigEntry[] {
  return names.flatMap((name): ConfigEntry[] => [
    [`filter.${name}.clean`, ""],
    [`filter.${name}.smudge`, ""],
    [`filter.${name}.process`, ""],
    [`filter.${name}.required`, "false"],
  ]);
}

/**
 * Config that neutralises every other program the repository's own config
 * names: its merge drivers report a conflict, and each key in
 * {@link programKeys} and {@link remoteProgramKeys} goes back to git's
 * default.
 */
export function neutralisePrograms(entries: readonly ListedConfig[]): ConfigEntry[] {
  const repository = fromRepository(entries);
  const overrides = new Map<string, string>();
  for (const entry of repository) {
    const merge = subsectionKey(entry.key, "merge");
    if (merge?.name.toLowerCase() === "driver") {
      overrides.set(`merge.${merge.subsection}.driver`, conflictMergeDriver);
    }
    const remote = subsectionKey(entry.key, "remote");
    const fallback = remoteProgramKeys.find(([name]) => name === remote?.name.toLowerCase());
    if (remote !== null && fallback !== undefined) {
      overrides.set(`remote.${remote.subsection}.${fallback[0]}`, fallback[1]);
    }
  }
  for (const [key, fallback] of programKeys) {
    if (repository.some((entry) => sameKey(entry.key, key))) overrides.set(key, fallback);
  }
  return [...overrides];
}

/** Whether git listed the adapter's own `key` with scope `command`: git before 2.31 ignores config given in the environment. */
export function hasCommandEntry(entries: readonly ListedConfig[], key: string): boolean {
  return entries.some((entry) => entry.scope === "command" && sameKey(entry.key, key));
}

function fromRepository(entries: readonly ListedConfig[]): ListedConfig[] {
  return entries.filter((entry) => repositoryScopes.has(entry.scope));
}

/** Section and name ignore case; the subsection doesn't, and git lists the section and name in lower case. */
function sameKey(listed: string, key: string): boolean {
  return listed.toLowerCase() === key.toLowerCase();
}

/** Splits `<section>.<subsection>.<name>` for the given section; the subsection may hold dots. */
function subsectionKey(key: string, section: string): { subsection: string; name: string } | null {
  const firstDot = key.indexOf(".");
  const lastDot = key.lastIndexOf(".");
  if (firstDot === -1 || lastDot === firstDot) return null;
  if (key.slice(0, firstDot).toLowerCase() !== section) return null;
  return { subsection: key.slice(firstDot + 1, lastDot), name: key.slice(lastDot + 1) };
}
