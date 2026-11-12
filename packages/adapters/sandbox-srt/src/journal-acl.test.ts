import { describe, expect, it } from "vitest";
import { fixedRunFailure, restrictToThisUser } from "./journal-acl.ts";

describe("restrictToThisUser", () => {
  it("takes the ownership, removes inheritance and grants only the current user's SID", async () => {
    const calls: { file: string; args: string[] }[] = [];
    await restrictToThisUser("journals\\sandbox-journals", async (file, args) => {
      calls.push({ file, args });
      return { stdout: '"corp\\ada lovelace","S-1-5-21-1-2-3-1001"\r\n' };
    });
    expect(calls).toEqual([
      { file: "whoami.exe", args: ["/user", "/fo", "csv", "/nh"] },
      {
        file: "icacls.exe",
        args: ["journals\\sandbox-journals", "/setowner", "*S-1-5-21-1-2-3-1001"],
      },
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

describe("fixedRunFailure", () => {
  const args = ["AppData", "/grant", "*S-1-5-21-1-2-3-1001:(RA)"];

  it("names the program, its exit code and what it printed", () => {
    const failure = {
      code: 5,
      stopped: false,
      stdout: "Failed processing 1 files\r\n",
      stderr: "Access is denied.\r\n",
    };
    expect(fixedRunFailure("icacls.exe", args, failure)).toBe(
      `icacls.exe ${args.join(" ")} ended with exit code 5; it printed: Access is denied. | Failed processing 1 files`,
    );
  });

  it("says when the program was stopped at the time limit, and that it printed nothing", () => {
    const failure = { code: null, stopped: true, stdout: "", stderr: "" };
    expect(fixedRunFailure("icacls.exe", args, failure)).toBe(
      `icacls.exe ${args.join(" ")} was stopped after 15 s; it printed nothing`,
    );
  });
});
