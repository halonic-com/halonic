import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { descendantsOf, type ProcessRow } from "./process-tree.ts";

const engine: ProcessRow = { pid: 100, parentPid: 1, name: "node", memoryBytes: 50 };

verifies("system-node.resource-probe", () => {
  it("lists the children of the engine and their children, in pid order", () => {
    const rows: ProcessRow[] = [
      { pid: 1, parentPid: 0, name: "init", memoryBytes: 1 },
      engine,
      { pid: 300, parentPid: 200, name: "node", memoryBytes: 30 },
      { pid: 200, parentPid: 100, name: "claude", memoryBytes: 20 },
      { pid: 150, parentPid: 1, name: "bash", memoryBytes: 15 },
    ];
    expect(descendantsOf(100, rows)).toEqual([
      { pid: 200, name: "claude", memoryBytes: 20 },
      { pid: 300, name: "node", memoryBytes: 30 },
    ]);
  });

  it("gives no processes when the engine has no children or isn't in the table", () => {
    expect(descendantsOf(100, [engine])).toEqual([]);
    expect(descendantsOf(100, [])).toEqual([]);
  });

  it("finds children even when the engine itself isn't in the table", () => {
    const rows: ProcessRow[] = [{ pid: 200, parentPid: 100, name: "claude", memoryBytes: 20 }];
    expect(descendantsOf(100, rows)).toEqual([{ pid: 200, name: "claude", memoryBytes: 20 }]);
  });

  it("leaves out a process that started before the parent its pid names", () => {
    const rows: ProcessRow[] = [
      { ...engine, startedAt: 5000 },
      { pid: 200, parentPid: 100, name: "stale", memoryBytes: 20, startedAt: 4000 },
      { pid: 204, parentPid: 100, name: "claude", memoryBytes: 20, startedAt: 5000 },
      { pid: 208, parentPid: 204, name: "early", memoryBytes: 20, startedAt: 4999 },
      { pid: 212, parentPid: 204, name: "node", memoryBytes: 20 },
    ];
    expect(descendantsOf(100, rows).map((child) => child.name)).toEqual(["claude", "node"]);
  });

  it("leaves out the process it is told to, and everything below it", () => {
    const rows: ProcessRow[] = [
      engine,
      { pid: 200, parentPid: 100, name: "claude", memoryBytes: 20 },
      { pid: 210, parentPid: 100, name: "powershell", memoryBytes: 60 },
      { pid: 211, parentPid: 210, name: "conhost", memoryBytes: 8 },
    ];
    expect(descendantsOf(100, rows, 210).map((child) => child.name)).toEqual(["claude"]);
  });

  it("walks a loop in the table once and never lists the engine", () => {
    const rows: ProcessRow[] = [
      { pid: 200, parentPid: 300, name: "a", memoryBytes: 1 },
      { pid: 300, parentPid: 200, name: "b", memoryBytes: 1 },
      { pid: 400, parentPid: 100, name: "c", memoryBytes: 1 },
      { pid: 100, parentPid: 400, name: "node", memoryBytes: 50 },
    ];
    expect(descendantsOf(100, rows).map((child) => child.pid)).toEqual([400]);
  });
});
