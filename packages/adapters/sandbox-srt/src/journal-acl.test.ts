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
      {
        file: "icacls.exe",
        args: ["journals\\sandbox-journals", "/remove:g", "*S-1-5-18", "*S-1-5-32-544"],
      },
    ]);
  });

  it("keeps the system's entry when the current user is the system", async () => {
    const calls: string[][] = [];
    await restrictToThisUser("journals", async (_file, args) => {
      calls.push(args);
      return { stdout: '"nt authority\\system","S-1-5-18"' };
    });
    expect(calls.at(-1)).toEqual(["journals", "/remove:g", "*S-1-5-32-544"]);
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
