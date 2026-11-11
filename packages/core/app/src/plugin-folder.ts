// Reads one plugin folder, as `app.plugin-folder` asks: lists it, checks it
// (P2 plan section 3), hashes every file and parses the manifest from the
// same bytes it hashed. It never throws for a problem it can name: the
// plugin service shows those, and keeps loading the other plugins.

import {
  type FileProblem,
  type Plugin,
  parseFile,
  pluginFromIntegrationSheet,
} from "@halonicjs/format";
import { type Digest, type FolderReader, integrationVersion } from "@halonicjs/ports";
import { bytesToHex, decodeUtf8, err, ok, type Result } from "@halonicjs/std";
import {
  CountingReader,
  changedWhileReadProblem,
  type FolderNoun,
  type FolderProblem,
  folderProblem,
  inFolder,
  listingProblems,
  MAX_FOLDER_BYTES,
  MAX_FOLDER_ENTRIES,
} from "./folder-listing.ts";
import type { PluginFileHash } from "./plugin-trust-content.ts";

/** At most this many files and folders in one plugin folder (D3), so hashing stays cheap. */
export const MAX_PLUGIN_ENTRIES = MAX_FOLDER_ENTRIES;

/** At most this many bytes in one plugin folder's files together (D3). */
export const MAX_PLUGIN_BYTES = MAX_FOLDER_BYTES;

/**
 * Something wrong with a plugin folder. Studio shows it on the plugin's row,
 * and the CLI prints it.
 */
export type PluginProblem = FolderProblem;

/** How the folder checks' messages name a plugin folder. */
const pluginNoun: FolderNoun = {
  theFolder: "The plugin folder",
  aFolder: "A plugin folder",
  theFiles: "The plugin folder's files",
  one: "a plugin",
  it: "the plugin",
  withoutGit: "install the plugin without it",
};

/** A plugin folder that was read and checked: what its trust check needs. */
export interface PluginFolder {
  /** The folder's resolved real path: the trust record's key. */
  readonly location: string;
  readonly plugin: Plugin;
  /** Every file and the hash of the bytes read, by path from the plugin folder, sorted. */
  readonly files: readonly PluginFileHash[];
}

/** How {@link readPluginFolder} reads a folder. */
export interface ReadPluginFolderOptions {
  /**
   * Whether the folder must be named exactly as the plugin's id, as every
   * folder in the profile's plugins folder must (D5). `false` for a plugin's
   * source, which may have any name: adding it names its folder by the id.
   * `true` by default.
   */
  readonly namedById?: boolean;
}

/** The two manifest names, of which a plugin folder has exactly one (ADR section 1.5). */
const manifestNames = ["plugin.yaml", "integration.yaml"] as const;
type ManifestName = (typeof manifestNames)[number];

/** The ADR's sentence for a backend with `tokens`: the local integration's message, with the fix naming the backend. */
const noTokensMessage =
  "An integration you build or change can't hold sign-in secrets yet. Remove tokens from its backend and use an API key, or ask for sign-in support.";

/**
 * Reads the plugin folder `folder` of `reader`, the profile's plugin folder.
 * It lists the folder and refuses it on its listing alone (size, links,
 * special files) before reading any bytes, then reads the manifest and runs
 * its checks before reading any other file.
 *
 * @param reader - the profile's plugin folder
 * @param digest - for the SHA-256 of every file
 * @param folder - the plugin folder's name, which must be the plugin's id
 *   unless `options.namedById` is `false`
 * @returns the plugin, its location and file hashes, or every problem found
 * @throws only what the reader or the digest throws, such as a file that
 *   became a link while it was read
 */
export async function readPluginFolder(
  reader: FolderReader,
  digest: Digest,
  folder: string,
  options: ReadPluginFolderOptions = {},
): Promise<Result<PluginFolder, PluginProblem[]>> {
  const entries = await reader.entries(folder, { limit: MAX_PLUGIN_ENTRIES });
  const listed = listingProblems(entries, folder, pluginNoun);
  if (listed.length > 0) return err(listed);

  const files = entries.filter((entry) => entry.kind === "file");
  const manifests = manifestNames.filter((name) =>
    files.some((file) => file.path === `${folder}/${name}`),
  );
  if (manifests.length !== 1) return err([manifestCountProblem(manifests.length)]);
  const [manifestName] = manifests as [ManifestName];
  const paths = files.map((file) => inFolder(file.path, folder));

  // The manifest first, and its checks before any other file is read, so a
  // plugin they refuse is never hashed (HAL-4352 review).
  const hashing = new HashingReader(reader, digest, folder);
  const manifestBytes = await hashing.read(manifestName);
  if (!manifestBytes.ok) return err([manifestBytes.error]);
  // Parsed from the bytes that were hashed, so the manifest trusted is the one checked.
  const parsed = parseManifest(manifestName, decodeUtf8(manifestBytes.value));
  if (!parsed.ok) return err(parsed.error);
  const plugin = parsed.value;
  const namedById = options.namedById ?? true;
  const checked = pluginProblems(plugin, namedById ? folder : null, new Set(paths)).map((problem) =>
    inManifest(manifestName, problem),
  );
  if (checked.length > 0) return err(checked);

  for (const path of paths) {
    if (path === manifestName) continue;
    const read = await hashing.read(path);
    if (!read.ok) return err([read.error]);
  }

  const location = await reader.locationOf(folder);
  if (location === null) return err([changedWhileReadProblem("", pluginNoun)]);
  return ok({ location, plugin, files: hashing.hashes() });
}

/** Reads files of one plugin folder, counting the bytes as {@link CountingReader} does, and keeps the hash of each. */
class HashingReader {
  readonly #files: CountingReader;
  readonly #digest: Digest;
  readonly #hashes = new Map<string, string>();

  constructor(reader: FolderReader, digest: Digest, folder: string) {
    this.#files = new CountingReader(reader, folder, pluginNoun);
    this.#digest = digest;
  }

  /** The bytes of `path`, from the plugin folder, hashed; or why they can't be used. */
  async read(path: string): Promise<Result<Uint8Array, PluginProblem>> {
    const bytes = await this.#files.read(path);
    if (!bytes.ok) return bytes;
    this.#hashes.set(path, bytesToHex(await this.#digest.sha256(bytes.value)));
    return bytes;
  }

  /** The hash of every file read, sorted by path in plain code-unit order, as the port lists them. */
  hashes(): PluginFileHash[] {
    return [...this.#hashes]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([path, sha256]) => ({ path, sha256 }));
  }
}

function manifestCountProblem(count: number): PluginProblem {
  return count === 0
    ? folderProblem(
        "manifest-missing",
        "The plugin folder has no plugin.yaml (or integration.yaml), so it isn't a plugin.",
      )
    : folderProblem(
        "manifest-twice",
        "The plugin folder has both plugin.yaml and integration.yaml. Keep one: a plugin.yaml can hold the integration as its backend.",
      );
}

/** The manifest as a plugin: a `plugin.yaml` as it is, an `integration.yaml` as a plugin with only a backend. */
function parseManifest(name: ManifestName, text: string): Result<Plugin, PluginProblem[]> {
  if (name === "plugin.yaml") {
    const parsed = parseFile("plugin", text);
    return parsed.ok
      ? ok(parsed.value.value)
      : err(parsed.error.map((problem) => manifestProblem(name, problem)));
  }
  const parsed = parseFile("integration", text);
  if (!parsed.ok) return err(parsed.error.map((problem) => manifestProblem(name, problem)));
  return ok(pluginFromIntegrationSheet(parsed.value.value));
}

function manifestProblem(file: ManifestName, problem: FileProblem): PluginProblem {
  const { code, path, message, line, col } = problem;
  return { code, file, path, message, line, col };
}

/**
 * A check's problem in the manifest the folder has. The checks name keys of
 * a `plugin.yaml`; an `integration.yaml` has the backend's keys at its top,
 * calls `sdk` `kit`, and has no `entry`.
 */
function inManifest(name: ManifestName, problem: PluginProblem): PluginProblem {
  if (name === "plugin.yaml") return problem;
  return { ...problem, file: name, path: sheetPath(problem.path) };
}

function sheetPath(path: readonly (string | number)[]): readonly (string | number)[] {
  const [first, ...rest] = path;
  if (first === "sdk") return ["kit"];
  if (first !== "backend") return path;
  // The code's place isn't written in the sheet, so the problem is about the file as a whole.
  if (rest[0] === "entry") return [];
  return rest;
}

/**
 * The checks over the parsed plugin that need its folder (checks 2 to 5),
 * with paths in a `plugin.yaml`. `folder` is the name the id must match, or
 * `null` when the folder may have any name.
 */
function pluginProblems(
  plugin: Plugin,
  folder: string | null,
  files: ReadonlySet<string>,
): PluginProblem[] {
  const problems: PluginProblem[] = [];
  if (folder !== null && plugin.id !== folder) {
    problems.push(
      manifestValueProblem(
        "folder-name",
        ["id"],
        `The plugin's id is "${plugin.id}", but its folder is named "${folder}". The folder must be named exactly as the id.`,
      ),
    );
  }
  if (plugin.sdk !== integrationVersion) {
    problems.push(
      manifestValueProblem(
        "sdk-version",
        ["sdk"],
        `The plugin is built for plugin SDK ${plugin.sdk}, and this Halonic runs SDK ${integrationVersion}. Get a version of the plugin built for SDK ${integrationVersion}.`,
      ),
    );
  }
  if ((plugin.backend?.tokens.length ?? 0) > 0) {
    problems.push(manifestValueProblem("backend-tokens", ["backend", "tokens"], noTokensMessage));
  }
  const needed: [string, (string | number)[]][] = [];
  if (plugin.backend !== undefined) needed.push([plugin.backend.entry, ["backend", "entry"]]);
  (plugin.localTools ?? []).forEach((tool, index) => {
    const script = tool.start.script;
    if (script !== undefined)
      needed.push([script.path, ["localTools", index, "start", "script", "path"]]);
  });
  for (const [file, path] of needed) {
    if (!files.has(file)) {
      problems.push(
        manifestValueProblem("file-missing", path, `${file} isn't a file in the plugin folder.`),
      );
    }
  }
  return problems;
}

/** A problem at a value of a `plugin.yaml`; `inManifest` moves it to an `integration.yaml`. */
function manifestValueProblem(
  code: string,
  path: (string | number)[],
  message: string,
): PluginProblem {
  return { code, file: "plugin.yaml", path, message };
}
