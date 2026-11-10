import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { FakeShell, shellMaxValueBytes } from "./fake-shell.test-helper.ts";
import { KeychainError } from "./keychain-error.ts";
import type { TauriShell } from "./shell.ts";
import { TauriSecrets } from "./tauri-secrets.ts";

// Attack cases (HAL-2899). Name attacks that apply to every adapter are in
// the secrets and token-store contracts; these are the shell's own.

/** A made-up value each case looks for in what reaches the caller. */
const value = "attack-value-7f3a";

/** A shell whose every command rejects with `reason`. */
function rejectingShell(reason: unknown): TauriShell {
  return {
    invoke: async () => {
      throw reason;
    },
  };
}

/** A shell whose every command answers `answer`. */
function answeringShell(answer: unknown): TauriShell {
  return { invoke: async () => answer };
}

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<Error> {
  const reason = await action.then(
    () => expect.unreachable("the call should have failed"),
    (error: unknown) => error,
  );
  expect(reason).toBeInstanceOf(Error);
  return reason as Error;
}

/** Every way a caller or a log can turn an error into text. */
function everyRendering(error: Error): string[] {
  return [
    String(error),
    error.message,
    error.stack ?? "",
    JSON.stringify(error),
    JSON.stringify(error.cause ?? null),
    String(error.cause),
  ];
}

verifies("secrets-tauri.refusals", () => {
  describe("TauriSecrets leaks", () => {
    // Failures that aren't the shell's refusal shape: their text may hold the value.
    const foreignFailures: ReadonlyArray<[string, unknown]> = [
      ["an Error naming the value", new Error(`denied while storing ${value}`)],
      ["an Error whose cause holds the value", new Error("ipc", { cause: value })],
      ["text naming the value", `keychain locked: ${value}`],
      ["the value itself", value],
      ["an unknown kind", { kind: "locked", message: `locked with ${value}` }],
      ["a kind in the wrong case", { kind: "Denied", message: value }],
      ["a message that isn't text", { kind: "denied", message: { value } }],
      ["a missing message", { kind: "unavailable", value }],
      ["null", null],
      ["undefined", undefined],
    ];

    for (const [label, reason] of foreignFailures) {
      it(`turns ${label} into a backend error that holds nothing of it`, async () => {
        for (const action of [
          (secrets: TauriSecrets) => secrets.set("token", value),
          (secrets: TauriSecrets) => secrets.get("token"),
          (secrets: TauriSecrets) => secrets.remove("token"),
        ]) {
          const error = await rejection(action(new TauriSecrets(rejectingShell(reason))));
          expect(error).toBeInstanceOf(KeychainError);
          expect((error as KeychainError).refusal).toBe("backend");
          expect(error.cause).toBeUndefined();
          for (const text of everyRendering(error)) {
            expect(text, label).not.toContain(value);
          }
        }
      });
    }

    it("keeps only the kind and message of a refusal, never a field the shell added", async () => {
      const secrets = new TauriSecrets(
        rejectingShell({ kind: "denied", message: "access was refused", value, detail: value }),
      );
      const error = await rejection(secrets.set("token", value));
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).refusal).toBe("denied");
      expect(Object.keys(error).sort()).toEqual(["name", "refusal"]);
      for (const text of everyRendering(error)) {
        expect(text).not.toContain(value);
      }
    });

    it("keeps the value out of a refused value's RangeError", async () => {
      const shell = new FakeShell({ maxValueBytes: 8 });
      const error = await rejection(new TauriSecrets(shell).set("token", value));
      expect(error).toBeInstanceOf(RangeError);
      for (const text of everyRendering(error)) {
        expect(text).not.toContain(value);
      }
    });

    it("keeps a value passed as the name out of the RangeError, and out of the shell", async () => {
      const shell = new FakeShell();
      const longValue = `${value}-${"x".repeat(200)}`;
      const error = await rejection(new TauriSecrets(shell).set(longValue, "x"));
      expect(error).toBeInstanceOf(RangeError);
      expect(shell.calls).toEqual([]);
      for (const text of everyRendering(error)) {
        expect(text).not.toContain(value);
      }
    });

    it("writes nothing to the console when the keychain fails", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {}),
      );
      try {
        const shell = new FakeShell();
        const secrets = new TauriSecrets(shell);
        for (const kind of ["unavailable", "denied", "unreadable", "backend"] as const) {
          shell.refuseNext(kind);
          await rejection(secrets.set("token", value));
        }
        await rejection(new TauriSecrets(rejectingShell(new Error(value))).set("token", value));
        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
        }
      } finally {
        for (const spy of spies) {
          spy.mockRestore();
        }
      }
    });
  });
});

verifies("secrets-tauri.shell-commands", () => {
  describe("TauriSecrets replies", () => {
    // `secret_get` answers `Option<String>`: text or null, nothing else.
    const wrongAnswers: ReadonlyArray<[string, unknown]> = [
      ["undefined", undefined],
      ["a number", 42],
      ["a boolean", true],
      ["an object holding the value", { value }],
      ["an array", [value]],
      ["a boxed string", Object(value)],
      ["an object that turns into text", { toString: () => value }],
    ];

    for (const [label, answer] of wrongAnswers) {
      it(`refuses ${label} as an answer to secret_get, without repeating it`, async () => {
        const error = await rejection(new TauriSecrets(answeringShell(answer)).get("token"));
        expect(error).toBeInstanceOf(KeychainError);
        expect((error as KeychainError).refusal).toBe("backend");
        for (const text of everyRendering(error)) {
          expect(text, label).not.toContain(value);
        }
      });
    }

    it("sends only the name, or the name and the value, and nothing a caller could add", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      await secrets.set("token", value);
      await secrets.get("token");
      await secrets.remove("token");
      expect(shell.calls.map((call) => Object.keys(call.args ?? {}).sort())).toEqual([
        ["name", "value"],
        ["name"],
        ["name"],
      ]);
    });
  });

  describe("TauriSecrets names", () => {
    it("checks the name it sends, so a name that changes when read twice can't slip through", async () => {
      const shell = new FakeShell();
      let reads = 0;
      const shifty = {
        toString: () => (reads++ === 0 ? "token" : "../token"),
      } as unknown as string;
      await expect(new TauriSecrets(shell).get(shifty)).rejects.toThrow();
      expect(shell.calls).toEqual([]);
    });

    it("stores names that differ only in case or - versus _ as one entry, and others apart", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      await secrets.set("api-key", "one");
      await secrets.set("API_KEY", "two");
      await secrets.set("api-keys", "three");
      await secrets.set("apikey", "four");
      expect([...shell.entries]).toEqual([
        ["api_key", "two"],
        ["api_keys", "three"],
        ["apikey", "four"],
      ]);
    });
  });

  describe("TauriSecrets sizes", () => {
    const wholeValues: ReadonlyArray<[string, string]> = [
      ["one character", "v"],
      [
        "the shell's limit in three-byte characters",
        "€".repeat(Math.floor(shellMaxValueBytes / 3)),
      ],
      ["characters outside the BMP", "🔑".repeat(1000)],
      ["a NUL in the middle", "before\u0000after"],
      ["line breaks and quotes", "line\r\n\"quoted\"\t'x'"],
    ];

    for (const [label, whole] of wholeValues) {
      it(`sends ${label} whole and reads it back whole`, async () => {
        const shell = new FakeShell();
        const secrets = new TauriSecrets(shell);
        await secrets.set("token", whole);
        expect(shell.calls[0]?.args?.["value"]).toBe(whole);
        expect(await secrets.get("token")).toBe(whole);
      });
    }

    it("sends a value far over the limit whole, so the shell refuses it rather than a cut copy", async () => {
      const shell = new FakeShell();
      const huge = "v".repeat(4 * 1024 * 1024);
      await expect(new TauriSecrets(shell).set("token", huge)).rejects.toThrow(RangeError);
      expect(shell.calls[0]?.args?.["value"]).toBe(huge);
      expect(shell.entries.size).toBe(0);
    });

    it("refuses one three-byte character over the limit, counting bytes rather than characters", async () => {
      const shell = new FakeShell();
      const over = "€".repeat(Math.floor(shellMaxValueBytes / 3) + 1);
      await expect(new TauriSecrets(shell).set("token", over)).rejects.toThrow(RangeError);
      expect(shell.entries.size).toBe(0);
    });

    it("keeps the stored value when an empty one is refused", async () => {
      const shell = new FakeShell();
      const secrets = new TauriSecrets(shell);
      await secrets.set("token", value);
      await expect(secrets.set("token", "")).rejects.toThrow(RangeError);
      expect(await secrets.get("token")).toBe(value);
    });
  });
});
