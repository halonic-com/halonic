import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { KeychainError } from "./keychain-error.ts";
import type { TauriShell } from "./shell.ts";
import { TauriKeyOrigins } from "./tauri-key-origins.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A shell that answers every call with `answer`. */
function answering(answer: unknown): TauriShell {
  return { invoke: async () => answer };
}

verifies("secrets-tauri.key-origins", () => {
  describe("TauriKeyOrigins", () => {
    it("sends the name and the address as given, and reads the origins the shell made", async () => {
      const shell = new FakeShell();
      await new TauriSecrets(shell).set("Acme-Key", "key value");
      const origins = new TauriKeyOrigins(shell);
      expect(await origins.allowOrigin("acme_key", "https://LLM.example.com/v1")).toEqual({
        result: "added",
        origin: "https://llm.example.com",
      });
      expect(await origins.allowedOrigins("ACME-KEY")).toEqual(["https://llm.example.com"]);
      expect(shell.calls.slice(1)).toEqual([
        {
          command: "secret_allow_origin",
          args: { name: "acme_key", address: "https://LLM.example.com/v1" },
        },
        { command: "secret_allowed_origins", args: { name: "ACME-KEY" } },
      ]);
    });

    it("reads a key with no origins as undefined", async () => {
      const shell = new FakeShell();
      await new TauriSecrets(shell).set("acme-key", "key value");
      expect(await new TauriKeyOrigins(shell).allowedOrigins("acme-key")).toBeUndefined();
    });

    it("passes on each outcome the shell answers", async () => {
      const shell = new FakeShell();
      const origins = new TauriKeyOrigins(shell);
      expect(await origins.allowOrigin("acme-key", "https://llm.example.com")).toEqual({
        result: "no-key",
      });
      await new TauriSecrets(shell).set("acme-key", "key value");
      expect(await origins.allowOrigin("acme-key", "ftp://llm.example.com")).toEqual({
        result: "bad-address",
        problem: "not-an-address",
      });
      expect(await origins.allowOrigin("acme-key", "https://u:p@llm.example.com")).toEqual({
        result: "bad-address",
        problem: "has-user-info",
      });
      await origins.allowOrigin("acme-key", "https://llm.example.com");
      expect(await origins.allowOrigin("acme-key", "https://llm.example.com/other")).toEqual({
        result: "already-allowed",
        origin: "https://llm.example.com",
      });
      for (let port = 8001; port <= 8007; port += 1) {
        await origins.allowOrigin("acme-key", `https://llm.example.com:${port}`);
      }
      expect(await origins.allowOrigin("acme-key", "http://localhost:11434")).toEqual({
        result: "full",
      });
    });

    it("refuses a bad name before anything is sent", async () => {
      const shell = new FakeShell();
      const origins = new TauriKeyOrigins(shell);
      await expect(origins.allowedOrigins("api key")).rejects.toThrow(RangeError);
      await expect(origins.allowOrigin("1password", "https://llm.example.com")).rejects.toThrow(
        RangeError,
      );
      expect(shell.calls).toEqual([]);
    });

    it("rejects with the shell's refusal", async () => {
      const shell = new FakeShell();
      shell.refuseNext("denied");
      const reason = await rejection(new TauriKeyOrigins(shell).allowedOrigins("acme-key"));
      expect(reason).toBeInstanceOf(KeychainError);
      expect((reason as KeychainError).refusal).toBe("denied");
      await expect(new TauriKeyOrigins(shell).allowedOrigins("serve-password")).rejects.toThrow(
        RangeError,
      );
    });
  });
});

verifies("secrets-tauri.key-origins", () => {
  describe("TauriKeyOrigins with a malformed answer", () => {
    it.each([
      ["an empty list", []],
      ["a list with a repeat", ["https://llm.example.com", "https://llm.example.com"]],
      ["nine origins", Array.from({ length: 9 }, (_, index) => `https://llm${index}.example.com`)],
      ["an address with a path", ["https://llm.example.com/v1"]],
      ["an origin in the wrong case", ["https://LLM.example.com"]],
      ["something that isn't text", [42]],
      ["text", "https://llm.example.com"],
    ])("never reads %s as the key's origins", async (_, answer) => {
      const reason = await rejection(
        new TauriKeyOrigins(answering(answer)).allowedOrigins("acme-key"),
      );
      expect(reason).toBeInstanceOf(KeychainError);
      expect((reason as KeychainError).refusal).toBe("backend");
    });

    it.each([
      ["nothing", null],
      ["a list", ["https://llm.example.com"]],
      ["an unknown result", { result: "allowed" }],
      [
        "added with an address, not an origin",
        { result: "added", origin: "https://llm.example.com/v1" },
      ],
      ["added with no origin", { result: "added" }],
      ["a bad address with an unknown problem", { result: "bad-address", problem: "too-long" }],
    ])("never takes %s for an outcome", async (_, answer) => {
      const reason = await rejection(
        new TauriKeyOrigins(answering(answer)).allowOrigin("acme-key", "https://llm.example.com"),
      );
      expect(reason).toBeInstanceOf(KeychainError);
      expect((reason as KeychainError).refusal).toBe("backend");
    });
  });
});

/** Runs `run` with `URL.parse` taken away, as on Studio's oldest webviews, then puts it back. */
async function withoutUrlParse<T>(run: () => Promise<T>): Promise<T> {
  const parse = Object.getOwnPropertyDescriptor(URL, "parse");
  Reflect.deleteProperty(URL, "parse");
  try {
    expect("parse" in URL).toBe(false);
    return await run();
  } finally {
    if (parse !== undefined) {
      Object.defineProperty(URL, "parse", parse);
    }
  }
}

verifies("secrets-tauri.key-origins", () => {
  describe("TauriKeyOrigins on a webview without URL.parse", () => {
    it("reads the origins and the outcome the shell answers", async () => {
      const origins = ["https://llm.example.com", "http://localhost:11434"];
      const added = { result: "added", origin: "https://llm.example.com" };
      await withoutUrlParse(async () => {
        expect(await new TauriKeyOrigins(answering(origins)).allowedOrigins("acme-key")).toEqual(
          origins,
        );
        expect(
          await new TauriKeyOrigins(answering(added)).allowOrigin(
            "acme-key",
            "https://llm.example.com/v1",
          ),
        ).toEqual(added);
      });
    });

    it.each([
      ["an address with a path", ["https://llm.example.com/v1"]],
      ["text that isn't an address", ["llm.example.com"]],
    ])("still never reads %s as the key's origins", async (_, answer) => {
      const reason = await withoutUrlParse(() =>
        rejection(new TauriKeyOrigins(answering(answer)).allowedOrigins("acme-key")),
      );
      expect(reason).toBeInstanceOf(KeychainError);
    });
  });
});
