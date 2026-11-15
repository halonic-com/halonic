import type { InstructionTrustKey } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import {
  instructionTrustRecord,
  instructionTrustStoreContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeInstructionTrustShell } from "./fake-instruction-trust-shell.test-helper.ts";
import { TauriInstructionTrustStore } from "./instruction-trust-store.ts";

instructionTrustStoreContract("tauri", async () => {
  const shell = new FakeInstructionTrustShell();
  return {
    store: new TauriInstructionTrustStore(shell),
    damage: async (key) => shell.damage(key),
  };
});

const coder: InstructionTrustKey = { location: "/workspaces/acme", agent: "coder" };

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.instruction-trust-commands", () => {
  describe("TauriInstructionTrustStore", () => {
    it("sends each call to its command with only the key's or the record's own fields", async () => {
      const shell = new FakeInstructionTrustShell();
      const store = new TauriInstructionTrustStore(shell);
      const record = instructionTrustRecord(coder.location, coder.agent);
      await store.save({ ...record, extra: "ignored" } as typeof record);
      await store.get({ ...coder, extra: "ignored" } as InstructionTrustKey);
      await store.remove(coder);
      expect(shell.calls).toEqual([
        { command: "instruction_trust_save", args: { record } },
        { command: "instruction_trust_get", args: { key: coder } },
        { command: "instruction_trust_remove", args: { key: coder } },
      ]);
    });

    it("saves nothing and rejects as denied when the person says no", async () => {
      const shell = new FakeInstructionTrustShell();
      shell.answers.push(false);
      const store = new TauriInstructionTrustStore(shell);
      const error = await rejection(
        store.save(instructionTrustRecord(coder.location, coder.agent)),
      );
      expect(errorKindOf(error)).toBe("denied");
      expect(await store.get(coder)).toBeNull();
    });

    it("rejects as conflict while the shell asks about another save", async () => {
      const shell = new FakeInstructionTrustShell();
      shell.refuseNext("busy");
      const error = await rejection(
        new TauriInstructionTrustStore(shell).save(
          instructionTrustRecord(coder.location, coder.agent),
        ),
      );
      expect(errorKindOf(error)).toBe("conflict");
    });

    it("throws naming the agent and its workspace for a record the shell calls unreadable", async () => {
      const shell = new FakeInstructionTrustShell();
      shell.refuseNext("unreadable");
      const error = await rejection(new TauriInstructionTrustStore(shell).get(coder));
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).toContain('"coder"');
      expect(String((error as Error).message)).toContain('"/workspaces/acme"');
    });

    it("never returns a record that is for another agent, even when the shell does", async () => {
      const writer = instructionTrustRecord(coder.location, "writer");
      const shell = {
        invoke: async () => writer,
      };
      const error = await rejection(new TauriInstructionTrustStore(shell).get(coder));
      expect(String((error as Error).message)).toContain('"coder"');
    });

    it("the fake shell refuses a command it has no record of", async () => {
      const error = await rejection(
        new FakeInstructionTrustShell().invoke("instruction_trust_list"),
      );
      expect(error).toBe("Command instruction_trust_list not found");
    });

    it("rejects as unavailable, without the shell's text, when the page has no capability", async () => {
      const shell = new FakeInstructionTrustShell({ granted: false });
      const store = new TauriInstructionTrustStore(shell);
      for (const call of [
        () => store.get(coder),
        () => store.save(instructionTrustRecord(coder.location, coder.agent)),
        () => store.remove(coder),
      ]) {
        const error = await rejection(call());
        expect(errorKindOf(error)).toBe("unavailable");
        expect(String((error as Error).message)).not.toContain("ACL");
      }
    });
  });
});
