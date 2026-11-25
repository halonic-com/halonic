import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type PaperclipConnection, parsePaperclipConnection } from "@halonicjs/format";
import { PAPERCLIP_CONNECTIONS_FOLDER } from "@halonicjs/workspace";

/**
 * Reads `connections/paperclip/<connection>.yaml` in `workspace` as it is
 * now. The key's guard reads it again before every request, so a pull or a
 * branch switch that changes the file counts from the next request on.
 *
 * @param connection - the connection's name, which the host's routes allow only as letters, digits, `_` and `-`
 * @returns the connection, or `undefined` when the file is gone or fails its checks: then no request is made
 */
export async function readConnectionFile(
  workspace: string,
  connection: string,
): Promise<PaperclipConnection | undefined> {
  const path = join(workspace, PAPERCLIP_CONNECTIONS_FOLDER, `${connection}.yaml`);
  let text: string;
  try {
    // A symlinked file is followed on purpose. It can only name an address and a
    // company, and the key's guard sends the key only when both match the ones the
    // key was made for, so a link to another file can't send the key anywhere new.
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parsePaperclipConnection(text);
  return parsed.ok ? parsed.value.value : undefined;
}

/** One connection file, by its name. */
export interface NamedConnection {
  /** The file name without `.yaml`. */
  name: string;
  connection: PaperclipConnection;
}

/**
 * Reads every connection file in `workspace` whose name the host's routes
 * allow, sorted by name. A file that fails its checks is left out, as the
 * key's guard leaves it out.
 *
 * @param namePattern - the names the routes allow: letters, digits, `_` and `-`
 */
export async function listConnectionFiles(
  workspace: string,
  namePattern: RegExp,
): Promise<NamedConnection[]> {
  let entries: string[];
  try {
    entries = await readdir(join(workspace, PAPERCLIP_CONNECTIONS_FOLDER));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const names = entries
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => entry.slice(0, -".yaml".length))
    .filter((name) => namePattern.test(name))
    .sort();
  const read = await Promise.all(
    names.map(async (name) => ({ name, connection: await readConnectionFile(workspace, name) })),
  );
  return read.flatMap(({ name, connection }) =>
    connection === undefined ? [] : [{ name, connection }],
  );
}

/**
 * Writes a new `connections/paperclip/<name>.yaml` with only the label, the
 * address and the company: never a key, never Paperclip's data. It never
 * replaces a file that is there already.
 *
 * @throws when the file exists or can't be written
 */
export async function writeConnectionFile(
  workspace: string,
  name: string,
  connection: PaperclipConnection,
): Promise<void> {
  const folder = join(workspace, PAPERCLIP_CONNECTIONS_FOLDER);
  await mkdir(folder, { recursive: true });
  // JSON strings are YAML's double-quoted strings, so no label can break the file.
  const text = [
    `label: ${JSON.stringify(connection.label)}`,
    `address: ${JSON.stringify(connection.address)}`,
    `company: ${JSON.stringify(connection.company)}`,
    "",
  ].join("\n");
  await writeFile(join(folder, `${name}.yaml`), text, { encoding: "utf8", flag: "wx" });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
