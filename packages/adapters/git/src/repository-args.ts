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
 * Options that read or write the file they name, which can be anywhere,
 * for every subcommand, and those of one subcommand only. Long ones are
 * refused abbreviated too, as git takes `--fil` for `--file`.
 */
const fileOptions = ["output", "file", "pathspec-from-file", "template"];
const refusedLongOptions: Readonly<Record<string, readonly string[]>> = {
  // `add --force` records an ignored nested repository, which the checks don't list.
  add: [...fileOptions, "force"],
  // `cat-file --textconv` runs `diff.<driver>.textconv`, with no `--no-textconv` to beat it.
  "cat-file": [...fileOptions, "textconv"],
};
const refusedShortOptions: Readonly<Record<string, string>> = {
  add: "f",
  commit: "Ft",
  config: "f",
};

/** Where git stops reading options: the first `--` or `--end-of-options`, or the end. */
function endOfOptions(args: readonly string[]): number {
  const end = args.findIndex((arg) => arg === "--" || arg === "--end-of-options");
  return end === -1 ? args.length : end;
}

/**
 * Refuses a call with an option that reads or writes a file it names (see
 * {@link refusedLongOptions} and {@link refusedShortOptions}). A short one
 * is refused anywhere in a bundle such as `-aF`, even where it would be a
 * value: the adapter gives values in long options.
 *
 * @throws Error naming the option
 */
export function checkOptions(args: readonly string[]): void {
  const [subcommand = "", ...rest] = args.slice(0, endOfOptions(args));
  const long = refusedLongOptions[subcommand] ?? fileOptions;
  const short = refusedShortOptions[subcommand] ?? "";
  for (const arg of rest) {
    const refused = arg.startsWith("--")
      ? isAbbreviationOf(arg.slice(2).split("=")[0] ?? "", long)
      : arg.startsWith("-") && [...arg.slice(1)].some((letter) => short.includes(letter));
    if (refused) throw new Error(`The git adapter doesn't pass ${arg} to git ${subcommand}.`);
  }
}

function isAbbreviationOf(given: string, names: readonly string[]): boolean {
  return given !== "" && names.some((name) => name.startsWith(given));
}

/**
 * `args` with `--no-ext-diff --no-textconv` last before the paths when the
 * subcommand shows diffs, so they beat a `--ext-diff` or `--textconv`
 * before them, and `diff.external`, `diff.<driver>.command` and
 * `diff.<driver>.textconv` don't run. Blanking them instead would make git
 * fail with "cannot run".
 */
export function withoutDiffPrograms(args: readonly string[]): readonly string[] {
  if (!showsDiffs.has(args[0] ?? "")) return args;
  const end = endOfOptions(args);
  return [...args.slice(0, end), "--no-ext-diff", "--no-textconv", ...args.slice(end)];
}
