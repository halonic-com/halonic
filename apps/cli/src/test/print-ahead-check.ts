// A setup file for every CLI test (see `vitest.config.ts`): a command whose
// lines printed ahead don't start its result fails the test it ran in, even
// though `runCli` itself prints every line and carries on.

import { afterEach } from "vitest";
import { type Phrase, renderPhrase } from "../messages/phrase.ts";
import { paintFor } from "../output/paint.ts";
import { takePrintAheadMismatches } from "../output/printed-ahead.ts";

const plain = paintFor({ colour: false, unicode: true, live: false });

function shown(lines: readonly Phrase[]): string {
  return lines.map((line) => `  ${renderPhrase(line, plain)}`).join("\n");
}

/** Throws when a command's lines printed ahead didn't start its result since the last check. */
export function failOnPrintAheadMismatch(): void {
  const [first] = takePrintAheadMismatches();
  if (first === undefined) {
    return;
  }
  throw new Error(
    "A command printed lines ahead that aren't the first lines of its result.\n" +
      `Printed ahead:\n${shown(first.printed)}\nResult:\n${shown(first.result)}`,
  );
}

afterEach(failOnPrintAheadMismatch);
