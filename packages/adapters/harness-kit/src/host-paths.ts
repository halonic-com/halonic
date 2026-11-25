/**
 * The path rules of the machine a harness's program runs on. On the desktop
 * that is `node:path` itself, with Windows rules on Windows; in a Cloudflare
 * container it is `posixPath` from `@halonicjs/std`. The harnesses take
 * them as given, so nothing on the Worker reaches `node:path`.
 */
export interface HostPaths {
  /** Joins segments with the machine's separator and cleans the result. */
  join(...segments: string[]): string;
  /** The folder part of a path. */
  dirname(path: string): string;
  /** The way from one absolute path to another, `""` when they are the same place. */
  relative(from: string, to: string): string;
  /** Whether a path starts at the root (or a drive, on Windows). */
  isAbsolute(path: string): boolean;
  /** The machine's separator. */
  readonly sep: string;
}
