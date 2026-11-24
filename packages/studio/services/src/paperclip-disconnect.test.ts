import { AgentHostError, type PaperclipConnectionRef } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { disconnectPaperclip } from "./paperclip-key.ts";

const halonic = { workspace: "/work/acme", connection: "halonic" };

/** The keychain's tokens, kept in memory. */
function tokensWith(stored: Record<string, string>) {
  return {
    stored,
    remove: vi.fn(async (name: string) => {
      delete stored[name];
    }),
  };
}

/** An agent host whose disconnect answers `answer`, or fails with it when it is an error. */
function hostAnswering(answer: { revoked: boolean } | Error) {
  return {
    disconnect: vi.fn(async (_ref: PaperclipConnectionRef) => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

verifies("services.paperclip-disconnect", () => {
  describe("disconnectPaperclip", () => {
    it("asks the host to revoke, then deletes the keychain entry", async () => {
      const tokens = tokensWith({ "paperclip-halonic": "entry" });
      const host = hostAnswering({ revoked: true });

      expect(await disconnectPaperclip(tokens, host, halonic)).toEqual({ revoked: true });
      expect(host.disconnect).toHaveBeenCalledWith(halonic);
      expect(tokens.stored).toEqual({});
    });

    it("still deletes the keychain entry when Paperclip didn't revoke the key, and says so", async () => {
      const tokens = tokensWith({ "paperclip-halonic": "entry" });

      const result = await disconnectPaperclip(tokens, hostAnswering({ revoked: false }), halonic);

      expect(result).toEqual({ revoked: false });
      expect(tokens.stored).toEqual({});
    });

    it("still deletes the keychain entry when the host can't be asked, then fails with its error", async () => {
      const tokens = tokensWith({ "paperclip-halonic": "entry" });
      const down = new AgentHostError(0, "unreachable", "The agent host isn't running.");

      await expect(disconnectPaperclip(tokens, hostAnswering(down), halonic)).rejects.toBe(down);
      expect(tokens.remove).toHaveBeenCalledWith("paperclip-halonic");
      expect(tokens.stored).toEqual({});
    });
  });
});
