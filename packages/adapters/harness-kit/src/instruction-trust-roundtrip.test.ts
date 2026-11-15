import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { MemoryInstructionTrustStore } from "@halonicjs/adapter-memory";
import { type InstructionTrustStore, isInstructionTrustFor } from "@halonicjs/ports";
import { instructionTrustRecord } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { pinInstructions } from "./instruction-snapshot.ts";

const coder = { location: "/workspaces/acme", agent: "coder" };

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function fileStore(): Promise<InstructionTrustStore> {
  const folder = await mkdtemp(join(tmpdir(), "instruction-trust-"));
  folders.push(folder);
  return new FileInstructionTrustStore(folder);
}

// A pin from `pinInstructions` is what a person trusts, so each store must
// keep it whole, and `isInstructionTrustFor` must accept the form it has.
verifies("harness-kit.instruction-pin-trust", () => {
  describe.each([
    ["memory", async () => new MemoryInstructionTrustStore()],
    ["file", fileStore],
  ])("a pin from pinInstructions in the %s store", (_name, makeStore) => {
    it("is saved, read back unchanged and accepted by isInstructionTrustFor", async () => {
      const pin = await pinInstructions([
        { name: "AGENTS.md", text: "Be brief.\n" },
        { name: "skills/review/SKILL.md", text: "Review small.\n" },
      ]);
      const store = await makeStore();
      const record = { ...instructionTrustRecord(coder.location, coder.agent), pin };
      await store.save(record);

      const read = await store.get(coder);
      expect(read).toEqual(record);
      expect(isInstructionTrustFor(coder, read)).toBe(true);
    });

    it("is accepted when the set has no files", async () => {
      const pin = await pinInstructions([]);
      const store = await makeStore();
      await store.save({ ...instructionTrustRecord(coder.location, coder.agent), pin });

      expect(isInstructionTrustFor(coder, await store.get(coder))).toBe(true);
    });
  });
});
