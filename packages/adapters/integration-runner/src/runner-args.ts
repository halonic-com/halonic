// What Halonic tells the runner on its command line: the nonce of this start
// and where the integration is. Both sides use this file, so they read the
// arguments the same way. Nothing here is secret: the runner's environment and
// arguments never hold a secret value (design HAL-958, section 3.5).

/** The runner's arguments, after the runner file. */
export interface RunnerArgs {
  /** The fresh nonce of this start, sent back in `ready`. */
  readonly nonce: string;
  /** The integration's module file, inside its folder. */
  readonly entryFile: string;
  /** The name the module exports the integration under, such as `weather`. */
  readonly exportName: string;
}

/** The runner's arguments as a list, in the order {@link readRunnerArgs} reads them. */
export function runnerArgList(args: RunnerArgs): string[] {
  return [args.nonce, args.entryFile, args.exportName];
}

/**
 * Reads the runner's arguments.
 *
 * @throws {Error} when there aren't exactly three, or one is empty
 */
export function readRunnerArgs(list: readonly string[]): RunnerArgs {
  const [nonce, entryFile, exportName] = list;
  if (list.length !== 3 || !nonce || !entryFile || !exportName) {
    throw new Error("the runner takes three arguments: the nonce, the entry file and the export");
  }
  return { nonce, entryFile, exportName };
}
