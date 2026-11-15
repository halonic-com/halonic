import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyInstructions,
  describeInstructionPin,
  type InstructionDisk,
  instructionDiskOnThisComputer,
  instructionTrust,
  pinInstructions,
  snapshotInstructions,
} from "./instruction-snapshot.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "instructions-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const agents = { name: "AGENTS.md", text: "Be brief.\n" };
const skill = { name: "skills/review/SKILL.md", text: "Review small.\n" };

verifies("harness-kit.instruction-snapshot", () => {
  describe("pinInstructions", () => {
    it("pins each file and the set, whatever the order", async () => {
      const one = await pinInstructions([agents, skill]);
      const two = await pinInstructions([skill, agents]);
      expect(two).toEqual(one);
      expect(one.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(Object.keys(one.files)).toEqual(["AGENTS.md", "skills/review/SKILL.md"]);
    });

    it("gives another digest when one letter changes", async () => {
      const one = await pinInstructions([agents]);
      const two = await pinInstructions([{ ...agents, text: "Be brief!\n" }]);
      expect(two.digest).not.toBe(one.digest);
    });

    it.each(["", "../outside", "/abs", "a//b", "a\\b", "./a"])(
      "refuses the name %j",
      async (name) => {
        await expect(pinInstructions([{ name, text: "x" }])).rejects.toThrow(/Instruction file/u);
      },
    );

    it("refuses a name given twice", async () => {
      await expect(pinInstructions([agents, agents])).rejects.toThrow(/there twice/u);
    });

    it("refuses names that differ only in letter case", async () => {
      await expect(pinInstructions([agents, { name: "agents.md", text: "x" }])).rejects.toThrow(
        /there twice/u,
      );
    });

    it.each([
      "a:stream",
      "AGENTS.md.",
      "AGENTS.md ",
      "NUL",
      "skills/con.md",
      "COM1.txt",
      "back\\slash",
      "skills//SKILL.md",
      "./AGENTS.md",
      ".hidden",
    ])("refuses the name %j", async (name) => {
      await expect(pinInstructions([{ name, text: "x" }])).rejects.toThrow(/Instruction file/u);
    });
  });

  describe("instructionTrust", () => {
    it("treats a file named like an object method as added, not changed", async () => {
      const pin = await pinInstructions([{ name: "constructor", text: "x" }]);
      const answer = instructionTrust(await pinInstructions([agents]), pin);
      expect(answer).toMatchObject({
        kind: "ask",
        changes: { added: ["constructor"], changed: [] },
      });
    });

    it("lists a dropped file named like an object method as removed", async () => {
      const trusted = await pinInstructions([{ name: "constructor", text: "x" }]);
      const answer = instructionTrust(trusted, await pinInstructions([agents]));
      expect(answer).toMatchObject({
        kind: "ask",
        changes: { removed: ["constructor"] },
      });
    });

    it("trusts the same set", async () => {
      const pin = await pinInstructions([agents, skill]);
      expect(instructionTrust(pin, pin)).toEqual({ kind: "trusted" });
    });

    it("asks when nothing is trusted yet, naming every file as added", async () => {
      const pin = await pinInstructions([agents]);
      expect(instructionTrust(null, pin)).toEqual({
        kind: "ask",
        changes: { added: ["AGENTS.md"], removed: [], changed: [] },
      });
    });

    it("asks again, naming what was added, removed and changed", async () => {
      const trusted = await pinInstructions([agents, skill]);
      const current = await pinInstructions([
        { ...agents, text: "Be loud.\n" },
        { name: "skills/new/SKILL.md", text: "New.\n" },
      ]);
      expect(instructionTrust(trusted, current)).toEqual({
        kind: "ask",
        changes: {
          added: ["skills/new/SKILL.md"],
          removed: ["skills/review/SKILL.md"],
          changed: ["AGENTS.md"],
        },
      });
    });
  });

  describe("copyInstructions", () => {
    it("writes the files read-only and gives the pin of what it wrote", async () => {
      const pin = await copyInstructions(folder, [agents, skill]);
      expect(pin).toEqual(await pinInstructions([agents, skill]));
      const path = join(folder, "skills", "review", "SKILL.md");
      expect(await readFile(path, "utf8")).toBe(skill.text);
      if (process.platform !== "win32") {
        expect((await stat(path)).mode & 0o222).toBe(0);
        await expect(writeFile(path, "changed")).rejects.toThrow();
      }
    });

    it("never writes over a file that is there", async () => {
      await writeFile(join(folder, "AGENTS.md"), "old");
      await expect(copyInstructions(folder, [agents])).rejects.toThrow();
      expect(await readFile(join(folder, "AGENTS.md"), "utf8")).toBe("old");
    });

    it("writes nothing when a name is refused", async () => {
      const written: string[] = [];
      const disk: InstructionDisk = {
        ...instructionDiskOnThisComputer,
        writeReadOnly: async (path) => void written.push(path),
      };
      await expect(
        copyInstructions(folder, [agents, { name: "../outside", text: "x" }], disk),
      ).rejects.toThrow(/\.\.\/outside/u);
      expect(written).toEqual([]);
    });
  });

  describe("snapshotInstructions", () => {
    it("copies into a new folder of its own in the root, with the pin of what it wrote", async () => {
      const snapshot = await snapshotInstructions(folder, [agents, skill]);
      expect(dirname(snapshot.folder)).toBe(folder);
      expect(snapshot.pin).toEqual(await pinInstructions([agents, skill]));
      expect(await readFile(join(snapshot.folder, "AGENTS.md"), "utf8")).toBe(agents.text);
    });

    it("gives two runs two folders", async () => {
      const one = await snapshotInstructions(folder, [agents]);
      const two = await snapshotInstructions(folder, [agents]);
      expect(two.folder).not.toBe(one.folder);
    });

    it("makes no folder when a name is refused", async () => {
      await expect(
        snapshotInstructions(folder, [agents, { name: "../outside", text: "x" }]),
      ).rejects.toThrow(/\.\.\/outside/u);
      expect(await readdir(folder)).toEqual([]);
    });

    it("removes the folder, read-only files and all, when a file can't be written", async () => {
      let writes = 0;
      const disk: InstructionDisk = {
        ...instructionDiskOnThisComputer,
        async writeReadOnly(path, text) {
          if (++writes === 2) throw new Error("disk full");
          await instructionDiskOnThisComputer.writeReadOnly(path, text);
        },
      };
      await expect(snapshotInstructions(folder, [agents, skill], disk)).rejects.toThrow(
        "disk full",
      );
      expect(await readdir(folder)).toEqual([]);
    });

    it("reports the copy's error even when the folder can't be removed", async () => {
      const disk: InstructionDisk = {
        ...instructionDiskOnThisComputer,
        writeReadOnly: async () => Promise.reject(new Error("disk full")),
        removeFolder: async () => Promise.reject(new Error("in use")),
      };
      await expect(snapshotInstructions(folder, [agents], disk)).rejects.toThrow("disk full");
    });

    it("can remove the read-only copies afterwards, on every system", async () => {
      const snapshot = await snapshotInstructions(folder, [agents, skill]);
      await instructionDiskOnThisComputer.removeFolder(snapshot.folder);
      expect(await readdir(folder)).toEqual([]);
    });
  });

  it("describes a pin in one line for the run log", async () => {
    const pin = await pinInstructions([agents, skill]);
    expect(describeInstructionPin(pin)).toBe(`instructions ${pin.digest} (2 files)`);
    expect(describeInstructionPin(await pinInstructions([agents]))).toMatch(/\(1 file\)$/u);
  });
});
