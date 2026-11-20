import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { giveOwnAccessList, type RunProgram } from "./own-access-list.ts";

const acmeSid = "S-1-5-21-1111-2222-3333-1001";

/** A fake that answers `whoami` with `sid` and records every call. */
function fakeRun(sid: string | null): { start: RunProgram; calls: string[][] } {
  const calls: string[][] = [];
  const start: RunProgram = async (file, args) => {
    calls.push([file, ...args]);
    return { stdout: sid === null ? "" : `"acme\\\\builder","${sid}"\r\n` };
  };
  return { start, calls };
}

verifies("sandbox-mxc.box-folders", () => {
  describe("giveOwnAccessList", () => {
    it("turns inheritance off and gives Full Control to only the user, SYSTEM and Administrators", async () => {
      const { start, calls } = fakeRun(acmeSid);
      await giveOwnAccessList("acme-boxes", start);
      expect(calls).toEqual([
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        [
          "icacls.exe",
          "acme-boxes",
          "/inheritance:r",
          "/grant:r",
          `*${acmeSid}:(OI)(CI)F`,
          "*S-1-5-18:(OI)(CI)F",
          "*S-1-5-32-544:(OI)(CI)F",
        ],
      ]);
    });

    it("names SYSTEM once when Halonic runs as SYSTEM", async () => {
      const { start, calls } = fakeRun("S-1-5-18");
      await giveOwnAccessList("acme-boxes", start);
      expect(calls[1]?.slice(4)).toEqual(["*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"]);
    });

    it("changes nothing when the user's SID can't be read", async () => {
      const { start, calls } = fakeRun(null);
      await expect(giveOwnAccessList("acme-boxes", start)).rejects.toThrow(
        "the current user's SID could not be read",
      );
      expect(calls.map(([file]) => file)).toEqual(["whoami.exe"]);
    });
  });
});
