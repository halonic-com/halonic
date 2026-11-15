// The ask policy of "no sandbox" mode: what the harness may do without
// asking, and what a person must say yes to first (HAL-5397, N1b, N3).
// Pure: the real paths come from a resolver the caller gives.

import { isProtectedPath } from "./protected-paths.ts";

/** What the harness wants to do, as the approve tool sees it. */
export type AskToolCall =
  | { readonly kind: "read"; readonly path: string }
  | { readonly kind: "edit"; readonly path: string }
  | { readonly kind: "shell"; readonly command: string }
  /** Any other tool: it is never let through. */
  | { readonly kind: "other"; readonly name: string };

/** A path after links are followed. */
export interface ResolvedPath {
  /** The real path. Where the path isn't there yet, its nearest existing parent's real path plus the rest. */
  readonly real: string;
  /** `true` for a file that more than one name points at, so its real path says nothing about where else it is. */
  readonly linked: boolean;
}

/** Follows links and junctions, expands short names. Gives `null` when it can't: an error, a loop, a path too long, a dangling link. */
export type PathResolver = (path: string) => Promise<ResolvedPath | null>;

export type AskReason =
  | "shell-command"
  | "other-tool"
  | "relative-path"
  | "unresolved"
  | "outside-project"
  | "protected-path"
  | "linked-file"
  | "short-name"
  | "trailing-dot-or-space";

export type RefuseReason = "device-path" | "network-path" | "alternate-stream";

export type AskVerdict =
  | { readonly decision: "allow" }
  | { readonly decision: "ask"; readonly reason: AskReason }
  | { readonly decision: "refuse"; readonly reason: RefuseReason };

export interface AskPolicyOptions {
  /** The project's real path, resolved the same way as the target. */
  readonly projectRoot: string;
  readonly resolve: PathResolver;
  /** Windows: a drive or UNC path, short names and streams. Defaults to `false`. */
  readonly windows?: boolean;
  /** `true` where the file system ignores letter case. Defaults to `windows`. Only the inside-the-project check uses it: protected paths always ignore case. */
  readonly ignoreCase?: boolean;
}

const ask = (reason: AskReason): AskVerdict => ({ decision: "ask", reason });
const refuse = (reason: RefuseReason): AskVerdict => ({ decision: "refuse", reason });

function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment !== "");
}

/** The paths that are never let through, whatever they resolve to. */
function refusedForm(path: string, windows: boolean): AskVerdict | null {
  if (/^[\\/]{2}[?.][\\/]/.test(path)) return refuse("device-path");
  if (/^[\\/]{2}[^\\/]/.test(path)) return refuse("network-path");
  // `file.txt:stream` and `dir::$INDEX_ALLOCATION`: a colon anywhere but a drive letter's.
  if (windows && path.replace(/^[A-Za-z]:/, "").includes(":")) return refuse("alternate-stream");
  return null;
}

const endsInDotOrSpace = (segment: string): boolean =>
  segment !== "." && segment !== ".." && /[. ]$/.test(segment);

const isAbsolutePath = (path: string): boolean => /^([\\/]|[A-Za-z]:[\\/])/.test(path);

/** What the path's spelling alone gives, before any link is followed. */
function verdictFromPathForm(path: string, windows: boolean): AskVerdict | null {
  const refused = refusedForm(path, windows);
  if (refused !== null) return refused;
  if (!isAbsolutePath(path)) return ask("relative-path");
  if (!windows) return null;
  const segments = segmentsOf(path);
  // A short name (`PROGRA~1`) is expanded by the resolver; one it left alone still hides what it names.
  if (segments.some((segment) => /~\d/.test(segment))) return ask("short-name");
  // Win32 drops trailing dots and spaces, so `.claude.` can be written as `.claude`.
  if (segments.some(endsInDotOrSpace)) return ask("trailing-dot-or-space");
  return null;
}

/**
 * Answers `allow` for a read or an edit that is inside the project after the
 * real path is followed, and that edits nothing protected; `ask` for every
 * shell command, every other tool, every path outside, every protected path
 * and everything that can't be resolved; and `refuse` for device paths, UNC
 * paths and alternate data streams. When in doubt it asks.
 *
 * Reading a protected path inside the project is let through: only an edit
 * of it can plant a hook. A file with more than one name asks for a read too,
 * because the other name may be outside the project.
 */
export async function askPolicy(call: AskToolCall, options: AskPolicyOptions): Promise<AskVerdict> {
  if (call.kind === "shell") return ask("shell-command");
  if (call.kind === "other") return ask("other-tool");
  const windows = options.windows ?? false;
  const ignoreCase = options.ignoreCase ?? windows;
  const early = verdictFromPathForm(call.path, windows);
  if (early !== null) return early;
  let resolved: ResolvedPath | null;
  try {
    resolved = await options.resolve(call.path);
  } catch {
    resolved = null;
  }
  if (resolved === null) return ask("unresolved");
  const root = segmentsOf(options.projectRoot);
  if (root.length === 0) return ask("outside-project"); // `/` would make every path inside
  const real = segmentsOf(resolved.real);
  const same = (a: string, b: string): boolean =>
    ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
  const isInside = root.every(
    (segment, index) => index < real.length && same(real[index] ?? "", segment),
  );
  if (!isInside) return ask("outside-project");
  if (call.kind === "edit") {
    if (isProtectedPath(real.slice(root.length))) return ask("protected-path");
  }
  if (resolved.linked) return ask("linked-file");
  return { decision: "allow" };
}
