import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildWorkerBundle } from "./worker-bundle.ts";

/** The Worker script, as `halonic deploy` uploads it. */
export const workerScriptFile = "halonic-worker.js";
/** What the script needs to go up: its hash, compatibility date and Durable Objects. */
export const workerManifestFile = "halonic-worker.json";

/** One Durable Object binding, as Cloudflare's upload names its fields. */
export interface DurableObjectBinding {
  readonly name: string;
  readonly class_name: string;
}

/** One Durable Object migration: only new SQLite classes, the one kind the Worker uses. */
export interface DurableObjectMigration {
  readonly tag: string;
  readonly new_sqlite_classes: readonly string[];
}

/** What `wrangler.toml` pins for the Worker, read by {@link readWranglerConfig}. */
export interface WranglerConfig {
  readonly compatibilityDate: string;
  readonly durableObjects: readonly DurableObjectBinding[];
  readonly durableObjectMigrations: readonly DurableObjectMigration[];
}

/** The contents of `halonic-worker.json`. */
export interface WorkerManifest extends WranglerConfig {
  /** Lowercase hex SHA-256 of `halonic-worker.js`'s bytes; the upload refuses a script that doesn't match. */
  readonly hash: string;
}

/** The repository-relative paths the Worker is built from. */
const runtimeEntry = "packages/targets/cloudflare/runtime/src/index.ts";
const runtimeWrangler = "packages/targets/cloudflare/runtime/wrangler.toml";

/**
 * Builds the Worker and writes it into `directory` as `halonic-worker.js`, with
 * `halonic-worker.json` beside it (requirement `publish.worker-files`). The
 * compatibility date and the Durable Objects come from the runtime's
 * `wrangler.toml`, so they ship with the script and a user's config never
 * sets them. Both files are the same bytes on every build of the same sources.
 *
 * @param root - the repository's root folder
 * @param directory - where the two files go; made when missing
 * @returns the manifest it wrote
 * @throws Error when the Worker doesn't build (see `buildWorkerBundle`) or `wrangler.toml` can't be read
 */
export async function writeWorkerFiles(root: string, directory: string): Promise<WorkerManifest> {
  const config = readWranglerConfig(await readFile(join(root, runtimeWrangler), "utf8"));
  const { script, hash } = await buildWorkerBundle(join(root, runtimeEntry));
  const manifest: WorkerManifest = { hash, ...config };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, workerScriptFile), script, "utf8");
  await writeFile(join(directory, workerManifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** One `[table]` or `[[array of tables]]` of the file, with its `key = value` lines; `""` for the top. */
interface Table {
  readonly header: string;
  readonly entries: { readonly key: string; readonly value: string; readonly where: string }[];
}

/**
 * Reads the compatibility date, the Durable Object bindings and their
 * migrations from the runtime's `wrangler.toml`. It reads only the plain
 * forms that file uses (a quoted string, or a one-line list of quoted
 * strings) and refuses anything else in those parts, such as a migration
 * that renames or deletes a class, rather than leave it out of the upload.
 *
 * @throws Error naming the line or the part it can't read
 */
export function readWranglerConfig(text: string): WranglerConfig {
  const tables = tablesOf(text);
  const date = tables[0]?.entries.find(({ key }) => key === "compatibility_date");
  const compatibilityDate = date === undefined ? undefined : quoted(date.value, date.where);
  if (compatibilityDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)) {
    throw new Error("wrangler.toml has no compatibility_date as YYYY-MM-DD.");
  }
  const durableObjects = tables
    .filter(({ header }) => header === "[[durable_objects.bindings]]")
    .map(bindingOf);
  if (durableObjects.length === 0) throw new Error("wrangler.toml has no Durable Object binding.");
  const durableObjectMigrations = tables
    .filter(({ header }) => header === "[[migrations]]")
    .map(migrationOf);
  return { compatibilityDate, durableObjects, durableObjectMigrations };
}

/** The file's tables in order, the top one first; comments and blank lines left out. */
function tablesOf(text: string): Table[] {
  const tables: Table[] = [{ header: "", entries: [] }];
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.replace(/\s+#.*$|^#.*$/, "").trim();
    const where = `wrangler.toml line ${index + 1}`;
    if (line.startsWith("[")) tables.push({ header: line, entries: [] });
    else if (line !== "") {
      const match = /^([A-Za-z_]+)\s*=\s*(.+)$/.exec(line);
      if (match === null) throw new Error(`${where} isn't a key and a value.`);
      const [, key = "", value = ""] = match;
      tables.at(-1)?.entries.push({ key, value, where });
    }
  }
  return tables;
}

function bindingOf({ entries }: Table): DurableObjectBinding {
  const fields: Record<string, string> = {};
  for (const { key, value, where } of entries) {
    if (key !== "name" && key !== "class_name") {
      throw new Error(`${where}: a Durable Object binding with "${key}" can't ship yet.`);
    }
    fields[key] = quoted(value, where);
  }
  const { name, class_name } = fields;
  if (name === undefined || class_name === undefined) {
    throw new Error("A Durable Object binding in wrangler.toml lacks its name or class_name.");
  }
  return { name, class_name };
}

function migrationOf({ entries }: Table): DurableObjectMigration {
  let tag: string | undefined;
  let classes: string[] | undefined;
  for (const { key, value, where } of entries) {
    if (key === "tag") tag = quoted(value, where);
    else if (key === "new_sqlite_classes") classes = quotedList(value, where);
    else throw new Error(`${where}: a migration with "${key}" can't ship yet.`);
  }
  if (tag === undefined || classes === undefined) {
    throw new Error("A migration in wrangler.toml lacks its tag or new_sqlite_classes.");
  }
  return { tag, new_sqlite_classes: classes };
}

function quoted(value: string, where: string): string {
  const match = /^"([^"\\]*)"$/.exec(value);
  if (match?.[1] === undefined) throw new Error(`${where} isn't a plain quoted string.`);
  return match[1];
}

function quotedList(value: string, where: string): string[] {
  const match = /^\[(.*)\]$/.exec(value);
  if (match?.[1] === undefined) throw new Error(`${where} isn't a one-line list.`);
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => quoted(item, where));
}
