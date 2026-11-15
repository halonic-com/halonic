import { instructionTrustRecord } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryInstructionTrustStore } from "./instruction-trust-store.ts";

const coder = { location: "/workspaces/acme", agent: "coder" };

verifies("memory.instruction-trust-store", () => {
  it("makes a damaged record unreadable, naming its agent and location", async () => {
    const store = new MemoryInstructionTrustStore();
    await store.save(instructionTrustRecord(coder.location, coder.agent));
    store.damage(coder);
    await expect(store.get(coder)).rejects.toThrow(
      'The trusted instructions for the agent "coder" in "/workspaces/acme" can\'t be read.',
    );
  });

  it("refuses a record with a field a record doesn't have, naming its key", async () => {
    const store = new MemoryInstructionTrustStore();
    const extra = { ...instructionTrustRecord(coder.location, coder.agent), trusted: true };
    await store.save(extra);
    await expect(store.get(coder)).rejects.toThrow(
      'The trusted instructions for the agent "coder" in "/workspaces/acme" aren\'t valid.',
    );
  });

  it("refuses to damage a record it doesn't hold", async () => {
    const store = new MemoryInstructionTrustStore();
    expect(() => store.damage(coder)).toThrow(
      'There are no trusted instructions for the agent "coder" in "/workspaces/acme" to damage.',
    );
    expect(await store.get(coder)).toBeNull();
  });
});
