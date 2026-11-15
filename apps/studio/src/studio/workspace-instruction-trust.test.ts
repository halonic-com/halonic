import { InstructionTrustService } from "@halonicjs/app";
import type { InstructionTrustRecord, InstructionTrustStore } from "@halonicjs/ports";
import { type ErrorKind, KindedError, systemClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceInstructionTrust } from "./workspace-instruction-trust.ts";

const pin = {
  digest: `sha256:${"a".repeat(64)}`,
  files: { "AGENTS.md": `sha256:${"b".repeat(64)}` },
};

/** A store whose save fails the way the shell's refusals do, or saves into `saved`. */
function storeThatSaves(refusal: Error | undefined, saved: InstructionTrustRecord[]) {
  const store: InstructionTrustStore = {
    get: async () => null,
    remove: async () => undefined,
    save: async (record) => {
      if (refusal !== undefined) throw refusal;
      saved.push(record);
    },
  };
  return store;
}

function hostFor(store: InstructionTrustStore) {
  const service = new InstructionTrustService({ store, clock: systemClock });
  return new WorkspaceInstructionTrust(service, "/work/acme");
}

verifies("studio.workspace-instruction-trust", () => {
  it("saves the pin for the agent in the open workspace when the person says yes", async () => {
    const saved: InstructionTrustRecord[] = [];

    const answer = await hostFor(storeThatSaves(undefined, saved)).trust("coder", pin);

    expect(answer).toBe("trusted");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ location: "/work/acme", agent: "coder", pin });
  });

  describe("when the shell refuses", () => {
    const cases: readonly [ErrorKind, string][] = [
      ["denied", "declined"],
      ["conflict", "busy"],
      ["unavailable", "unavailable"],
      ["internal", "unavailable"],
    ];
    it.each(cases)("a %s refusal is %s, with none of the shell's text", async (kind, expected) => {
      const saved: InstructionTrustRecord[] = [];
      const refusal = new KindedError(kind, "the shell said something private");

      const answer = await hostFor(storeThatSaves(refusal, saved)).trust("coder", pin);

      expect(answer).toBe(expected);
      expect(saved).toEqual([]);
    });
  });

  it("answers unavailable for an error that isn't kinded", async () => {
    const answer = await hostFor(storeThatSaves(new TypeError("boom"), [])).trust("coder", pin);

    expect(answer).toBe("unavailable");
  });

  it("answers unavailable, and saves nothing, for a pin that isn't valid", async () => {
    const saved: InstructionTrustRecord[] = [];
    const answer = await hostFor(storeThatSaves(undefined, saved)).trust("coder", {
      digest: "not-a-digest",
      files: {},
    });

    expect(answer).toBe("unavailable");
    expect(saved).toEqual([]);
  });
});
