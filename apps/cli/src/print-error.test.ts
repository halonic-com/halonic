import { KindedError, SecretScrubber } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { UsageError } from "./command.ts";
import { type PrintErrorContext, printError } from "./print-error.ts";

/** Prints `error` and returns the lines written. */
function printed(error: unknown, context: PrintErrorContext = {}): string[] {
  const lines: string[] = [];
  printError(error, (line) => lines.push(line), context);
  return lines;
}

/** An `Error` with a fixed stack, so a test can check every line `--debug` prints. */
function withStack<T extends Error>(error: T, ...frames: string[]): T {
  error.stack = [`${error.name}: ${error.message}`, ...frames].join("\n");
  return error;
}

const internalLines = [
  "✕ Halonic ran into a problem it can't explain yet.",
  "  Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
];

verifies("cli.print-error", () => {
  it("prints the message after ✕ and the error's fix on its own indented line", () => {
    const error = {
      kind: "unavailable",
      message: "Halonic couldn't reach Ollama at localhost:11434.",
      fix: "Start Ollama, then run again.",
    };
    expect(printed(error)).toEqual([
      "✕ Halonic couldn't reach Ollama at localhost:11434.",
      "  Start Ollama, then run again.",
    ]);
  });

  it("prints no fix line when the error has no fix, or an empty one", () => {
    const noFix = new KindedError(
      "not_found",
      'There\'s no workflow called "supprt-reply" in acme.',
    );
    expect(printed(noFix)).toEqual(['✕ There\'s no workflow called "supprt-reply" in acme.']);
    expect(printed({ kind: "conflict", message: "The folder isn't empty.", fix: " " })).toEqual([
      "✕ The folder isn't empty.",
    ]);
  });

  it("shows the usage line as the fix of a wrong command line", () => {
    const error = new UsageError(
      "halonic schema takes at most one folder, and you gave two: a, b.",
    );
    expect(printed(error, { usage: "Usage: halonic schema [outDir]" })).toEqual([
      "✕ halonic schema takes at most one folder, and you gave two: a, b.",
      "  Usage: halonic schema [outDir]",
    ]);
  });

  it("shows a wrong command line's own fix instead of the usage line", () => {
    const error = new UsageError('There\'s no command "deploy".', {
      fix: "Run halonic --help to see every command.",
    });
    expect(printed(error, { usage: "Usage: halonic schema [outDir]" })).toEqual([
      '✕ There\'s no command "deploy".',
      "  Run halonic --help to see every command.",
    ]);
  });

  it("never shows the text of an error without a kind", () => {
    expect(printed(new Error("EACCES: permission denied, open '/work/acme/secret.txt'"))).toEqual(
      internalLines,
    );
    expect(printed("boom")).toEqual(internalLines);
    expect(
      printed(new KindedError("internal", "The run store returned a damaged record.")),
    ).toEqual(internalLines);
  });

  it("adds a bug's own text and stack after its lines with --debug", () => {
    const error = withStack(
      new Error("The run store returned a damaged record."),
      "    at load (store.ts:12:3)",
    );
    expect(printed(error, { debug: true })).toEqual([
      ...internalLines,
      "Error: The run store returned a damaged record.",
      "    at load (store.ts:12:3)",
    ]);
  });

  it("follows the cause chain with --debug, for every kind", () => {
    const disk = withStack(
      new Error("ENOSPC: no space left on device"),
      "    at write (fs.ts:1:1)",
    );
    const error = withStack(
      new KindedError("unavailable", "Halonic couldn't save the run.", {
        fix: "Free some disk space, then run again.",
        cause: disk,
      }),
      "    at save (runs.ts:40:5)",
    );
    expect(printed(error, { debug: true })).toEqual([
      "✕ Halonic couldn't save the run.",
      "  Free some disk space, then run again.",
      "KindedError: Halonic couldn't save the run.",
      "    at save (runs.ts:40:5)",
      "Caused by: Error: ENOSPC: no space left on device",
      "    at write (fs.ts:1:1)",
    ]);
  });

  it("prints a thrown value without a stack as text with --debug, and stops at a cause loop", () => {
    expect(printed("boom", { debug: true })).toEqual([...internalLines, "boom"]);
    const looped: { kind: string; message: string; cause?: unknown } = {
      kind: "conflict",
      message: "The folder isn't empty.",
    };
    looped.cause = looped;
    expect(printed(looped, { debug: true })).toEqual([
      "✕ The folder isn't empty.",
      "The folder isn't empty.",
    ]);
  });

  describe("scrubs the secrets the CLI loaded", () => {
    // Made-up values, not shaped like any real key.
    const token = "made-up-token-42";
    const pem = "-----BEGIN KEY-----\nmade-up\n-----END KEY-----";
    const scrubber = new SecretScrubber();
    scrubber.remember(token);
    scrubber.remember(pem);

    it("from the ✕ line and the fix line", () => {
      const error = new KindedError("unauthenticated", `The key ${token} was refused.`, {
        fix: `Replace ${token} in your settings.`,
      });
      expect(printed(error, { scrubber })).toEqual([
        "✕ The key [secret removed] was refused.",
        "  Replace [secret removed] in your settings.",
      ]);
    });

    it("from a bug's message, stack and causes with --debug", () => {
      const cause = withStack(
        new Error(`GET /v1?key=${token} failed`),
        "    at fetch (http.ts:1:1)",
      );
      const error = withStack(
        new Error(`could not call with ${token}`, { cause }),
        "    at call (a.ts:2:3)",
      );
      expect(printed(error, { scrubber, debug: true })).toEqual([
        ...internalLines,
        "Error: could not call with [secret removed]",
        "    at call (a.ts:2:3)",
        "Caused by: Error: GET /v1?key=[secret removed] failed",
        "    at fetch (http.ts:1:1)",
      ]);
    });

    it("whole, when the secret holds a line break, before the text is split into lines", () => {
      const error = withStack(new Error(`bad key ${pem}`), "    at load (keys.ts:4:1)");
      expect(printed(error, { scrubber, debug: true })).toEqual([
        ...internalLines,
        "Error: bad key [secret removed]",
        "    at load (keys.ts:4:1)",
      ]);
    });
  });
});
