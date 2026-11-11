import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { letSandboxReadParents, letsReadAttributes, parentsInProfile } from "./profile-parents.ts";

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

  it("throws when icacls fails", async () => {
    await expect(
      letSandboxReadParents([appData], sid, async () => {
        throw new Error("icacls failed");
      }),
    ).rejects.toThrow("icacls failed");
  });
});
