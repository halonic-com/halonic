import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsePsOutput, psArguments, psProcessTable, psProgram } from "./ps-process-table.ts";

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
      return "  9  1  8  zsh\n";
    });
    expect(await read()).toEqual([{ pid: 9, parentPid: 1, name: "zsh", memoryBytes: 8192 }]);
    expect(calls).toEqual([[psProgram, psArguments]]);
    expect(psProgram).toBe("/bin/ps");
  });
});
