/** The options every command takes, read before the command sees its own. */
export interface GlobalOptions {
  /** `--debug`: print an error's own message, causes and stack as well. */
  readonly debug: boolean;
}

/** The global options, and the command line without them. */
export interface ReadGlobalOptions {
  readonly options: GlobalOptions;
  /** The command line with the global options taken out, in the same order. */
  readonly args: readonly string[];
}

const debugFlag = "--debug";

/** Ends the options: everything after it is an argument, even `--debug`. */
const endOfOptions = "--";

/**
 * Takes the global options out of a command line, wherever they stand:
 * `halonic --debug run x` and `halonic run x --debug` mean the same. Only
 * `runCli` reads them, so no command sees or parses them.
 *
 * @param args - the command line after `halonic`
 */
export function readGlobalOptions(args: readonly string[]): ReadGlobalOptions {
  const end = args.indexOf(endOfOptions);
  const options = end === -1 ? args : args.slice(0, end);
  const rest = end === -1 ? [] : args.slice(end);
  return {
    options: { debug: options.includes(debugFlag) },
    args: [...options.filter((arg) => arg !== debugFlag), ...rest],
  };
}
