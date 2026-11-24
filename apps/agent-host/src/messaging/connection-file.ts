import { readFile } from "node:fs/promises";
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
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const parsed = parsePaperclipConnection(text);
  return parsed.ok ? parsed.value.value : undefined;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
