import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RenameSystem, renameOver, renameRetryDelaysMs } from "./rename-over.ts";

function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
}

/**
 * A system whose rename fails with each of `failures` in turn and then
 * succeeds. It records every rename and every wait, and never really waits.
 */
function fakeSystem(
  platform: string,
  failures: string[],
): RenameSystem & {
  renames: number;
  waits: number[];
} {
  const remaining = [...failures];
  const system = {
    platform,
    renames: 0,
    waits: [] as number[],
    async rename() {
      system.renames += 1;
      const code = remaining.shift();
      if (code !== undefined) {
        throw systemError(code);
      }
    },
    async wait(ms: number) {
      system.waits.push(ms);
    },
  };
  return system;
}

verifies("fs-node.rename-retry-on-windows", () => {
  describe("renameOver", () => {
    it("tries again on Windows while another program holds the file", async () => {
      const system = fakeSystem("win32", ["EPERM", "EBUSY"]);
      await renameOver("a.tmp", "a.yaml", system);
      expect(system.renames).toBe(3);
      expect(system.waits).toEqual([10, 20]);
    });

    it("gives up with the last error when the file stays held", async () => {
      const system = fakeSystem("win32", Array(10).fill("EBUSY"));
      await expect(renameOver("a.tmp", "a.yaml", system)).rejects.toMatchObject({
        code: "EBUSY",
      });
      expect(system.renames).toBe(renameRetryDelaysMs.length + 1);
      expect(system.waits).toEqual([10, 20, 40, 80, 160]);
    });

    it("fails at once on Windows for an error that isn't a held file", async () => {
      const system = fakeSystem("win32", ["ENOENT"]);
      await expect(renameOver("a.tmp", "a.yaml", system)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(system.renames).toBe(1);
      expect(system.waits).toEqual([]);
    });

    it("fails at once on other systems, where EPERM means no permission", async () => {
      for (const platform of ["linux", "darwin"]) {
        const system = fakeSystem(platform, ["EPERM"]);
        await expect(renameOver("a.tmp", "a.yaml", system)).rejects.toMatchObject({
          code: "EPERM",
        });
        expect(system.renames).toBe(1);
        expect(system.waits).toEqual([]);
      }
    });

    it("renames once when nothing holds the file", async () => {
      const system = fakeSystem("win32", []);
      await renameOver("a.tmp", "a.yaml", system);
      expect(system.renames).toBe(1);
      expect(system.waits).toEqual([]);
    });
  });
});
