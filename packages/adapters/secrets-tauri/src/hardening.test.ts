import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeychainError } from "./keychain-error.ts";
import type { TauriShell } from "./shell.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

// The gaps the attack tests on HAL-2899 found (HAL-2903). Today's shell can't
// cause any of them; these tests keep the page from trusting a reply blindly.

const value = "attack-value-7f3a";

/** A shell that answers every command with `answer`. */
function answering(answer: unknown): TauriShell {
  return { invoke: async () => answer };
}

/** A shell that rejects every command with `reason`. */
function rejecting(reason: unknown): TauriShell {
  return {
    invoke: async () => {
      throw reason;
    },
  };
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("secrets-tauri.refusals", () => {
  describe("TauriSecrets refusals that would show the value", () => {
    it("keeps a refusal's kind but drops its message when the message holds the value", async () => {
      const secrets = new TauriSecrets(
        rejecting({ kind: "backend", message: `failed on ${value}` }),
      );
      const error = await rejection(secrets.set("token", value));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
      expect(String(error)).not.toContain(value);
    });

    it("drops the message of a refused value that repeats it", async () => {
      const secrets = new TauriSecrets(
        rejecting({ kind: "invalid_value", message: `bad: ${value}` }),
      );
      const error = await rejection(secrets.set("token", value));
      expect(error).toBeInstanceOf(RangeError);
      expect(String(error)).not.toContain(value);
    });

    it("passes on a refusal's message that doesn't hold the value", async () => {
      const secrets = new TauriSecrets(rejecting({ kind: "denied", message: "the user said no" }));
      const error = await rejection(secrets.set("token", value));
      expect(String(error)).toContain("the user said no");
    });

    it("takes an Error that carries a kind for a failure, not the shell's refusal", async () => {
      const failure = Object.assign(new Error(`ipc ${value}`), { kind: "denied" });
      const error = await rejection(new TauriSecrets(rejecting(failure)).set("token", value));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
      expect(String(error)).not.toContain(value);
    });
  });
});

verifies("secrets-tauri.shell-commands", () => {
  describe("TauriSecrets replies", () => {
    it("refuses an answer to secret_set other than null", async () => {
      const error = await rejection(
        new TauriSecrets(answering({ stored: false })).set("token", value),
      );
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
    });

    it("refuses an answer to secret_delete other than null", async () => {
      const error = await rejection(new TauriSecrets(answering("kept")).remove("token"));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
    });

    it("refuses an empty value from secret_get, which the shell never stores", async () => {
      const error = await rejection(new TauriSecrets(answering("")).get("token"));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
    });
  });
});
