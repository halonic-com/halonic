// The workspace files a stdio connector's start names, hashed for its trust
// content (`workspace.trust-connector-files`). The program runs them outside
// Halonic, so a change to one asks for trust again, as a change to a local
// integration's code does. The start is read the way the working folder guard
// reads it (`scriptCandidates`, `pathsNamedBy`), so the two agree on what it
// names.

import {
  type Connector,
  type ProgramStart,
  pathsNamedBy,
  scriptCandidates,
  scriptEndings,
} from "@halonicjs/format";
import { type Digest, type FolderReader, isPrivateWorkspacePath } from "@halonicjs/ports";
import { bytesToHex, posixPath } from "@halonicjs/std";

/**
 * The hash a named file gets when the reader won't read it, such as a link
 * anywhere on its path or a special file, so swapping a file for one is a
 * change too.
 */
export const unreadableConnectorFile = "‹unreadable›";

/**
 * The hash of each workspace file each stdio connector's start names, by
 * connector id, then by the file's workspace-relative path with `/`
 * separators. A connector that names none isn't in the map.
 *
 * A path is read from the connector's `cwd`, itself read from the workspace
 * root, and normalised first, so `./tools/x.js`, `tools/x.js` and the same
 * file as an absolute path under the workspace's location give one entry. A
 * path that leaves the workspace, a folder, a private path such as `.env`,
 * and a file that isn't there are left out. An argument or `-m` module is
 * also tried with each ending Node and Python add (`node tools/server`).
 *
 * @param workspace - the workspace folder, read without following links
 * @param digest - the SHA-256 the local integrations' code hash uses too
 *
 * @example
 * await connectorFiles([serverConnector], new FileSystemFolderReader("/work/acme"), webCryptoDigest);
 * // Map { "server" => { "tools/server.js": "sha256:3b1f…" } }
 */
export async function connectorFiles(
  connectors: readonly Connector[],
  workspace: FolderReader,
  digest: Digest,
): Promise<Map<string, Record<string, string>>> {
  const location = await workspace.locationOf();
  const files = new Map<string, Record<string, string>>();
  for (const connector of connectors) {
    if (!("stdio" in connector.transport)) continue;
    const { stdio } = connector.transport;
    const start: ProgramStart = {
      cwd: stdio.cwd ?? ".",
      program: stdio.command,
      args: stdio.args,
      env: stdio.env ?? {},
    };
    const hashes = await hashesOf(namedFiles(start, location), workspace, digest);
    if (Object.keys(hashes).length > 0) files.set(connector.id, hashes);
  }
  return files;
}

/**
 * The workspace-relative paths a start may name a file by: one group for
 * each path it names, with the forms Node and Python try, in their order.
 */
function namedFiles(start: ProgramStart, location: string | null): string[][] {
  const from = workspaceRelative(".", start.cwd, location);
  const written = [
    ...scriptCandidates(start).map(({ path, filled }) =>
      filled ? [path, ...scriptEndings.map((ending) => path + ending)] : [path],
    ),
    ...pathsNamedBy(start).map(({ path }) => [path]),
  ];
  return written.map((group) =>
    group.flatMap((path) => {
      const relative = workspaceRelative(from, path, location);
      const kept = relative !== undefined && relative !== "." && !isPrivateWorkspacePath(relative);
      return kept ? [relative] : [];
    }),
  );
}

/**
 * `path` read from the workspace-relative folder `from`, as a normalised
 * workspace-relative path (`.` for the root), or `undefined` when it is
 * outside the workspace. A relative path read from a folder outside it
 * (`from` is `undefined`) is outside too. `\` counts as `/`, as on Windows.
 */
function workspaceRelative(
  from: string | undefined,
  path: string,
  location: string | null,
): string | undefined {
  const written = path.replaceAll("\\", "/");
  const relative = isAbsolute(written) ? underLocation(written, location) : join(from, written);
  if (relative === undefined) return undefined;
  const clean = withoutTrailingSlash(posixPath.normalize(relative));
  return clean === ".." || clean.startsWith("../") ? undefined : clean;
}

/** An absolute path relative to the workspace's location, or `undefined` when it isn't under it. */
function underLocation(path: string, location: string | null): string | undefined {
  if (location === null) return undefined;
  const root = withoutTrailingSlash(location.replaceAll("\\", "/"));
  const clean = withoutTrailingSlash(posixPath.normalize(path));
  if (clean === root) return ".";
  return clean.startsWith(`${root}/`) ? clean.slice(root.length + 1) : undefined;
}

function join(from: string | undefined, path: string): string | undefined {
  if (from === undefined) return undefined;
  return path === "" ? from : posixPath.join(from, path);
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * The hash of each path that is a file, sorted by path, or the marker for
 * one the reader refuses. A refused path ends its group: behind a linked
 * folder, the reader refuses every other form too, and one entry says it.
 */
async function hashesOf(
  groups: readonly (readonly string[])[],
  workspace: FolderReader,
  digest: Digest,
): Promise<Record<string, string>> {
  const hashes = new Map<string, string | null>();
  for (const group of groups) {
    for (const path of group) {
      if (!hashes.has(path)) hashes.set(path, await fileHash(path, workspace, digest));
      if (hashes.get(path) === unreadableConnectorFile) break;
    }
  }
  const found: [string, string][] = [];
  for (const [path, hash] of hashes) if (hash !== null) found.push([path, hash]);
  return Object.fromEntries(found.sort(([left], [right]) => compareText(left, right)));
}

/** The hash of the file at `path`, `null` when there is none, or the marker when the reader refuses it. */
async function fileHash(
  path: string,
  workspace: FolderReader,
  digest: Digest,
): Promise<string | null> {
  let bytes: Uint8Array | null;
  try {
    bytes = await workspace.read(path);
  } catch {
    // Not lost: a link, special file or unreadable path becomes a fixed entry in the trust
    // content, so the fingerprint still changes when a file turns into one.
    return unreadableConnectorFile;
  }
  return bytes === null ? null : `sha256:${bytesToHex(await digest.sha256(bytes))}`;
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
