// The agent host's entry point: the single executable's main script. It
// imports only Node's own modules, so the build embeds it without a bundler.
// The files the host runs from are embedded next to it as assets (see
// build/payload.ts). On launch it unpacks them into a folder of the profile,
// checks each one against its digest, and loads the host from there.
//
// The executable has two uses:
//
//   halonic-agent-host --profile-folder <folder> [host arguments]
//     runs the host (host.ts);
//   halonic-agent-host <unpacked program> [arguments]
//     runs one of the payload's programs, as Node would. sandbox-srt starts
//     srt's command line this way, with `process.execPath`, which is this
//     executable.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { getRawAsset, isSea } from "node:sea";
import { pathToFileURL } from "node:url";
import type { PayloadManifest } from "./payload-manifest.ts";

// Put in front of this file by the build. Missing when the file runs from source.
declare const HALONIC_AGENT_HOST_VERSION: string | undefined;
declare const HALONIC_AGENT_HOST_PAYLOAD: PayloadManifest | undefined;

/** What the host module (host.ts) offers the entry point. */
interface HostModule {
  run(args: readonly string[], version: string): Promise<number>;
}

/** The folder the payload unpacks into: one per version and payload, under the profile folder. */
export function payloadFolder(
  profileFolder: string,
  version: string,
  manifest: PayloadManifest,
): string {
  return join(profileFolder, "agent-host", payloadFolderName(version, manifest));
}

function payloadFolderName(version: string, manifest: PayloadManifest): string {
  return `${version}-${manifest.digest.slice(0, 16)}`;
}

/**
 * Makes sure `folder` holds the payload. A folder an earlier launch unpacked
 * is checked file by file, and unpacked again when anything differs. The
 * payload is unpacked into a temporary folder next to it and then renamed,
 * so a launch that stops halfway leaves nothing half-written, and of two
 * launches at once, the second uses the first one's folder.
 *
 * @param readAsset - the bytes of one payload file, by its path
 * @throws when an asset doesn't match its digest (a damaged executable), or the folder can't be written
 */
export function unpackPayload(
  folder: string,
  manifest: PayloadManifest,
  readAsset: (path: string) => Uint8Array,
): void {
  if (existsSync(folder)) {
    if (holdsPayload(folder, manifest)) return;
    rmSync(folder, { recursive: true, force: true });
  }
  const unpacking = `${folder}.unpacking-${randomUUID()}`;
  try {
    for (const file of manifest.files) {
      const bytes = readAsset(file.path);
      if (sha256(bytes) !== file.sha256) {
        throw new Error(`The agent host is damaged: ${file.path} doesn't match its digest.`);
      }
      const target = placeOf(unpacking, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { mode: file.executable ? 0o755 : 0o644 });
    }
    renameSync(unpacking, folder);
  } catch (error) {
    rmSync(unpacking, { recursive: true, force: true });
    // Another launch may have unpacked the same payload first.
    if (!holdsPayload(folder, manifest)) throw error;
  }
}

/** How old a launch's temporary unpacking folder must be before another launch removes it. */
const staleUnpackingMs = 60 * 60 * 1000;

/**
 * Removes what other launches left next to `folder`: the payload folders of
 * other versions, and temporary unpacking folders older than an hour (a
 * launch that stopped halfway). Younger ones may belong to a launch that is
 * unpacking right now, so they stay. Called after `folder` is unpacked, so
 * an update doesn't leave the old version's files behind.
 *
 * Best effort: a folder that can't be removed (on Windows, a file still in
 * use) stays, and the next launch tries again. A half-removed folder is never
 * used, because a launch of its version checks every file and unpacks again.
 */
export function removeOldPayloads(folder: string, now = Date.now()): void {
  const parent = dirname(folder);
  for (const name of readdirSync(parent)) {
    const other = join(parent, name);
    if (other === folder) continue;
    try {
      const unpacking = name.includes(".unpacking-");
      if (unpacking && now - statSync(other).mtimeMs < staleUnpackingMs) continue;
      rmSync(other, { recursive: true, force: true });
    } catch {
      // Still in use, or already gone: the next launch tries again.
    }
  }
}

/** True when every payload file is in `folder` with its digest. */
function holdsPayload(folder: string, manifest: PayloadManifest): boolean {
  return manifest.files.every((file) => holdsFile(folder, file.path, file.sha256));
}

function holdsFile(folder: string, path: string, digest: string): boolean {
  try {
    return sha256(readFileSync(placeOf(folder, path))) === digest;
  } catch {
    return false;
  }
}

/**
 * Where a payload path goes in `folder`.
 *
 * @throws when the path could leave the folder or isn't plain, so a damaged manifest can't write elsewhere
 */
function placeOf(folder: string, path: string): string {
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || /[\\:]/.test(part))) {
    throw new Error(`The agent host is damaged: ${JSON.stringify(path)} isn't a plain path.`);
  }
  return join(folder, ...parts);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Resolves `@halonicjs/...` to the workspace package in the unpacked payload,
 * by the package's `exports`. Other specifiers resolve as Node resolves them.
 *
 * @returns the module's file URL, or `undefined` for a specifier that isn't a workspace package
 * @throws when the package doesn't export that subpath
 */
export function resolveWorkspace(
  folder: string,
  packages: Readonly<Record<string, string>>,
  specifier: string,
): string | undefined {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, nameLength).join("/");
  const at = packages[name];
  if (at === undefined) return undefined;
  const subpath = ["."].concat(parts.slice(nameLength)).join("/");
  const packageJson = JSON.parse(readFileSync(placeOf(folder, `${at}/package.json`), "utf8")) as {
    exports?: unknown;
  };
  if (!isPlainObject(packageJson.exports) || !Object.hasOwn(packageJson.exports, subpath)) {
    throw new Error(`${name} doesn't export ${JSON.stringify(subpath)}.`);
  }
  const entry = packageJson.exports[subpath];
  const target = exportTarget(entry);
  if (target === undefined) {
    throw new Error(
      `${name} exports ${JSON.stringify(subpath)} as ${JSON.stringify(entry)}, which the agent host can't read. ` +
        `Use a path, or conditions "node", "import" or "default" that each name a path.`,
    );
  }
  return pathToFileURL(placeOf(folder, `${at}/${target.replace(/^\.\//, "")}`)).href;
}

/**
 * The file of one `exports` entry: a path, or the path of the first condition
 * Node uses here. The resolve hook reads only these two forms; a list, `null`
 * or nested conditions give `undefined`, so the caller can say so.
 */
function exportTarget(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (!isPlainObject(entry)) return undefined;
  const condition = ["node", "import", "default"].find((each) => Object.hasOwn(entry, each));
  const target = condition === undefined ? undefined : entry[condition];
  return typeof target === "string" ? target : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The payload program `argument` names, when it is one of the manifest's
 * programs in a folder this version of the host unpacked, and still has its
 * digest. Anything else isn't run.
 */
export function payloadProgram(
  argument: string | undefined,
  version: string,
  manifest: PayloadManifest,
): string | undefined {
  if (argument === undefined || !isAbsolute(argument)) return undefined;
  for (const program of manifest.programs) {
    const suffix = sep + program.split("/").join(sep);
    if (!argument.endsWith(suffix)) continue;
    const folder = argument.slice(0, -suffix.length);
    const file = manifest.files.find((each) => each.path === program);
    const unpacked = basename(folder) === payloadFolderName(version, manifest);
    if (unpacked && file !== undefined && holdsFile(folder, program, file.sha256)) return argument;
  }
  return undefined;
}

/** The value of `--profile-folder`, and the arguments left for the host. */
export function hostArguments(args: readonly string[]): {
  profileFolder: string | undefined;
  rest: string[];
} {
  const at = args.indexOf("--profile-folder");
  if (at === -1) return { profileFolder: undefined, rest: [...args] };
  return { profileFolder: args[at + 1], rest: [...args.slice(0, at), ...args.slice(at + 2)] };
}

/** Runs the executable: a payload program, or the host. Returns the exit code. */
async function start(version: string, manifest: PayloadManifest): Promise<number> {
  const args = process.argv.slice(2);
  const program = payloadProgram(args[0], version, manifest);
  if (program !== undefined) {
    // The program reads its arguments from process.argv, as it would under Node.
    process.argv = [process.execPath, program, ...args.slice(1)];
    createRequire(program)(program);
    return 0;
  }
  const { profileFolder, rest } = hostArguments(args);
  if (profileFolder === undefined || !isAbsolute(profileFolder)) {
    process.stderr.write("The agent host needs --profile-folder with an absolute folder.\n");
    return 2;
  }
  const folder = payloadFolder(profileFolder, version, manifest);
  unpackPayload(folder, manifest, (path) => new Uint8Array(getRawAsset(path)));
  removeOldPayloads(folder);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const url = resolveWorkspace(folder, manifest.packages, specifier);
      return url === undefined ? nextResolve(specifier, context) : { url, shortCircuit: true };
    },
  });
  const entry = placeOf(folder, manifest.entry);
  const host = createRequire(entry)(entry) as HostModule;
  return host.run(rest, version);
}

if (isSea() && typeof HALONIC_AGENT_HOST_PAYLOAD === "object") {
  const version =
    typeof HALONIC_AGENT_HOST_VERSION === "string" ? HALONIC_AGENT_HOST_VERSION : "0.0.0";
  try {
    const code = await start(version, HALONIC_AGENT_HOST_PAYLOAD);
    // A program keeps running on its own; only the host's answer sets the code.
    if (code !== 0) process.exitCode = code;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
