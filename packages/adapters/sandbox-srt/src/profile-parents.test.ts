import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  forgetSandboxParents,
  grantLimitMs,
  hasOwnEntry,
  letSandboxReadParents,
  letsReadAttributes,
  parentsInProfile,
  sessionTempParents,
} from "./profile-parents.ts";

/** A Windows path on `drive` from its folder names. */
const on = (drive: string, ...names: string[]) => [drive, ...names].join("\\");
const home = on("C:", "Users", "ada");
const appData = on(home, "AppData");
const local = on(appData, "Local");
const sid = "S-1-5-21-1-2-3-1001";

describe("parentsInProfile", () => {
  it("lists the folders between the profile and each path, outer first, each once", () => {
    const halonic = on(local, "halonic");
    expect(parentsInProfile([on(halonic, "work"), on(halonic, "tmp", "run_1")], home)).toEqual([
      appData,
      local,
      halonic,
      on(halonic, "tmp"),
    ]);
  });

  it("reads names without regard to case, as Windows does", () => {
    const lower = on("c:", "users", "ADA", "AppData");
    expect(parentsInProfile([on(lower, "work")], home)).toEqual([lower]);
  });

  it("leaves out the profile itself and everything outside it", () => {
    expect(parentsInProfile([on(home, "work"), on("D:", "a", "_temp", "work")], home)).toEqual([]);
    expect(parentsInProfile([on("C:", "Users", "adam", "AppData", "work")], home)).toEqual([]);
  });
});

describe("sessionTempParents", () => {
  it("lists the folders above the sessions' temp folders in the profile folder", () => {
    const halonic = on(local, "halonic");
    expect(sessionTempParents(halonic, home)).toEqual([
      appData,
      local,
      halonic,
      on(halonic, "tmp"),
    ]);
  });

  it("follows a profile folder set with HALONIC_HOME, outside LOCALAPPDATA", () => {
    const chosen = on(home, "Documents", "halonic-home");
    expect(sessionTempParents(chosen, home)).toEqual([
      on(home, "Documents"),
      chosen,
      on(chosen, "tmp"),
    ]);
    expect(sessionTempParents(on("D:", "halonic"), home)).toEqual([]);
  });
});

describe("letsReadAttributes", () => {
  it("is true for an allow entry on the folder itself that covers its attributes", () => {
    expect(letsReadAttributes(`D:AI(A;;LO;;;${sid})`, sid)).toBe(true);
    expect(letsReadAttributes(`D:AI(A;;0x80;;;${sid})`, sid)).toBe(true);
    expect(letsReadAttributes(`D:AI(A;OICI;0x1200a9;;;${sid})`, sid)).toBe(true);
    expect(letsReadAttributes(`D:AI(A;OICIID;FA;;;${sid})`, sid)).toBe(true);
  });

  it("is false for another account, a deny, an inherit-only entry or other rights", () => {
    expect(letsReadAttributes(`D:AI(A;;LO;;;S-1-5-21-1-2-3-1002)`, sid)).toBe(false);
    expect(letsReadAttributes(`D:AI(D;;LO;;;${sid})`, sid)).toBe(false);
    expect(letsReadAttributes(`D:AI(A;OICIIO;FA;;;${sid})`, sid)).toBe(false);
    expect(letsReadAttributes(`D:AI(A;;0x100;;;${sid})`, sid)).toBe(false);
  });

  it("reads the flags in pairs, so `IO` across two flags is not inherit-only", () => {
    expect(letsReadAttributes(`D:AI(A;CIOI;FA;;;${sid})`, sid)).toBe(true);
  });
});

describe("hasOwnEntry", () => {
  it("is true for an allow entry of the account set on the folder itself", () => {
    expect(hasOwnEntry(`D:AI(A;;LO;;;${sid})`, sid)).toBe(true);
    expect(hasOwnEntry(`D:AI(A;CIOI;FA;;;${sid})`, sid)).toBe(true);
  });

  it("is false for an inherited entry, a deny or another account", () => {
    expect(hasOwnEntry(`D:AI(A;OICIID;FA;;;${sid})`, sid)).toBe(false);
    expect(hasOwnEntry(`D:AI(D;;LO;;;${sid})`, sid)).toBe(false);
    expect(hasOwnEntry(`D:AI(A;;LO;;;S-1-5-21-1-2-3-1002)`, sid)).toBe(false);
  });
});

describe("letSandboxReadParents", () => {
  /** A fake `icacls` that saves `sddl` for each folder and records each grant. */
  function icacls(sddl: Record<string, string>) {
    const grants: string[][] = [];
    const start = async (file: string, args: string[]) => {
      expect(file).toBe("icacls.exe");
      const [folder = "", action, target = ""] = args;
      if (action === "/save") {
        const text = `${folder}\r\n${sddl[folder] ?? "D:AI"}\r\n`;
        await writeFile(target, `\uFEFF${text}`, "utf16le");
      } else {
        grants.push(args);
      }
      return { stdout: "" };
    };
    return { grants, start };
  }

  it("grants read attributes on the folder alone, and only where it is missing", async () => {
    const { grants, start } = icacls({ [appData]: `D:AI(A;;LO;;;${sid})` });
    await letSandboxReadParents([appData, local], sid, start);
    expect(grants).toEqual([[local, "/grant", `*${sid}:(RA)`]]);
  });

  // HAL-7431: icacls writes the folder's list only after its walk, so a grant stopped at 15 s granted nothing.
  it("gives the grant the long time limit, and reads the access lists with the usual one", async () => {
    const limits: Record<string, number | undefined> = {};
    const { start } = icacls({});
    await letSandboxReadParents([appData], sid, async (file, args, limitMs) => {
      limits[args[1] ?? ""] = limitMs;
      return start(file, args);
    });
    expect(limits).toEqual({ "/save": undefined, "/grant": grantLimitMs });
  });

  it("throws when icacls fails", async () => {
    await expect(
      letSandboxReadParents([appData], sid, async () => {
        throw new Error("icacls failed");
      }),
    ).rejects.toThrow("icacls failed");
  });

  // HAL-7431: the walk below the folder can fail after the grant.
  it("goes on when icacls fails after the folder's access list has the entry", async () => {
    const sddl: Record<string, string> = {};
    const { grants, start } = icacls(sddl);
    await letSandboxReadParents([appData, local], sid, async (file, args) => {
      if (args[1] === "/grant") {
        sddl[args[0] ?? ""] = `D:AI(A;;LO;;;${sid})`;
        throw new Error("icacls.exe ended with exit code 1");
      }
      return start(file, args);
    });
    expect(grants).toEqual([]);
    expect(Object.keys(sddl)).toEqual([appData, local]);
  });

  it("throws the grant's failure when the folder's access list still lacks the entry", async () => {
    const { start } = icacls({});
    await expect(
      letSandboxReadParents([appData], sid, async (file, args) => {
        if (args[1] === "/grant") throw new Error("icacls.exe ended with exit code 5");
        return start(file, args);
      }),
    ).rejects.toThrow("exit code 5");
  });

  it("throws the grant's failure when the folder's access list can't be read again", async () => {
    let saves = 0;
    const { start } = icacls({});
    await expect(
      letSandboxReadParents([appData], sid, async (file, args) => {
        if (args[1] === "/grant") throw new Error("icacls.exe was stopped after 15 s");
        saves += 1;
        if (saves > 1) throw new Error("icacls.exe /save failed");
        return start(file, args);
      }),
    ).rejects.toThrow("stopped after 15 s");
  });
});

describe("forgetSandboxParents", () => {
  // Real folders, since a folder that is gone is skipped; their access lists are fake.
  it("removes the account's own entries, and leaves folders without one or gone alone", async () => {
    const base = await mkdtemp(join(tmpdir(), "halonic-forget-"));
    try {
      const own = await mkdtemp(join(base, "own-"));
      const inherited = await mkdtemp(join(base, "inherited-"));
      const gone = join(base, "gone");
      const sddl: Record<string, string> = {
        [own]: `D:AI(A;;LO;;;${sid})`,
        [inherited]: `D:AI(A;OICIID;FA;;;${sid})`,
        [gone]: `D:AI(A;;LO;;;${sid})`,
      };
      const changes: string[][] = [];
      await forgetSandboxParents([own, inherited, gone], sid, async (_file, args) => {
        const [folder = "", action, target = ""] = args;
        if (action === "/save")
          await writeFile(target, `${folder}\r\n${sddl[folder]}\r\n`, "utf16le");
        else changes.push(args);
        return { stdout: "" };
      });
      expect(changes).toEqual([[own, "/remove:g", `*${sid}`]]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("tries every folder, then throws the first failure", async () => {
    const base = await mkdtemp(join(tmpdir(), "halonic-forget-"));
    try {
      const folders = [await mkdtemp(join(base, "a-")), await mkdtemp(join(base, "b-"))];
      const tried: string[] = [];
      const failing = async (_file: string, args: string[]) => {
        tried.push(args[0] ?? "");
        throw new Error(`icacls failed on ${args[0]}`);
      };
      await expect(forgetSandboxParents(folders, sid, failing)).rejects.toThrow(
        `icacls failed on ${folders[0]}`,
      );
      expect(tried).toEqual(folders);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
