/** The options every command takes, read before the command sees its own (cli-output 1.9). */
export interface GlobalOptions {
  /** `--json`: one JSON document on stdout, and nothing for a person. */
  readonly json: boolean;
  /** `--no-color`: no colour and no live lines. */
  readonly noColor: boolean;
  /** `--verbose`: also the steps the user didn't ask about, such as loading files. */
  readonly verbose: boolean;
  /** `--debug`: print an error's own message, causes and stack as well. */
  readonly debug: boolean;
  /** `--help` or `-h`: the help instead of the command. */
  readonly help: boolean;
}

/** The global options, and the command line without them. */
export interface ReadGlobalOptions {
  readonly options: GlobalOptions;
  /** The command line with the global options taken out, in the same order. */
  readonly args: readonly string[];
}

/** Each global option's spellings, in the order `halonic --help` lists them. */
const spellings: Readonly<Record<keyof GlobalOptions, readonly string[]>> = {
  json: ["--json"],
  noColor: ["--no-color"],
  verbose: ["--verbose"],
  debug: ["--debug"],
  help: ["--help", "-h"],
};

/**
 * Every option that every command takes, in the order `halonic --help` lists
 * them. A new global option is added to `spellings`, so the help names it by itself.
 */
export const globalOptionFlags: readonly string[] = Object.values(spellings).map(
  ([long = ""]) => long,
);

/** Every spelling of a global option, to take them all out of the command line. */
const globalOptionSpellings: readonly string[] = Object.values(spellings).flat();

/** `--help` and its short form `-h`: print the help instead of running the command. */
export const helpFlags: ReadonlySet<string> = new Set(spellings.help);

/** Ends the options: everything after it is an argument, even `--debug`. */
const endOfOptions = "--";

/**
 * Takes the global options out of a command line, wherever they stand:
 * `halonic --json test` and `halonic test --json` mean the same. Only
 * `runCli` reads them, so no command sees or parses them.
 *
 * @param args - the command line after `halonic`
 * @example
 * readGlobalOptions(["test", "--json"]);
 * // { options: { json: true, noColor: false, … }, args: ["test"] }
 */
export function readGlobalOptions(args: readonly string[]): ReadGlobalOptions {
  const end = args.indexOf(endOfOptions);
  const options = end === -1 ? args : args.slice(0, end);
  const rest = end === -1 ? [] : args.slice(end);
  const given = (name: keyof GlobalOptions) => options.some((arg) => spellings[name].includes(arg));
  return {
    options: {
      json: given("json"),
      noColor: given("noColor"),
      verbose: given("verbose"),
      debug: given("debug"),
      help: given("help"),
    },
    args: [...options.filter((arg) => !globalOptionSpellings.includes(arg)), ...rest],
  };
}
