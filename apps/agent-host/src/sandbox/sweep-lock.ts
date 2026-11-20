// The host lock and its sweep, from the shared helper in sandbox-srt that the
// CLI takes too (HAL-6780), and the `--sweep-root` folders the launcher names.
import { isAbsolute } from "node:path";

export { hostLockFile, takeHostLock } from "@halonicjs/adapter-sandbox-srt";

/** Every value of `name` in `args`, which may repeat it. */
export function argumentValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  args.forEach((argument, at) => {
    const value = args[at + 1];
    if (argument === name && value !== undefined) values.push(value);
  });
  return values;
}

/**
 * The folders given with `--sweep-root`, or the sentence that says what is
 * wrong with them: each must be absolute, as the launcher computes it from
 * the profile, never relative to wherever the host happens to start.
 */
export function sweepRoots(args: readonly string[]): { roots: string[] } | { error: string } {
  const named = args.filter((argument) => argument === "--sweep-root").length;
  const roots = argumentValues(args, "--sweep-root");
  if (roots.length !== named || roots.some((root) => !isAbsolute(root))) {
    return { error: "The agent host needs an absolute folder after each --sweep-root.\n" };
  }
  return { roots };
}
