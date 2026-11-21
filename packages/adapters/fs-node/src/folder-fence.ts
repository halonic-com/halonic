// A folder a workspace's files never reach, even when the workspace holds
// it: the profile (HAL-15201). The same rule as the shell's `Fence` in the
// `workspace-files` crate (HAL-7039), so the CLI's Accept and Undo refuse
// what Studio's file calls refuse.

import { realpath } from "node:fs/promises";
import { basename, dirname, join, parse, sep } from "node:path";
import { segmentAsOpened } from "@halonicjs/ports";

/** Where the fenced folder is, seen from a workspace's root. */
export type FolderFence =
  /** The fenced folder isn't under the root: every path may be used. */
  | { readonly kind: "outside" }
  /** The root is the fenced folder or inside it: no path may be used. */
  | { readonly kind: "whole" }
  /** The fenced folder is at these segments under the root, each as `segmentAsOpened` gives it. */
  | { readonly kind: "at"; readonly segments: readonly string[] };

/**
 * Where `fenced` is under `root`. Both real paths are worked out as far as
 * they exist, so a profile not made yet is fenced too, and a link to it
 * doesn't get around the fence. Names are compared as a file system that
 * folds case might open them, so a folder that only differs in case is
 * fenced too.
 *
 * @example
 * await fenceAround("/srv/ann", "/srv/ann/.local/share/halonic");
 * // { kind: "at", segments: [".local", "share", "halonic"] }
 */
export async function fenceAround(root: string, fenced: string): Promise<FolderFence> {
  const rootParts = openedParts(await realAsFarAsItExists(root));
  const fencedParts = openedParts(await realAsFarAsItExists(fenced));
  if (startsWith(rootParts, fencedParts)) {
    return { kind: "whole" };
  }
  if (startsWith(fencedParts, rootParts)) {
    return { kind: "at", segments: fencedParts.slice(rootParts.length) };
  }
  return { kind: "outside" };
}

/**
 * Whether a safe workspace path (`""` for the root) is the fenced folder or
 * inside it.
 */
export function fenceHolds(fence: FolderFence, path: string): boolean {
  switch (fence.kind) {
    case "outside":
      return false;
    case "whole":
      return true;
    case "at":
      return path !== "" && startsWith(path.split("/").map(segmentAsOpened), fence.segments);
  }
}

/**
 * Refuses a safe workspace path the fence holds, as the `DefinitionStore`
 * port refuses a private path: the shell's `private_path`.
 *
 * @throws RangeError naming the path
 */
export function checkFence(fence: FolderFence, path: string): void {
  if (fenceHolds(fence, path)) {
    throw new RangeError(
      `Private workspace path ${JSON.stringify(path)}: it is in the profile folder, which the store doesn't serve.`,
    );
  }
}

/** The path's root as written, then its names as `segmentAsOpened` gives them. */
function openedParts(path: string): string[] {
  const { root } = parse(path);
  const names = path
    .slice(root.length)
    .split(sep)
    .filter((name) => name !== "");
  return [root, ...names.map(segmentAsOpened)];
}

function startsWith(parts: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= parts.length && prefix.every((part, index) => parts[index] === part);
}

/** The real path of the longest part of `path` that exists, followed by the rest as written. */
async function realAsFarAsItExists(path: string): Promise<string> {
  const rest: string[] = [];
  let existing = path;
  for (;;) {
    try {
      return join(await realpath(existing), ...rest.reverse());
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return path;
      rest.push(basename(existing));
      existing = parent;
    }
  }
}
