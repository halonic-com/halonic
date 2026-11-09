import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { linuxProcessTable, parseProcStatus } from "./linux-process-table.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** A `status` file as Linux writes it, cut to the lines the reader uses and a few around them. */
function statusText(pid: number, parentPid: number, name: string, rss?: string): string {
  return [
    `Name:\t${name}`,
    "State:\tS (sleeping)",
    `Pid:\t${pid}`,
    `PPid:\t${parentPid}`,
    ...(rss === undefined ? [] : [`VmRSS:\t${rss}`]),
    "Threads:\t1",
  ].join("\n");
}

verifies("system-node.resource-probe", () => {
  it("reads the pid, parent, name and resident memory from a status file", () => {
    expect(parseProcStatus(statusText(42, 7, "claude", "  2048 kB"))).toEqual({
      pid: 42,
      parentPid: 7,
      name: "claude",
      memoryBytes: 2048 * 1024,
    });
  });

  it("gives a kernel thread, which has no VmRSS line, 0 bytes", () => {
    expect(parseProcStatus(statusText(2, 0, "kthreadd"))?.memoryBytes).toBe(0);
  });

  it("leaves out a status file without a pid, parent or name", () => {
    expect(parseProcStatus("Name:\tx\nPPid:\t1")).toBeUndefined();
    expect(parseProcStatus("Name:\tx\nPid:\t3")).toBeUndefined();
    expect(parseProcStatus("Pid:\t3\nPPid:\t1")).toBeUndefined();
  });

  it("reads every numbered folder and leaves out a process that ended meanwhile", async () => {
    const proc = await tempFolder();
    for (const [pid, parentPid, name] of [
      [1, 0, "init"],
      [42, 1, "claude"],
    ] as const) {
      await mkdir(join(proc, String(pid)));
      await writeFile(join(proc, String(pid), "status"), statusText(pid, parentPid, name, "4 kB"));
    }
    // A process whose folder is still listed but whose status file is gone.
    await mkdir(join(proc, "77"));
    await mkdir(join(proc, "self"));
    const { rows, readerPid } = await linuxProcessTable(proc)();
    expect(readerPid).toBeUndefined();
    expect(rows.map((row) => row.name).sort()).toEqual(["claude", "init"]);
  });

  it("throws a read error that doesn't mean the process ended", async () => {
    const proc = await tempFolder();
    // A folder where `status` should be gives EISDIR, which is a real problem.
    await mkdir(join(proc, "5", "status"), { recursive: true });
    await expect(linuxProcessTable(proc)()).rejects.toMatchObject({ code: "EISDIR" });
  });
});
