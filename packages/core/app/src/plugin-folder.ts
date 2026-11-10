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
import {
  type Digest,
  type FolderEntry,
  type FolderReader,
  integrationVersion,
} from "@halonicjs/ports";
import { bytesToHex, decodeUtf8, err, ok, type Result } from "@halonicjs/std";
import type { PluginFileHash } from "./plugin-trust-content.ts";

/** At most this many files and folders in one plugin folder (D3), so hashing stays cheap. */
export const MAX_PLUGIN_ENTRIES = 2_000;

/** At most this many bytes in one plugin folder's files together (D3). */
export const MAX_PLUGIN_BYTES = 50 * 1024 * 1024;

/**
 * Something wrong with a plugin folder. Studio shows it on the plugin's row,
 * and the CLI prints it.
 */
export interface PluginProblem {
  /** Names the rule, such as `folder-name` or a manifest problem's own code. */
  readonly code: string;
  /** The file it is about, from the plugin folder, such as `plugin.yaml`; `""` for the folder itself. */
  readonly file: string;
  /** Where in the manifest, as keys and list indexes; `[]` when it isn't about one value. */
  readonly path: readonly (string | number)[];
  readonly message: string;
  /** For a problem in the manifest: its 1-based line and column. */
  readonly line?: number;
  readonly col?: number;
}

/** A plugin folder that was read and checked: what its trust check needs. */
export interface PluginFolder {
  /** The folder's resolved real path: the trust record's key. */
  readonly location: string;
  readonly plugin: Plugin;
  /** Every file and the hash of the bytes read, by path from the plugin folder, sorted. */
  readonly files: readonly PluginFileHash[];
}

/** The two manifest names, of which a plugin folder has exactly one (ADR section 1.5). */
const manifestNames = ["plugin.yaml", "integration.yaml"] as const;
type ManifestName = (typeof manifestNames)[number];

/** The ADR's sentence for a backend with `tokens`, the same as for a local integration. */
const noTokensMessage =
  "Integrations you build or change can't keep sign-in tokens yet. Use an API key, or ask for sign-in support.";

/**
 * Reads the plugin folder `folder` of `reader`, the profile's plugin folder.
 * It lists the folder and refuses it on its listing alone (size, links,
 * special files) before reading any bytes.
 *
 * @param reader - the profile's plugin folder
 * @param digest - for the SHA-256 of every file
 * @param folder - the plugin folder's name, which must be the plugin's id
 * @returns the plugin, its location and file hashes, or every problem found
 * @throws only what the reader or the digest throws, such as a file that
 *   became a link while it was read
 */
export async function readPluginFolder(
  reader: FolderReader,
  digest: Digest,
  folder: string,
): Promise<Result<PluginFolder, PluginProblem[]>> {
  const entries = await reader.entries(folder, { limit: MAX_PLUGIN_ENTRIES });
  const listed = listingProblems(entries, folder);
  if (listed.length > 0) return err(listed);

  const files = entries.filter((entry) => entry.kind === "file");
  const manifests = manifestNames.filter((name) =>
    files.some((file) => file.path === `${folder}/${name}`),
  );
  if (manifests.length !== 1) return err([manifestCountProblem(manifests.length)]);
  const [manifestName] = manifests as [ManifestName];

  const hashes: PluginFileHash[] = [];
  let manifestBytes: Uint8Array | undefined;
  for (const file of files) {
    const path = inFolder(file.path, folder);
    const bytes = await reader.read(file.path);
    if (bytes === null) return err([changedWhileReadProblem(path)]);
    if (path === manifestName) manifestBytes = bytes;
    hashes.push({ path, sha256: bytesToHex(await digest.sha256(bytes)) });
  }

  // Parsed from the bytes that were hashed, so the manifest trusted is the one checked.
  const parsed = parseManifest(manifestName, decodeUtf8(manifestBytes ?? new Uint8Array()));
  if (!parsed.ok) return err(parsed.error);
  const plugin = parsed.value;
  const fileSet = new Set(hashes.map((file) => file.path));
  const checked = pluginProblems(plugin, folder, fileSet).map((problem) =>
    inManifest(manifestName, problem),
  );
  if (checked.length > 0) return err(checked);

  const location = await reader.locationOf(folder);
  if (location === null) return err([changedWhileReadProblem("")]);
  return ok({ location, plugin, files: hashes });
}

/** Problems the listing alone shows: past a limit, or a link or special file anywhere (checks 6 and 7). */
function listingProblems(entries: readonly FolderEntry[], folder: string): PluginProblem[] {
  if (entries.length > MAX_PLUGIN_ENTRIES) {
    return [
      folderProblem(
        "too-many-files",
        `The plugin folder holds more than ${MAX_PLUGIN_ENTRIES.toLocaleString("en")} files and folders, the most a plugin may have. A .git folder inside it counts too: install the plugin without it.`,
      ),
    ];
  }
  const bytes = entries.reduce(
    (total, entry) => total + (entry.kind === "file" ? entry.size : 0),
    0,
  );
  if (bytes > MAX_PLUGIN_BYTES) {
    return [
      folderProblem(
        "too-large",
        `The plugin folder's files come to more than ${MAX_PLUGIN_BYTES / (1024 * 1024)} MB, the most a plugin may have. A .git folder inside it counts too: install the plugin without it.`,
      ),
    ];
  }
  return entries.flatMap((entry): PluginProblem[] => {
    const file = inFolder(entry.path, folder);
    if (entry.kind === "link") {
      return [
        fileProblem(
          "link",
          file,
          `${file} is a link. A plugin folder holds only files and folders, so a link can't point Halonic at a file it didn't check.`,
        ),
      ];
    }
    if (entry.kind === "other") {
      return [
        fileProblem(
          "special-file",
          file,
          `${file} is a special file, such as a pipe or a socket. A plugin folder holds only files and folders.`,
        ),
      ];
    }
    return [];
  });
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

function changedWhileReadProblem(file: string): PluginProblem {
  return fileProblem(
    "changed-while-read",
    file,
    `${file === "" ? "The plugin folder" : file} was removed while Halonic read the plugin. Load it again.`,
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

/** The checks over the parsed plugin that need its folder (checks 2 to 5), with paths in a `plugin.yaml`. */
function pluginProblems(
  plugin: Plugin,
  folder: string,
  files: ReadonlySet<string>,
): PluginProblem[] {
  const problems: PluginProblem[] = [];
  if (plugin.id !== folder) {
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

/** `path` from the plugin folder: `weather/backend/index.js` is `backend/index.js` in `weather`. */
function inFolder(path: string, folder: string): string {
  return path.slice(folder.length + 1);
}

function folderProblem(code: string, message: string): PluginProblem {
  return { code, file: "", path: [], message };
}

function fileProblem(code: string, file: string, message: string): PluginProblem {
  return { code, file, path: [], message };
}

/** A problem at a value of a `plugin.yaml`; `inManifest` moves it to an `integration.yaml`. */
function manifestValueProblem(
  code: string,
  path: (string | number)[],
  message: string,
): PluginProblem {
  return { code, file: "plugin.yaml", path, message };
}
