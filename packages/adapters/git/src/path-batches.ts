/**
 * How many characters of paths one git call may carry. Windows caps a whole
 * command line at 32,767 characters, and the runner can't hand git a list on
 * stdin or in a file (`--pathspec-from-file` is refused), so a long list goes
 * as several calls. Half the cap leaves the other half for git's own path,
 * `--git-dir`, `--work-tree` and the subcommand's options.
 */
export const pathCharactersPerCall = 16_384;

/**
 * What one path adds to a Windows command line besides its own characters:
 * the space before it and the quotes around it.
 */
const charactersAroundPath = 3;

/**
 * Splits `paths`, in order, into batches that each fit
 * {@link pathCharactersPerCall}. A path longer than that on its own goes in a
 * batch of its own, for git to take or refuse.
 *
 * @example
 * pathBatches([]); // []
 * pathBatches(["a.yaml", "b.yaml"]); // [["a.yaml", "b.yaml"]]
 */
export function pathBatches(
  paths: readonly string[],
  limit: number = pathCharactersPerCall,
): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let used = 0;
  for (const path of paths) {
    // `length` counts UTF-16 code units, which is what Windows counts too.
    const size = path.length + charactersAroundPath;
    if (batch.length > 0 && used + size > limit) {
      batches.push(batch);
      batch = [];
      used = 0;
    }
    batch.push(path);
    used += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * Runs `run` once per batch of `paths` (see {@link pathBatches}), one after
 * another, and gives every output in order. Nothing runs for no paths. When a
 * call fails, the batches before it stay done and the rest don't run.
 */
export async function inPathBatches<T>(
  paths: readonly string[],
  run: (batch: string[]) => Promise<T>,
): Promise<T[]> {
  const outputs: T[] = [];
  for (const batch of pathBatches(paths)) outputs.push(await run(batch));
  return outputs;
}
