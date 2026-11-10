import { errorKindOf } from "@halonicjs/std";
import { secretsContract, tokenStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell, shellMaxValueBytes, windowsMaxValueBytes } from "./fake-shell.test-helper.ts";
import { KeychainError } from "./keychain-error.ts";
import type { RefusalKind } from "./shell.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

secretsContract("tauri", async (values) => {
  const shell = new FakeShell();
  const secrets = new TauriSecrets(shell);
  for (const [name, value] of Object.entries(values)) {
    await secrets.set(name, value);
  }
  return secrets;
});

tokenStoreContract("tauri", async () => new TauriSecrets(new FakeShell()));

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("secrets-tauri.shell-commands", () => {
  describe("TauriSecrets", () => {
    it("sends each call to its secret_* command with the name as given", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      await secrets.set("Google-Refresh", "one");
      await secrets.get("google_refresh");
      await secrets.remove("GOOGLE-REFRESH");
      expect(shell.calls).toEqual([
        { command: "secret_set", args: { name: "Google-Refresh", value: "one" } },
        { command: "secret_get", args: { name: "google_refresh" } },
        { command: "secret_delete", args: { name: "GOOGLE-REFRESH" } },
      ]);
      expect(shell.entries.size).toBe(0);
    });

    it("refuses a bad name before anything is sent", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      await expect(secrets.get("serve.password")).rejects.toThrow(RangeError);
      await expect(secrets.set("1password", "x")).rejects.toThrow(RangeError);
      await expect(secrets.remove("../token")).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("leaves the value rule to the shell: up to its limit is kept, one byte more is a RangeError", async () => {
      const secrets = new TauriSecrets(new FakeShell());
      const longest = "v".repeat(shellMaxValueBytes);
      await secrets.set("long", longest);
      expect(await secrets.get("long")).toBe(longest);
      await expect(secrets.set("long", `${longest}v`)).rejects.toThrow(RangeError);
      await expect(secrets.set("empty", "")).rejects.toThrow(RangeError);
      expect(await secrets.get("long")).toBe(longest);
    });

    it("follows a backend that holds less, such as the Windows Credential Manager", async () => {
      const shell = new FakeShell({ maxValueBytes: windowsMaxValueBytes });
      const secrets = new TauriSecrets(shell);
      await expect(secrets.set("token", "v".repeat(windowsMaxValueBytes + 1))).rejects.toThrow(
        RangeError,
      );
      expect(shell.entries.size).toBe(0);
    });

    it("refuses an answer that is not a value", async () => {
      const secrets = new TauriSecrets({ invoke: async () => 42 });
      const error = await rejection(secrets.get("token"));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
    });
  });
});

verifies("secrets-tauri.refusals", () => {
  describe("TauriSecrets refusals", () => {
    const keychainRefusals: ReadonlyArray<[RefusalKind, string]> = [
      ["unavailable", "unavailable"],
      ["denied", "denied"],
      ["unreadable", "unauthenticated"],
      ["backend", "unavailable"],
    ];

    for (const [refusal, kind] of keychainRefusals) {
      it(`turns ${refusal} into a KeychainError of kind ${kind}, never null`, async () => {
        const shell = new FakeShell();
        const secrets = new TauriSecrets(shell);
        await secrets.set("token", "kept");
        shell.refuseNext(refusal);
        const error = await rejection(secrets.get("token"));
        expect(error).toBeInstanceOf(KeychainError);
        expect((error as KeychainError).refusal).toBe(refusal);
        expect(errorKindOf(error)).toBe(kind);
      });
    }

    it("turns a refused name into a RangeError, should the shell's rule ever be stricter", async () => {
      const shell = new FakeShell();
      shell.refuseNext("invalid_name");
      await expect(new TauriSecrets(shell).remove("token")).rejects.toThrow(RangeError);
    });

    it("turns a rejection that isn't a refusal into a backend error without its text", async () => {
      const secrets = new TauriSecrets({
        invoke: async () => {
          throw new Error("ipc failed near value-that-must-not-show");
        },
      });
      const error = await rejection(secrets.set("token", "value-that-must-not-show"));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
      expect(String(error)).not.toContain("value-that-must-not-show");
      expect((error as KeychainError).cause).toBeUndefined();
    });

    it("turns Tauri's text rejection for a page without the capability into a backend error", async () => {
      const secrets = new TauriSecrets(new FakeShell({ granted: false }));
      const error = await rejection(secrets.get("token"));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("backend");
    });

    it("never puts the value in a refusal it passes on", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      const value = `secret-${"x".repeat(shellMaxValueBytes)}`;
      const error = await rejection(secrets.set("token", value));
      expect(String(error)).not.toContain("secret-");
    });
  });
});

describe("FakeShell", () => {
  // The fake stands in for crates/secrets, so it must refuse what the shell refuses.
  it("refuses a bad name and an unknown command, as the shell does", async () => {
    const shell = new FakeShell();
    await expect(shell.invoke("secret_get", { name: "token.key" })).rejects.toEqual({
      kind: "invalid_name",
      message: "not a secret name",
    });
    await expect(shell.invoke("secret_list", { name: "token" })).rejects.toBe(
      "Command secret_list not found",
    );
  });
});
