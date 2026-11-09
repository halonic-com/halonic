import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsePsOutput, psArguments, psProcessTable, psProgram } from "./ps-process-table.ts";
import { NodeResourceProbe } from "./resource-probe.ts";

verifies("system-node.resource-probe", () => {
  it("reads pid, parent, kibibytes and the program's name without its folder", () => {
    const output = [
      "    1     0  12000 /sbin/launchd",
      "  420     1   2048 /Applications/Some App.app/Contents/MacOS/Some App",
      "  421   420      0 claude",
      "",
    ].join("\n");
    expect(parsePsOutput(output)).toEqual([
      { pid: 1, parentPid: 0, name: "launchd", memoryBytes: 12000 * 1024 },
      { pid: 420, parentPid: 1, name: "Some App", memoryBytes: 2048 * 1024 },
      { pid: 421, parentPid: 420, name: "claude", memoryBytes: 0 },
    ]);
  });

  it("leaves out lines that don't fit", () => {
    expect(parsePsOutput("PID PPID RSS COMM\n  12  1  x  bash\n  13  1  4\n")).toEqual([]);
  });

  it("runs ps by its full path with the columns it parses", async () => {
    const calls: [string, readonly string[]][] = [];
    const read = psProcessTable(async (program, args) => {
      calls.push([program, args]);
      return { output: "  9  1  8  zsh\n", pid: 12 };
    });
    expect(await read()).toEqual({
      rows: [{ pid: 9, parentPid: 1, name: "zsh", memoryBytes: 8192 }],
      readerPid: 12,
    });
    expect(calls).toEqual([[psProgram, psArguments]]);
    expect(psProgram).toBe("/bin/ps");
  });

  it("doesn't list ps itself among the engine's processes", async () => {
    // `ps` runs as 120, a child of the engine (100), while it reads the table.
    const output = [
      "  100     1  4096 node",
      "  110   100   512 claude",
      "  120   100   128 /bin/ps",
    ];
    const probe = new NodeResourceProbe({
      enginePid: 100,
      readProcessTable: psProcessTable(async () => ({ output: output.join("\n"), pid: 120 })),
    });
    expect(await probe.childProcesses()).toEqual([
      { pid: 110, name: "claude", memoryBytes: 512 * 1024 },
    ]);
  });
});
