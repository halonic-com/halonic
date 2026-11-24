import type { PaperclipKeyHandOver } from "@halonicjs/adapter-agent-host-client";
import { maxTokenNameLength } from "@halonicjs/adapter-secrets-tauri";
import { tokenNamePrefix, workspaceSecrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { connectPaperclip, paperclipKeyEntryText, paperclipKeyTokenName } from "./paperclip-key.ts";

// A fake key only these tests use, so its absence from answers means something.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const entry = { key: fakeKey, address: "https://paperclip.acme.test", company: "acme-company" };

/** The keychain's tokens, kept in memory. */
function tokensWith(stored: Record<string, string>) {
  return { get: vi.fn(async (name: string) => stored[name] ?? null) };
}

/** An agent host that records what it was handed. */
function fakeHost() {
  return { handOver: vi.fn(async (_entry: PaperclipKeyHandOver) => undefined) };
}

verifies("services.paperclip-connect", () => {
  describe("connectPaperclip", () => {
    it("hands the key, with the address and company it was made for, to the host", async () => {
      const tokens = tokensWith({ "paperclip-halonic": paperclipKeyEntryText(entry) });
      const host = fakeHost();

      const result = await connectPaperclip(tokens, host, "halonic");

      expect(result).toBe("connected");
      expect(JSON.stringify(result)).not.toContain(fakeKey);
      expect(tokens.get).toHaveBeenCalledWith("paperclip-halonic");
      expect(host.handOver).toHaveBeenCalledWith({ connection: "halonic", ...entry });
    });

    it("hands nothing over when the keychain holds no key for the connection", async () => {
      const host = fakeHost();

      expect(await connectPaperclip(tokensWith({}), host, "halonic")).toBe("sign-in-needed");
      expect(host.handOver).not.toHaveBeenCalled();
    });

    it("hands nothing over when the keychain's text isn't a key entry", async () => {
      const host = fakeHost();
      for (const text of ["not json", "null", JSON.stringify({ key: fakeKey }), '"text"']) {
        const tokens = tokensWith({ "paperclip-halonic": text });
        expect(await connectPaperclip(tokens, host, "halonic")).toBe("sign-in-needed");
      }
      expect(host.handOver).not.toHaveBeenCalled();
    });
  });

  describe("where the key is kept", () => {
    it("is a token, under the prefix a workspace's secrets refuse, without asking the keychain", async () => {
      const keychain = { get: vi.fn(async () => fakeKey) };
      const kept = `${tokenNamePrefix}${paperclipKeyTokenName("halonic")}`;

      await expect(workspaceSecrets(keychain).get(kept)).rejects.toThrow(RangeError);
      expect(keychain.get).not.toHaveBeenCalled();
    });

    it("fits the keychain's token names for the longest connection name the host takes", () => {
      expect(paperclipKeyTokenName("a".repeat(64)).length).toBeLessThanOrEqual(maxTokenNameLength);
    });
  });
});
