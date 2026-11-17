import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writerAgent, writerFile } from "./harness-agent.test-helper.ts";
import { pinInstructions } from "./instruction-snapshot.ts";
import { RunInstructions } from "./run-instructions.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "run-instructions-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const sourceOf = (skills: Record<string, string> = {}) =>
  new RunInstructions({
    root: join(base, "instructions"),
    skillTextOf: async (_agent, id) => {
      const text = skills[id];
      if (text === undefined) throw new Error(`No skill "${id}".`);
      return text;
    },
  });

verifies("harness-kit.instruction-snapshot", () => {
  describe("RunInstructions", () => {
    it("pins AGENTS.md and the selected skills in the engine's form", async () => {
      const agent = writerAgent(
        null,
        writerFile({ instructions: "Be brief.\n", skills: ["review"] }),
      );
      const open = await sourceOf({ review: "Review small.\n" }).open(agent);
      const pin = open?.pin;
      const expected = await pinInstructions([
        { name: "AGENTS.md", text: "Be brief.\n" },
        { name: "skills/review/SKILL.md", text: "Review small.\n" },
      ]);
      expect(pin?.sha256).toBe(expected.digest);
      expect(pin?.files.map((file) => file.path)).toEqual(["AGENTS.md", "skills/review/SKILL.md"]);
    });

    it("writes the files read-only in a folder of the run's own", async () => {
      const agent = writerAgent(null, writerFile({ instructions: "Be brief.\n" }));
      const open = await sourceOf().open(agent);
      const file = join(open?.folder as string, "AGENTS.md");
      expect(await readFile(file, "utf8")).toBe("Be brief.\n");
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o222).toBe(0);
    });

    it("gives nothing when the agent has no instructions and no skills", async () => {
      expect(await sourceOf().open(writerAgent(null))).toBeNull();
    });

    it("removes the run's folder when it is released, and again without failing", async () => {
      const agent = writerAgent(null, writerFile({ instructions: "Be brief.\n" }));
      const open = await sourceOf().open(agent);
      expect(await readdir(join(base, "instructions"))).toHaveLength(1);
      await open?.release();
      expect(await readdir(join(base, "instructions"))).toEqual([]);
      await expect(open?.release()).resolves.toBeUndefined();
    });

    it("fails, writing nothing, when a skill has no text", async () => {
      const agent = writerAgent(null, writerFile({ skills: ["missing"] }));
      await expect(sourceOf().open(agent)).rejects.toThrow('No skill "missing".');
      expect(await readdir(base)).toEqual([]);
    });
  });
});
