import {
  baseName,
  type ReadProcessTable,
  type RunProgram,
  tableReadBy,
  wholeNumber,
} from "./process-table.ts";
import type { ProcessRow } from "./process-tree.ts";

/**
 * `ps` by its full path, so a program called `ps` in the working folder or
 * on `PATH` can't answer instead.
 */
export const psProgram = "/bin/ps";

/** Every process; the `=` after each column leaves out the header line. */
export const psArguments = ["-A", "-o", "pid=,ppid=,rss=,comm="] as const;

/**
 * Reads the process table with `ps`, on macOS and the other Unix systems
 * without `/proc`.
 */
export function psProcessTable(run: RunProgram): ReadProcessTable {
  return async () => {
    const { output, pid } = await run(psProgram, psArguments);
    // `ps` lists itself, as a child of the engine.
    return tableReadBy(parsePsOutput(output), pid);
  };
}

/**
 * The processes in the output of `ps -A -o pid=,ppid=,rss=,comm=`. `rss`
 * is in kibibytes. `comm` comes last because it may hold spaces; on macOS
 * it's the program's full path. Lines that don't fit are left out.
 */
export function parsePsOutput(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split("\n")) {
    const columns = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    const pid = wholeNumber(columns?.[1]);
    const parentPid = wholeNumber(columns?.[2]);
    const residentKibibytes = wholeNumber(columns?.[3]);
    const command = columns?.[4];
    if (pid === undefined || parentPid === undefined || residentKibibytes === undefined) continue;
    if (command === undefined) continue;
    rows.push({ pid, parentPid, name: baseName(command), memoryBytes: residentKibibytes * 1024 });
  }
  return rows;
}
