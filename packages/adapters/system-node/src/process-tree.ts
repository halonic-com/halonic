import type { ProcessUsage } from "@halonicjs/ports";

/** One line of the operating system's process table. */
export interface ProcessRow {
  readonly pid: number;
  /** The process that started this one, as the operating system remembers it. */
  readonly parentPid: number;
  /** The program's name, without its folder. */
  readonly name: string;
  /** The memory the process holds now (its resident set or working set), in bytes. */
  readonly memoryBytes: number;
  /**
   * When the process started, on any clock that only grows, where the
   * system gives it. Windows keeps a dead parent's pid on its children and
   * reuses pids soon, so a child that started before its "parent" belongs
   * to an earlier process with the same pid.
   */
  readonly startedAt?: number;
}

/**
 * The processes below `rootPid` in `rows`: its children, their children and
 * so on, once each and in ascending `pid` order. The root itself isn't one.
 *
 * @param leaveOut - a process to leave out with everything below it, such as
 * the program that read the table
 */
export function descendantsOf(
  rootPid: number,
  rows: readonly ProcessRow[],
  leaveOut?: number,
): ProcessUsage[] {
  const childrenOf = groupByParent(rows);
  const root = rows.find((row) => row.pid === rootPid);
  const found = new Map<number, ProcessRow>();
  const toVisit: Pick<ProcessRow, "pid" | "startedAt">[] = [root ?? { pid: rootPid }];

  for (let parent = toVisit.pop(); parent !== undefined; parent = toVisit.pop()) {
    for (const child of childrenOf.get(parent.pid) ?? []) {
      // A loop in the table (a pid reused as its own ancestor) must not be walked twice.
      if (child.pid === rootPid || found.has(child.pid)) continue;
      if (child.pid === leaveOut) continue;
      if (startedBefore(child, parent)) continue;
      found.set(child.pid, child);
      toVisit.push(child);
    }
  }

  return [...found.values()]
    .sort((a, b) => a.pid - b.pid)
    .map((row) => ({ pid: row.pid, name: row.name, memoryBytes: row.memoryBytes }));
}

function groupByParent(rows: readonly ProcessRow[]): Map<number, ProcessRow[]> {
  const childrenOf = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const siblings = childrenOf.get(row.parentPid);
    if (siblings === undefined) childrenOf.set(row.parentPid, [row]);
    else siblings.push(row);
  }
  return childrenOf;
}

/** Whether `child` started before `parent`, when both start times are known. */
function startedBefore(child: ProcessRow, parent: Pick<ProcessRow, "startedAt">): boolean {
  if (child.startedAt === undefined || parent.startedAt === undefined) return false;
  return child.startedAt < parent.startedAt;
}
