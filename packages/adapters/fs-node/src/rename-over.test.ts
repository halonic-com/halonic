import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RenameOverSystem, renameOver } from "./rename-over.ts";

/** An error as Node's file functions give it, with its `code`. */
function fsError(code: string): Error {
  return Object.assign(new Error(`${code}: rename failed`), { code });
}

/**
 * A system on `platform` whose renames fail with the given codes, one per
 * try, and succeed once they run out. Records the renames and the waits.
 */
function systemFailingWith(
  platform: NodeJS.Platform,
  codes: readonly string[],
): RenameOverSystem & { renames: number; waits: number[] } {
  const failures = [...codes];
  return {
    platform,
    renames: 0,
    waits: [],
    async rename() {
      this.renames += 1;
      const code = failures.shift();
      if (code !== undefined) {
        throw fsError(code);
      }
    },
    async wait(milliseconds) {
      this.waits.push(milliseconds);
    },
  };
}

verifies("fs-node.write-is-whole-or-nothing", () => {
  describe("renameOver", () => {
    it("tries again on Windows while the file is briefly locked", async () => {
      const system = systemFailingWith("win32", ["EBUSY", "EPERM", "EACCES"]);
      await renameOver("from", "to", system);
      expect(system.renames).toBe(4);
      expect(system.waits).toEqual([10, 20, 40]);
    });

    it("gives up on Windows after about a second and throws the last error", async () => {
      const system = systemFailingWith("win32", Array<string>(20).fill("EBUSY"));
      await expect(renameOver("from", "to", system)).rejects.toMatchObject({ code: "EBUSY" });
      expect(system.renames).toBe(8);
      expect(system.waits.reduce((sum, delay) => sum + delay, 0)).toBe(1270);
    });

    it("doesn't try again on Windows for an error that isn't a lock", async () => {
      const system = systemFailingWith("win32", ["EISDIR"]);
      await expect(renameOver("from", "to", system)).rejects.toMatchObject({ code: "EISDIR" });
      expect(system.renames).toBe(1);
    });

    it("doesn't try again on other systems", async () => {
      const system = systemFailingWith("linux", ["EBUSY"]);
      await expect(renameOver("from", "to", system)).rejects.toMatchObject({ code: "EBUSY" });
      expect(system.renames).toBe(1);
      expect(system.waits).toEqual([]);
    });
  });
});
