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

    it("rejects as internal, without the shell's text, when the page has no capability", async () => {
      const shell = new FakeInstructionTrustShell({ granted: false });
      const store = new TauriInstructionTrustStore(shell);
      for (const call of [
        () => store.get(coder),
        () => store.save(instructionTrustRecord(coder.location, coder.agent)),
        () => store.remove(coder),
      ]) {
        const error = await rejection(call());
        expect(errorKindOf(error)).toBe("internal");
        expect(String((error as Error).message)).not.toContain("ACL");
      }
    });

    it("says an io refusal in Halonic's words, with the shell's message only in the details", async () => {
      const message = "Permission denied (os error 13)";
      const store = new TauriInstructionTrustStore({
        invoke: async () => Promise.reject({ kind: "io", message }),
      });
      for (const call of [
        () => store.save(instructionTrustRecord(coder.location, coder.agent)),
        () => store.remove(coder),
      ]) {
        const error = await rejection(call());
        expect(errorKindOf(error)).toBe("unavailable");
        expect(error).toMatchObject({
          message: "Halonic can't write to its data folder.",
          details: message,
        });
      }
      expect(await rejection(store.get(coder))).toMatchObject({
        message: "Halonic can't read its data folder.",
        details: message,
      });
    });

    it("makes a relative HALONIC_HOME's sentence and fix the main text, and keeps it in the details (HAL-15963)", async () => {
      const message =
        'HALONIC_HOME must be a full path, not "~/.halonic". Use $HOME instead: HALONIC_HOME="$HOME/.halonic".';
      const store = new TauriInstructionTrustStore({
        invoke: async () => Promise.reject({ kind: "profile_setting", message }),
      });
      for (const call of [() => store.remove(coder), () => store.get(coder)]) {
        const error = await rejection(call());
        expect(errorKindOf(error)).toBe("unavailable");
        expect(error).toMatchObject({ message, details: message });
      }
    });

    it("keeps the text of a call the shell didn't answer only in the details", async () => {
      const store = new TauriInstructionTrustStore(
        new FakeInstructionTrustShell({ granted: false }),
      );
      const error = await rejection(store.remove(coder));
      expect(error).toMatchObject({ message: "Halonic ran into a problem it can't explain yet." });
      expect((error as { details: string }).details).toMatch(
        /^The desktop shell gave no answer to the instruction trust call\.\n.*ACL/su,
      );
      const broken = new TauriInstructionTrustStore({
        invoke: async () => Promise.reject(new TypeError("bad call")),
      });
      expect(await rejection(broken.get(coder))).toMatchObject({
        message: "Halonic ran into a problem it can't explain yet.",
        details:
          "The desktop shell gave no answer to the instruction trust call.\nTypeError: bad call",
      });
    });
  });
});
