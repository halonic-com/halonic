import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { KeychainError } from "./keychain-error.ts";
import { TauriSecrets } from "./tauri-secrets.ts";
import { maxTokenNameLength, TauriTokens } from "./tauri-tokens.ts";

// Not run through `tokenStoreContract`: its longest name is 128 characters, and a token's name
// may be at most `maxTokenNameLength` once the shell adds the prefix. The cases below cover the rest.

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("secrets-tauri.token-commands", () => {
  describe("TauriTokens", () => {
    it("sends each call to its token_* command with the token's own name", async () => {
      const shell = new FakeShell();
      const tokens = new TauriTokens(shell);
      await tokens.set("Google-Refresh", "example-token");
      expect(await tokens.get("google_refresh")).toBe("example-token");
      await tokens.remove("GOOGLE-REFRESH");
      expect(shell.calls).toEqual([
        { command: "token_set", args: { name: "Google-Refresh", value: "example-token" } },
        { command: "token_get", args: { name: "google_refresh" } },
        { command: "token_delete", args: { name: "GOOGLE-REFRESH" } },
      ]);
      expect(shell.entries.size).toBe(0);
    });

    it("keeps a token apart from a secret of the same name", async () => {
      const shell = new FakeShell();
      const tokens = new TauriTokens(shell);
      const secrets = new TauriSecrets(shell);
      await tokens.set("acme_key", "example-token");
      expect(await secrets.get("acme_key")).toBeNull();
      expect([...shell.entries.keys()]).toEqual(["halonic_token_acme_key"]);
    });

    it("refuses a name that breaks the rule, and sends nothing", async () => {
      const shell = new FakeShell();
      const tokens = new TauriTokens(shell);
      for (const bad of ["", "1token", "token.key", "to ken"]) {
        const label = JSON.stringify(bad);
        await expect(tokens.get(bad), label).rejects.toThrow(RangeError);
        await expect(tokens.set(bad, "example-token"), label).rejects.toThrow(RangeError);
        await expect(tokens.remove(bad), label).rejects.toThrow(RangeError);
      }
      expect(shell.calls).toEqual([]);
    });

    it("refuses a name too long to fit once prefixed, without sending it or repeating it", async () => {
      const shell = new FakeShell();
      const tokens = new TauriTokens(shell);
      const longest = "t".repeat(maxTokenNameLength);
      const tooLong = "t".repeat(maxTokenNameLength + 1);
      await tokens.set(longest, "example-token");
      const refused = await rejection(tokens.set(tooLong, "example-token"));
      expect(refused).toBeInstanceOf(RangeError);
      expect(String(refused)).not.toContain(tooLong);
      expect(shell.calls.map((call) => call.args?.["name"])).toEqual([longest]);
    });

    it("refuses a malformed answer rather than take it for a token or for success", async () => {
      const getting = await rejection(new TauriTokens({ invoke: async () => "" }).get("acme"));
      const setting = await rejection(
        new TauriTokens({ invoke: async () => ({ stored: false }) }).set("acme", "example-token"),
      );
      for (const refused of [getting, setting]) {
        expect(refused).toBeInstanceOf(KeychainError);
        expect((refused as KeychainError).refusal).toBe("backend");
      }
    });
  });
});

verifies("secrets-tauri.refusals", () => {
  describe("Halonic's own names", () => {
    it("rejects with a RangeError when the shell refuses a name as reserved_name", async () => {
      const shell = new FakeShell();
      shell.entries.set("token_key", "example-key");
      shell.entries.set("halonic_token_google_refresh", "example-token");
      const secrets = new TauriSecrets(shell);
      for (const name of ["token-key", "Serve_Password", "halonic-token-google-refresh"]) {
        const refused = await rejection(secrets.get(name));
        expect(refused).toBeInstanceOf(RangeError);
        expect(String(refused)).toContain("reserved_name");
        expect(String(refused)).not.toContain("example-");
      }
    });
  });
});
