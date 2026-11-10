import { describe, expect, it } from "vitest";
import { restrictToThisUser } from "./journal-acl.ts";

describe("restrictToThisUser", () => {
  it("removes inheritance and grants only the current user's SID", async () => {
    const calls: { file: string; args: string[] }[] = [];
    await restrictToThisUser("journals\\sandbox-journals", async (file, args) => {
      calls.push({ file, args });
      return { stdout: '"corp\\ada lovelace","S-1-5-21-1-2-3-1001"\r\n' };
    });
    expect(calls).toEqual([
      { file: "whoami.exe", args: ["/user", "/fo", "csv", "/nh"] },
      {
        file: "icacls.exe",
        args: [
          "journals\\sandbox-journals",
          "/inheritance:r",
          "/grant:r",
          "*S-1-5-21-1-2-3-1001:(OI)(CI)F",
        ],
      },
    ]);
  });

  it("throws, and starts no icacls, when the SID can't be read", async () => {
    const files: string[] = [];
    await expect(
      restrictToThisUser("journals", async (file) => {
        files.push(file);
        return { stdout: "nonsense" };
      }),
    ).rejects.toThrow("SID");
    expect(files).toEqual(["whoami.exe"]);
  });

  it("lets a failing icacls through, so no journal is kept in an open folder", async () => {
    await expect(
      restrictToThisUser("journals", async (file) => {
        if (file === "icacls.exe") throw new Error("Access is denied");
        return { stdout: '"u","S-1-5-18"' };
      }),
    ).rejects.toThrow("Access is denied");
  });
});
