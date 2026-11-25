import type { IndexedHubs } from "@halonicjs/adapter-cloudflare-storage";
import type { HarnessAgent } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkerInstructions, workerInstructionsFolder } from "./worker-instructions.ts";

/** The `acme` hub as the deployer's index has it: one skill, `review`. */
const index = {
  acme: {
    skills: {
      review: { id: "review", name: "Review", description: "Reads a change.", body: "Look twice." },
    },
  },
} as unknown as IndexedHubs;

const source = new WorkerInstructions(async () => index);

function agentWith(instructions: string, skills: string[]): HarnessAgent {
  return {
    runId: "run_1",
    hubId: "acme",
    agentId: "coder",
    file: { instructions, skills },
  } as unknown as HarnessAgent;
}

async function digestOf(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return `sha256:${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

verifies("runtime.worker-instructions", () => {
  describe("WorkerInstructions", () => {
    it("gives AGENTS.md and the skill's SKILL.md in the container folder, pinned by digest", async () => {
      const open = await source.open(agentWith("Be brief.", ["review"]));

      expect(open?.folder).toBe(workerInstructionsFolder);
      const skillText = '---\nname: "Review"\ndescription: "Reads a change."\n---\n\nLook twice.\n';
      expect(open?.files).toEqual([
        { name: "AGENTS.md", text: "Be brief." },
        { name: "skills/review/SKILL.md", text: skillText },
      ]);
      const agentsDigest = await digestOf("Be brief.");
      const skillDigest = await digestOf(skillText);
      expect(open?.pin.files).toEqual([
        { path: "AGENTS.md", sha256: agentsDigest },
        { path: "skills/review/SKILL.md", sha256: skillDigest },
      ]);
      const listing = `"AGENTS.md" ${agentsDigest}\n"skills/review/SKILL.md" ${skillDigest}\n`;
      expect(open?.pin.sha256).toBe(await digestOf(listing));
      await expect(open?.release()).resolves.toBeUndefined();
    });

    it("gives no instructions to an agent with none and no skills", async () => {
      expect(await source.open(agentWith("  \n", []))).toBeNull();
    });

    it("writes a skill selected twice once", async () => {
      const open = await source.open(agentWith("", ["review", "review"]));

      expect(open?.files.map((file) => file.name)).toEqual(["skills/review/SKILL.md"]);
    });

    it("refuses a skill id that would reach outside the folder", async () => {
      await expect(source.open(agentWith("", ["../work"]))).rejects.toThrow(/plain folder name/);
    });

    it("refuses a skill the hub doesn't have", async () => {
      await expect(source.open(agentWith("", ["deploy"]))).rejects.toThrow(/no skill "deploy"/);
    });
  });
});
