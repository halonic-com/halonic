import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryResourceProbe } from "./resource-probe.ts";

verifies("memory.resource-probe", () => {
  it("starts with 64 MiB of memory, no child processes and 100 GiB free", async () => {
    const probe = new MemoryResourceProbe();
    expect(await probe.engineMemory()).toBe(64 * 1024 ** 2);
    expect(await probe.childProcesses()).toEqual([]);
    expect(await probe.freeDisk("/data")).toBe(100 * 1024 ** 3);
  });

  it("gives the numbers it is set to", async () => {
    const probe = new MemoryResourceProbe({ freeDiskBytes: 0 });
    expect(await probe.freeDisk("/data")).toBe(0);
    probe.setEngineMemory(300);
    probe.setFreeDisk(512);
    probe.setChildProcesses([{ pid: 7, name: "claude", memoryBytes: 900 }]);
    expect(await probe.engineMemory()).toBe(300);
    expect(await probe.freeDisk("/data")).toBe(512);
    expect(await probe.childProcesses()).toEqual([{ pid: 7, name: "claude", memoryBytes: 900 }]);
  });

  it("stops counting at its file limit and says the size is incomplete", async () => {
    const probe = new MemoryResourceProbe({ maxFilesCounted: 2 });
    probe.writeFile("/data/a", 1);
    probe.writeFile("/data/b", 2);
    probe.writeFile("/data/c", 4);
    expect(await probe.folderSize("/data/")).toEqual({ bytes: 3, complete: false });
  });

  it("refuses bytes that aren't whole and 0 or more", () => {
    const probe = new MemoryResourceProbe();
    expect(() => probe.writeFile("/data/a", -1)).toThrow(RangeError);
    expect(() => probe.writeFile("/data/a", 1.5)).toThrow(
      "The file size must be a whole number of bytes, 0 or more; got 1.5.",
    );
    expect(() => probe.setFreeDisk(Number.NaN)).toThrow(RangeError);
    expect(() => new MemoryResourceProbe({ engineMemoryBytes: -5 })).toThrow(RangeError);
    expect(() => probe.setChildProcesses([{ pid: 1, name: "codex", memoryBytes: -1 }])).toThrow(
      "The memory of codex must be a whole number of bytes, 0 or more; got -1.",
    );
  });

  it("lists processes in pid order, as copies", async () => {
    const given = [
      { pid: 30, name: "codex", memoryBytes: 2 },
      { pid: 10, name: "claude", memoryBytes: 1 },
    ];
    const probe = new MemoryResourceProbe({ childProcesses: given });
    given.push({ pid: 50, name: "srt", memoryBytes: 3 });
    given[0] = { pid: 99, name: "other", memoryBytes: 4 };

    const first = await probe.childProcesses();
    const second = await probe.childProcesses();
    expect(first.map((child) => child.pid)).toEqual([10, 30]);
    expect(second).toEqual(first);
    expect(second[0]).not.toBe(first[0]);
  });
});
