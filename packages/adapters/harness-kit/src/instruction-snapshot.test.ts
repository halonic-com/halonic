import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyInstructions,
  describeInstructionPin,
  type InstructionDisk,
  instructionTrust,
  pinInstructions,
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
  });

  describe("instructionTrust", () => {
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
      const disk: InstructionDisk = { writeReadOnly: async (path) => void written.push(path) };
      await expect(
        copyInstructions(folder, [agents, { name: "../outside", text: "x" }], disk),
      ).rejects.toThrow(/\.\.\/outside/u);
      expect(written).toEqual([]);
    });
  });

  it("describes a pin in one line for the run log", async () => {
    const pin = await pinInstructions([agents, skill]);
    expect(describeInstructionPin(pin)).toBe(`instructions ${pin.digest} (2 files)`);
    expect(describeInstructionPin(await pinInstructions([agents]))).toMatch(/\(1 file\)$/u);
  });
});
