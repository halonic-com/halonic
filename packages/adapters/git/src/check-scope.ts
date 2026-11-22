// Within one port call: which git commands keep the repository's check, and
// which may run with a check that skipped the nested-repository listing.

/** A git command's options (before `--`) and operands, without its subcommand. */
interface Command {
  options: readonly string[];
  operands: readonly string[];
}

type CommandRule = (command: Command) => boolean;

const always: CommandRule = () => true;

/** Only options from `allowed`; any other one, a bundle such as `-zo` included, fails the rule. */
function onlyOptions(...allowed: string[]): CommandRule {
  return ({ options }) => options.every((option) => allowed.includes(option));
}

/** The forms of these commands that only read: `symbolic-ref <name>`, `config --get <key>`, plain `remote`. */
const readsSymbolicRef: CommandRule = ({ options, operands }) =>
  onlyOptions("--quiet", "-q", "--short")({ options, operands }) && operands.length === 1;
const readsConfigValue: CommandRule = ({ options }) =>
  options.length === 1 && options[0] === "--get";
const listsRemotes: CommandRule = ({ options, operands }) =>
  operands.length === 0 && onlyOptions("-v", "--verbose")({ options, operands });

/** Compares the index with a commit: never reads the files, nor writes the index. */
const comparesIndex: CommandRule = ({ options }) =>
  options.includes("--cached") && !options.includes("--no-index");

/**
 * Commands that keep a check made earlier in the same port call. They read
 * only, or write only objects and refs, so none changes what the check read:
 * where the git files are and the links among them, the alternates, the
 * config, and the index's gitlinks and the untracked nested repositories.
 * A command not here ends the check, an unknown one and `fetch` included,
 * and so does a file the adapter writes itself.
 */
const keepsCheckRules: Readonly<Record<string, CommandRule>> = {
  "cat-file": always,
  "commit-tree": always,
  config: readsConfigValue,
  diff: comparesIndex,
  "diff-index": comparesIndex,
  "diff-tree": always,
  "for-each-ref": always,
  log: always,
  // `ls-files` never writes the index, whatever it lists.
  "ls-files": always,
  "ls-tree": always,
  "merge-base": always,
  remote: listsRemotes,
  "rev-parse": always,
  "show-ref": always,
  "symbolic-ref": readsSymbolicRef,
  "update-ref": always,
  "write-tree": always,
};

/**
 * Commands that may run without the nested-repository listing. That listing
 * finds the filters of nested repositories, which git runs only when it
 * looks at the files; these read only objects, refs, the config and the
 * index. Every other command runs the listing: `stash`, `clean`, `rm`, `mv`,
 * `reset`, `apply` and plain `diff` too.
 */
const skipsListingRules: Readonly<Record<string, CommandRule>> = {
  "cat-file": always,
  "commit-tree": always,
  config: readsConfigValue,
  diff: comparesIndex,
  "diff-index": comparesIndex,
  "diff-tree": always,
  "for-each-ref": always,
  log: always,
  // Not `--others`, `--modified` or `--deleted`, which look at the files.
  "ls-files": onlyOptions("-z", "--stage", "-s", "--cached", "-c"),
  "ls-tree": always,
  "merge-base": always,
  // Not `-u`, which writes the files.
  "read-tree": onlyOptions("--empty"),
  remote: listsRemotes,
  "rev-parse": always,
  "show-ref": always,
  "symbolic-ref": readsSymbolicRef,
  "update-ref": always,
  "write-tree": always,
};

/** Whether the command `args` keeps a check made before it in the same port call. */
export function keepsCheck(args: readonly string[]): boolean {
  return matches(keepsCheckRules, args);
}

/** Whether the command `args` may run with a check that skipped the nested-repository listing. */
export function skipsNestedListing(args: readonly string[]): boolean {
  return matches(skipsListingRules, args);
}

function matches(rules: Readonly<Record<string, CommandRule>>, args: readonly string[]): boolean {
  const [subcommand = "", ...rest] = args;
  const rule = Object.hasOwn(rules, subcommand) ? rules[subcommand] : undefined;
  return rule?.(commandOf(rest)) === true;
}

function commandOf(rest: readonly string[]): Command {
  const end = rest.findIndex((arg) => arg === "--" || arg === "--end-of-options");
  const beforeEnd = end === -1 ? rest : rest.slice(0, end);
  const afterEnd = end === -1 ? [] : rest.slice(end + 1);
  return {
    options: beforeEnd.filter((arg) => arg.startsWith("-")),
    operands: [...beforeEnd.filter((arg) => !arg.startsWith("-")), ...afterEnd],
  };
}

/** A check held for the rest of a port call, and whether it ran the nested-repository listing. */
export interface HeldCheck<T> {
  result: T;
  withListing: boolean;
}

/**
 * The checks of one port call. A check holds until a command that doesn't
 * keep it starts, or the adapter writes a file. A check that was running
 * while such a command or write happened is never held, so a check can't
 * outlive what it read, even with calls running at once.
 */
export class CallChecks<T> {
  #held: HeldCheck<T> | null = null;
  /** Moves on whenever something may change what a check reads. */
  #epoch = 0;
  /** Commands running now that may change what a check reads. */
  #changing = 0;

  /** The held check, if it serves a command that needs the listing or not. */
  held(withListing: boolean): T | null {
    const held = this.#held;
    if (held === null || (withListing && !held.withListing)) return null;
    return held.result;
  }

  /** The epoch to give {@link CallChecks.hold} for a check starting now. */
  get epoch(): number {
    return this.#epoch;
  }

  /** Holds a check that started at `epoch`, unless anything changed meanwhile. */
  hold(epoch: number, check: HeldCheck<T>): void {
    if (epoch !== this.#epoch || this.#changing > 0) return;
    this.#held = check;
  }

  /**
   * Runs `command` (`args`), ending the held check first unless it keeps it.
   */
  async running<R>(args: readonly string[], command: () => Promise<R>): Promise<R> {
    if (keepsCheck(args)) return command();
    this.changed();
    this.#changing += 1;
    try {
      return await command();
    } finally {
      this.#changing -= 1;
      this.changed();
    }
  }

  /** Ends the held check: the adapter wrote into the files or the git files itself. */
  changed(): void {
    this.#held = null;
    this.#epoch += 1;
  }
}
