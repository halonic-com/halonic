import type { ResourceProbe } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** A probe under test, and a place on its disk the suite may write to. */
export interface ResourceProbeHarness {
  probe: ResourceProbe;
  /** Makes a new, empty folder for one test and gives its absolute path. */
  folder(): Promise<string>;
  /** Writes a file of `bytes` bytes at the absolute `path`, making the folders above it. */
  writeFile(path: string, bytes: number): Promise<void>;
}

/** Creates the probe under test. */
export type MakeResourceProbe = () => Promise<ResourceProbeHarness>;

/** Whether `value` is a whole, non-negative number of bytes. */
function isWholeBytes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** The contract every {@link ResourceProbe} adapter passes. */
export function resourceProbeContract(name: string, make: MakeResourceProbe): void {
  verifies("contracts.resource-probe", () => {
    describe(`ResourceProbe contract: ${name}`, () => {
      it("gives the engine's memory as a whole number of bytes above 0", async () => {
        const { probe } = await make();
        const bytes = await probe.engineMemory();
        expect(isWholeBytes(bytes)).toBe(true);
        expect(bytes).toBeGreaterThan(0);
      });

      it("lists the processes below the engine once each, in pid order", async () => {
        const { probe } = await make();
        const processes = await probe.childProcesses();
        for (const child of processes) {
          expect(isWholeBytes(child.pid)).toBe(true);
          expect(isWholeBytes(child.memoryBytes)).toBe(true);
          expect(child.name).not.toBe("");
        }
        const pids = processes.map((child) => child.pid);
        expect(pids).toEqual([...new Set(pids)].sort((a, b) => a - b));
      });

      it("adds up the bytes of the files in a folder and the folders below it", async () => {
        const harness = await make();
        const root = await harness.folder();
        await harness.writeFile(`${root}/run.jsonl`, 10);
        await harness.writeFile(`${root}/cache/answer.json`, 32);
        await harness.writeFile(`${root}/cache/deeper/empty.txt`, 0);
        expect(await harness.probe.folderSize(root)).toEqual({ bytes: 42, complete: true });
      });

      it("doesn't count a file beside the folder, even one whose name starts the same", async () => {
        const harness = await make();
        const root = await harness.folder();
        await harness.writeFile(`${root}/logs/a.jsonl`, 5);
        await harness.writeFile(`${root}/logs-old/b.jsonl`, 7);
        await harness.writeFile(`${root}/logs.txt`, 11);
        expect(await harness.probe.folderSize(`${root}/logs`)).toEqual({
          bytes: 5,
          complete: true,
        });
      });

      it("gives 0 bytes, complete, for an empty folder and for a path where nothing is", async () => {
        const harness = await make();
        const root = await harness.folder();
        expect(await harness.probe.folderSize(root)).toEqual({ bytes: 0, complete: true });
        expect(await harness.probe.folderSize(`${root}/not-there`)).toEqual({
          bytes: 0,
          complete: true,
        });
      });

      it("gives the free disk space as whole bytes, also for a path where nothing is yet", async () => {
        const harness = await make();
        const root = await harness.folder();
        expect(isWholeBytes(await harness.probe.freeDisk(root))).toBe(true);
        expect(isWholeBytes(await harness.probe.freeDisk(`${root}/later/data`))).toBe(true);
      });
    });
  });
}
