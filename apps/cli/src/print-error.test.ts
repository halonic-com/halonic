import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { UsageError } from "./command.ts";
import { printError } from "./print-error.ts";

/** Prints `error` and returns the lines written. */
function printed(error: unknown, usage?: string): string[] {
  const lines: string[] = [];
  printError(error, (line) => lines.push(line), usage === undefined ? {} : { usage });
  return lines;
}

const internalLines = [
  "✕ Halonic ran into a problem it can't explain yet.",
  "  Report it: https://github.com/halonic-com/halonic/issues",
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
    const error = new UsageError("Give at most one folder.");
    expect(printed(error, "Usage: halonic schema [outDir]")).toEqual([
      "✕ Give at most one folder.",
      "  Usage: halonic schema [outDir]",
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
});
