import { spawn } from "node:child_process";
import { once } from "node:events";
import { execPath, pid } from "node:process";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { NodeResourceProbe, systemProcessTable } from "./resource-probe.ts";

verifies("system-node.resource-probe", () => {
  it("reads the memory and process table it is given", async () => {
    const probe = new NodeResourceProbe({
      enginePid: 10,
      engineMemory: () => 4096,
      readProcessTable: async () => ({
        rows: [
          { pid: 10, parentPid: 1, name: "node", memoryBytes: 4096 },
          { pid: 11, parentPid: 10, name: "claude", memoryBytes: 512 },
        ],
      }),
    });
    expect(await probe.engineMemory()).toBe(4096);
    expect(await probe.childProcesses()).toEqual([{ pid: 11, name: "claude", memoryBytes: 512 }]);
  });

  it("throws when the process table can't be read", async () => {
    const failure = new Error("no ps");
    const probe = new NodeResourceProbe({ readProcessTable: () => Promise.reject(failure) });
    await expect(probe.childProcesses()).rejects.toBe(failure);
  });

  // The reader for this machine; CI runs it on Linux, macOS and Windows. On Windows it starts
  // PowerShell and asks WMI, which took 1.8 to over 5 s on CI runners, so the test waits as long
  // as the reader may take (15 s) and a little more.
  it("lists a process this one started, by its real pid", { timeout: 20_000 }, async () => {
    const child = spawn(execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    try {
      await once(child, "spawn");
      const processes = await new NodeResourceProbe({
        readProcessTable: systemProcessTable(),
      }).childProcesses();
      const found = processes.find((usage) => usage.pid === child.pid);
      expect(found).toBeDefined();
      expect(processes.every((usage) => usage.pid !== pid)).toBe(true);
      expect(found?.name).not.toBe("");
    } finally {
      child.kill();
      await once(child, "exit");
    }
  });
});
