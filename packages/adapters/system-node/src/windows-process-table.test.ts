import { Buffer } from "node:buffer";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { NodeResourceProbe } from "./resource-probe.ts";
import {
  parseWindowsProcesses,
  powerShellArguments,
  windowsPowerShell,
  windowsProcessScript,
  windowsProcessTable,
} from "./windows-process-table.ts";

// A made-up Windows folder: only how the path is put together matters.
const windowsFolder = "windows-folder";

verifies("system-node.resource-probe", () => {
  it("reads pid, parent, working set, start time and the name without .exe", () => {
    const output = [
      "0\t0\t8192\t\tSystem Idle Process",
      "4400\t1200\t52428800\t13370000000000\tclaude.EXE",
      "4404\t4400\t1024\t13370000000001\tnode.exe",
      "",
    ].join("\r\n");
    expect(parseWindowsProcesses(output)).toEqual([
      { pid: 0, parentPid: 0, name: "System Idle Process", memoryBytes: 8192 },
      {
        pid: 4400,
        parentPid: 1200,
        name: "claude",
        memoryBytes: 52428800,
        startedAt: 13370000000000,
      },
      { pid: 4404, parentPid: 4400, name: "node", memoryBytes: 1024, startedAt: 13370000000001 },
    ]);
  });

  it("leaves out lines that don't fit", () => {
    expect(parseWindowsProcesses("x\t1\t2\t3\ta\n5\t1\t\t3\tb\n6\t1\t2\t3\t\n")).toEqual([]);
  });

  it("starts Windows PowerShell by its full path, with the script encoded", async () => {
    const calls: [string, readonly string[]][] = [];
    const read = windowsProcessTable(async (program, args) => {
      calls.push([program, args]);
      return { output: "8\t4\t16\t\tcmd.exe\r\n", pid: 30 };
    }, windowsFolder);
    expect(await read()).toEqual({
      rows: [{ pid: 8, parentPid: 4, name: "cmd", memoryBytes: 16 }],
      readerPid: 30,
    });
    expect(calls).toEqual([
      [windowsPowerShell(windowsFolder), powerShellArguments(windowsProcessScript)],
    ]);
    expect(windowsPowerShell(windowsFolder)).toBe(
      "windows-folder\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
  });

  it("doesn't list PowerShell or the conhost below it among the engine's processes", async () => {
    // PowerShell runs as 4500, a child of the engine (4400), with its console host below it.
    const output = [
      "4400\t1200\t52428800\t13370000000000\tnode.exe",
      "4410\t4400\t1024\t13370000000001\tclaude.exe",
      "4500\t4400\t83886080\t13370000000002\tpowershell.exe",
      "4504\t4500\t8388608\t13370000000003\tconhost.exe",
    ];
    const probe = new NodeResourceProbe({
      enginePid: 4400,
      readProcessTable: windowsProcessTable(
        async () => ({ output: output.join("\r\n"), pid: 4500 }),
        windowsFolder,
      ),
    });
    expect(await probe.childProcesses()).toEqual([
      { pid: 4410, name: "claude", memoryBytes: 1024 },
    ]);
  });

  it("asks PowerShell for UTF-8 before it writes, so names outside ASCII survive", () => {
    expect(windowsProcessScript.split("\n")[0]).toBe(
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    );
  });

  it("encodes the script as UTF-16 Base64, so its quotes reach PowerShell unchanged", () => {
    const args = powerShellArguments("\"a\" 'b'");
    expect(args.slice(0, -1)).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
    ]);
    expect(Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")).toBe("\"a\" 'b'");
  });
});
