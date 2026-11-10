// What a call in a repository may ask git to do.

/** The subcommands that show diffs, and so would run the repository's diff programs. */
const showsDiffs = new Set(["diff", "log", "show", "whatchanged"]);

/**
 * The subcommands a call in a repository may run: the ones the adapter
 * uses, and the diff ones, which {@link withoutDiffPrograms} covers. Any
 * other may start a program the repository names that no override
 * reaches: `blame` runs textconv by default, `stash show -p` the external
 * diff, `add -p` the interactive diff filter. An allow-list keeps the ones
 * nobody has found yet out too.
 */
const allowedSubcommands = new Set([
  ...showsDiffs,
  "add",
  "cat-file",
  "checkout",
  "clean",
  "commit",
  "commit-tree",
  "config",
  "for-each-ref",
  "ls-files",
  "ls-tree",
  "mv",
  "pull",
  "push",
  "remote",
  "reset",
  "rev-parse",
  "rm",
  "show-ref",
  "status",
  "switch",
  "symbolic-ref",
  "write-tree",
]);

/**
 * Refuses a call whose subcommand isn't in {@link allowedSubcommands}.
 *
 * @throws Error naming the subcommand
 */
export function checkSubcommand(args: readonly string[]): void {
  const [subcommand] = args;
  if (subcommand !== undefined && allowedSubcommands.has(subcommand)) return;
  throw new Error(`The git adapter doesn't run git ${subcommand ?? "with no subcommand"}.`);
}

/**
 * `args` with `--no-ext-diff --no-textconv` after the subcommand when it
 * shows diffs, so `diff.external`, `diff.<driver>.command` and
 * `diff.<driver>.textconv` don't run. Blanking them instead would make git
 * fail with "cannot run".
 */
export function withoutDiffPrograms(args: readonly string[]): readonly string[] {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined || !showsDiffs.has(subcommand)) return args;
  return [subcommand, "--no-ext-diff", "--no-textconv", ...rest];
}
