/**
 * How Halonic reads a program start for the paths it names. Three guards
 * refuse a start by what it names: a skill's `scripts/` folder
 * (`format.skill-scripts-folder`), and an agent's working folder, both as
 * written in a workspace (`workspace.working-folders`) and on the real file
 * system (`format.working-folder-start`). They read a start the same way, so
 * a path one of them finds, the others find too (HAL-4777). Reading too much
 * as a path only makes a guard stricter.
 */

/** What a start would run: the program, its arguments, the folder it starts in and its environment. */
export interface ProgramStart {
  readonly cwd: string;
  readonly program: string;
  readonly args: readonly string[];
  /** The variables the program gets. Their values are read for paths; their names aren't. */
  readonly env?: Readonly<Record<string, string>>;
}

/** A path a start names. */
export interface NamedPath {
  /** The path as written. A relative path is read from the start folder. */
  readonly path: string;
  /** The program, argument or `NAME=value` it comes from, for a message. */
  readonly shown: string;
}

/**
 * The paths a start names, besides the folder it starts in: the program,
 * every path each argument names (see {@link pathsIn}), the folder path of a
 * module that `python -m` runs (see {@link moduleIn}) and every path an `env`
 * value names. The start folder isn't listed, as each guard reads it on its
 * own terms.
 *
 * @example
 * pathsNamedBy({ cwd: ".", program: "node", args: ["--config=tools/mail.json"] });
 * // [{ path: "node", shown: "node" },
 * //  { path: "--config=tools/mail.json", shown: "--config=tools/mail.json" },
 * //  { path: "--config", shown: "--config=tools/mail.json" },
 * //  { path: "tools/mail.json", shown: "--config=tools/mail.json" }]
 */
export function pathsNamedBy({ program, args, env = {} }: ProgramStart): NamedPath[] {
  const named = (shown: string, paths: readonly string[]): NamedPath[] =>
    paths.map((path) => ({ path, shown }));
  return [
    { path: program, shown: program },
    ...args.flatMap((arg, index) => named(arg, [...pathsIn(arg), ...moduleIn(args, index)])),
    ...Object.entries(env).flatMap(([name, value]) => named(`${name}=${value}`, pathsIn(value))),
  ];
}

/**
 * The paths an argument or `env` value may name: the whole text, each piece
 * between `;` and spaces (a Windows `PATH` keeps its drive letters), each
 * piece between `=`, `:`, `;`, `@` and spaces (as in
 * `--config=tools/mail.json`, `--define=KEY=tools/x`, `PATH=tools/bin:/usr/bin`,
 * `file:tools/x` or `@tools/args.txt`), the whole text after each `=`, `:`
 * and `@` (so `--file=my link` still names `my link`), the whole text inside
 * each pair of quotes (as in `--require "my tools/x.js"`), each piece without
 * its quotes (HAL-4903), and each piece without its short flag, as in
 * `-ctools/mail.json`.
 */
export function pathsIn(text: string): string[] {
  const pieces = [
    text,
    ...text.split(/[;\s]+/),
    ...text.split(/[=:;@\s]+/),
    ...textsAfter(/[=:@]/g, text),
    ...textsInQuotes(text),
  ];
  const withoutQuotes = pieces.flatMap((piece) => [piece, piece.replaceAll(/["']/g, "")]);
  const withoutFlags = withoutQuotes.flatMap((piece) =>
    /^-[^-]./.test(piece) ? [piece, piece.slice(2)] : [piece],
  );
  return [...new Set(withoutFlags.filter((piece) => piece !== ""))];
}

/** The whole text after each match of `separator`: `a=b:c` gives `b:c` and `c` for `/[=:]/g`. */
function textsAfter(separator: RegExp, text: string): string[] {
  return [...text.matchAll(separator)].map((match) => text.slice(match.index + 1));
}

/**
 * The text inside each pair of `"` and each pair of `'`: `--require "my x.js"`
 * gives `my x.js`. The two kinds are paired in separate passes, so a stray
 * apostrophe, as in `it's --require "my x.js"`, can't hide a double-quoted
 * path (HAL-4903). A quote escaped with `\` inside quotes isn't read as part
 * of the path; that needs a path with quotes and spaces in its name.
 */
function textsInQuotes(text: string): string[] {
  const inPairsOf = (quote: string): string[] =>
    [...text.matchAll(new RegExp(`${quote}([^${quote}]*)${quote}`, "g"))].map(
      (match) => match[1] ?? "",
    );
  return [...inPairsOf('"'), ...inPairsOf("'")];
}

/**
 * The folder paths of a module that `python -m` runs, from the argument at
 * `index`: `-m tools.mail`, `-mtools.mail` and, with `-m` among other short
 * flags, `-Im tools.mail` or `-Imtools.mail` read `tools/mail`. Both readings
 * are kept: in `-Wm -mtools.mail`, the argument is read as a module after
 * `-Wm` and as `-m` with its module, so a guard never reads less than before
 * (HAL-4903). Empty when that argument names no module.
 */
export function moduleIn(args: readonly string[], index: number): string[] {
  return moduleNames(args[index - 1], args[index] ?? "").map((name) => name.replaceAll(".", "/"));
}

/** The modules an argument names: after a `-m` before it, and after its own `-m`. */
function moduleNames(before: string | undefined, arg: string): string[] {
  const afterFlagBefore = before !== undefined && textAfterShortM(before) === "" ? arg : "";
  const afterOwnFlag = textAfterShortM(arg) ?? "";
  return [...new Set([afterFlagBefore, afterOwnFlag].filter((name) => name !== ""))];
}

/**
 * The text after the first `m` in a group of short flags, as Python reads
 * one: `-Imtools.mail` gives `tools.mail`, and `-Im` gives an empty text, as
 * the module is the next argument. Undefined when the argument isn't a group
 * of short flags or has no `m`. A flag that takes a value, as in `-Xdev`, may
 * read a stray module; that only makes a guard stricter.
 */
function textAfterShortM(arg: string): string | undefined {
  if (!/^-[^-]/.test(arg)) return undefined;
  const at = arg.indexOf("m", 1);
  return at === -1 ? undefined : arg.slice(at + 1);
}
