import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ReadProcessTable, wholeNumber } from "./process-table.ts";
import type { ProcessRow } from "./process-tree.ts";

/**
 * Reads the process table from `/proc` on Linux: one `status` file per
 * process. No program is started, so it's quick enough to ask often.
 *
 * @param procFolder - where `/proc` is; tests give a folder of their own
 */
export function linuxProcessTable(procFolder = "/proc"): ReadProcessTable {
  return async () => {
    const entries = await readdir(procFolder);
    const pids = entries.filter((entry) => wholeNumber(entry) !== undefined);
    const rows = await Promise.all(pids.map((pid) => readStatus(join(procFolder, pid, "status"))));
    return { rows: rows.filter((row) => row !== undefined) };
  };
}

async function readStatus(path: string): Promise<ProcessRow | undefined> {
  try {
    return parseProcStatus(await readFile(path, "utf8"));
  } catch (error) {
    // The process ended between listing `/proc` and reading its file.
    if (endedMeanwhile(error)) return undefined;
    throw error;
  }
}

/**
 * One process from the text of its `/proc/<pid>/status` file, or
 * `undefined` when the text has no pid, parent or name. A kernel thread has no
 * `VmRSS` line and holds 0 bytes.
 */
export function parseProcStatus(text: string): ProcessRow | undefined {
  const fields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields.set(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  const pid = wholeNumber(fields.get("Pid"));
  const parentPid = wholeNumber(fields.get("PPid"));
  const name = fields.get("Name");
  if (pid === undefined || parentPid === undefined || !name) return undefined;
  const residentKibibytes = wholeNumber(fields.get("VmRSS")?.replace(/\s*kB$/, "")) ?? 0;
  return { pid, parentPid, name, memoryBytes: residentKibibytes * 1024 };
}

function endedMeanwhile(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ESRCH";
}
