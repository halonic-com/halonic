import {
  type PaperclipConnection,
  paperclipConnectionKey,
  parsePaperclipConnection,
} from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import type { WorkspaceIssue } from "./load-workspace.ts";

/** The folder that holds a workspace's Paperclip connections, one file each. */
export const PAPERCLIP_CONNECTIONS_FOLDER = "connections/paperclip";

const fileEnding = ".yaml";

/** One Paperclip connection, read from its file. */
export interface PaperclipConnectionFile {
  /** The file name without `.yaml`, such as `halonic`: how the workspace names the connection. */
  readonly name: string;
  /** The workspace-relative path, such as `connections/paperclip/halonic.yaml`. */
  readonly path: string;
  readonly connection: PaperclipConnection;
}

/** A workspace's Paperclip connections and what was wrong with the files that were refused. */
export interface PaperclipConnections {
  /** The connections that were read, sorted by name. */
  readonly connections: readonly PaperclipConnectionFile[];
  /** Every problem, by file; a file with an error isn't among the connections. */
  readonly issues: readonly WorkspaceIssue[];
}

/**
 * Reads every `connections/paperclip/<name>.yaml` in a workspace
 * (`workspace.paperclip-connection`). Each file is one connection, named by
 * its file name. A file that fails its checks is left out with its problems,
 * and so is a second file for the same server and company, which would show
 * every item twice. Files in deeper folders, or not ending in `.yaml`, are
 * not connections and are skipped.
 *
 * @param source - where the workspace files live
 * @returns the connections, sorted by name, and the issues of the refused files
 *
 * @example
 * const { connections, issues } = await readPaperclipConnections(source);
 * for (const each of connections) console.log(each.name, each.connection.label);
 */
export async function readPaperclipConnections(
  source: DefinitionSource,
): Promise<PaperclipConnections> {
  const paths = (await source.list(PAPERCLIP_CONNECTIONS_FOLDER)).filter(isConnectionPath).sort();
  const connections: PaperclipConnectionFile[] = [];
  const issues: WorkspaceIssue[] = [];
  const firstPathOf = new Map<string, string>();
  for (const path of paths) {
    const text = await source.read(path);
    if (text === null) {
      continue; // Removed between list and read: the workspace no longer has it.
    }
    const parsed = parsePaperclipConnection(text);
    if (!parsed.ok) {
      for (const problem of parsed.error) issues.push({ ...problem, file: path });
      continue;
    }
    const connection = parsed.value.value;
    const key = paperclipConnectionKey(connection);
    const firstPath = firstPathOf.get(key);
    if (firstPath !== undefined) {
      issues.push(duplicateIssue(path, firstPath));
      continue;
    }
    firstPathOf.set(key, path);
    connections.push({ name: nameOf(path), path, connection });
  }
  return { connections, issues };
}

/** A file right in the folder whose name ends in `.yaml`. */
function isConnectionPath(path: string): boolean {
  const prefix = `${PAPERCLIP_CONNECTIONS_FOLDER}/`;
  if (!path.startsWith(prefix) || !path.endsWith(fileEnding)) {
    return false;
  }
  const fileName = path.slice(prefix.length);
  return !fileName.includes("/") && fileName.length > fileEnding.length;
}

function nameOf(path: string): string {
  return path.slice(PAPERCLIP_CONNECTIONS_FOLDER.length + 1, -fileEnding.length);
}

function duplicateIssue(path: string, firstPath: string): WorkspaceIssue {
  return {
    severity: "error",
    source: "check",
    code: "duplicate-paperclip-connection",
    path: [],
    message: `This file connects to the same Paperclip address and company as ${firstPath}. Keep one of the two files.`,
    file: path,
    line: 1,
    col: 1,
  };
}
