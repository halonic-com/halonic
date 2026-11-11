// What Halonic tells the runner on its command line: the nonce of this start
// and where the integration is. Both sides use this file, so they read the
// arguments the same way. Nothing here is secret: the runner's environment and
// arguments never hold a secret value (design HAL-958, section 3.5).

/** The runner's arguments, after the runner file. */
export interface RunnerArgs {
  /** The fresh nonce of this start, sent back in `ready`. */
  readonly nonce: string;
  /** The integration's folder: Node may read it, and the module hook keeps imports inside it. */
  readonly folder: string;
  /** The integration's module file, inside its folder. */
  readonly entryFile: string;
  /** The name the module exports the integration under, such as `weather`. */
  readonly exportName: string;
}

/** The runner's arguments as a list, in the order {@link readRunnerArgs} reads them. */
export function runnerArgList(args: RunnerArgs): string[] {
  return [args.nonce, args.folder, args.entryFile, args.exportName];
}

/**
 * Reads the runner's arguments.
 *
 * @throws {Error} when there aren't exactly four, or one is empty
 */
export function readRunnerArgs(list: readonly string[]): RunnerArgs {
  const [nonce, folder, entryFile, exportName] = list;
  if (list.length !== 4 || !nonce || !folder || !entryFile || !exportName) {
    throw new Error(
      "the runner takes four arguments: the nonce, the folder, the entry file and the export",
    );
  }
  return { nonce, folder, entryFile, exportName };
}
