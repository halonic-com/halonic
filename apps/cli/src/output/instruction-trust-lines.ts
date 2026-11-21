import type { InstructionTrustCheck } from "@halonicjs/app";
import type { InstructionPin } from "@halonicjs/ports";
import { columns } from "../messages/columns.ts";
import { type Phrase, phrase } from "../messages/phrase.ts";
import { trustMessages } from "../messages/trust.ts";
import { trustInstructionsMessages as words } from "../messages/trust-instructions.ts";
import { printable } from "./printable.ts";
import { rowIndent } from "./trust-check-rows.ts";

/** An instruction check that asks a person: never `trusted`. */
export type InstructionQuestion = Exclude<InstructionTrustCheck, { kind: "trusted" }>;

/**
 * What a person reads before trusting an agent's instructions: the files,
 * tagged New, Changed or Removed when other instructions were trusted
 * before, then the full fingerprint, which `--fingerprint` takes. The
 * same lines go before the question and into a refusal.
 *
 * @param agent - the agent as the person typed it, escaped for the terminal
 * @param harness - the name of the harness it runs in, such as Claude Code, if it has one
 */
export function instructionTrustLines(
  agent: string,
  check: InstructionQuestion,
  pin: InstructionPin,
  harness?: string,
): Phrase[] {
  return [
    words.heading(agent).phrase,
    phrase`${rowIndent}${introOf(agent, check, harness)}`,
    phrase``,
    ...fileRows(check, pin),
    phrase``,
    trustMessages.fingerprintHeading().phrase,
    phrase`${rowIndent}${pin.digest}`,
  ];
}

function introOf(agent: string, check: InstructionQuestion, harness?: string): Phrase {
  if (check.unreadable !== undefined) return words.unreadable().phrase;
  return check.hadTrusted ? words.changedSince().phrase : words.firstTime(agent, harness).phrase;
}

/**
 * One row per file, by name. The first time, every file is new, so none is
 * tagged; after that only what changed is, and a removed file is listed too.
 * A tag goes at the end of its row, as in `halonic trust`, and the tags line
 * up in one column after the longest name.
 */
function fileRows(check: InstructionQuestion, pin: InstructionPin): Phrase[] {
  const names = Object.keys(pin.files);
  if (!check.hadTrusted) {
    return names.map((name) => phrase`${rowIndent}${printable(name)}`);
  }
  const { added, changed, removed } = check.changes;
  const tagOf = (name: string): Phrase | undefined => {
    if (added.includes(name)) return words.newFile().phrase;
    if (changed.includes(name)) return words.changedFile().phrase;
    return undefined;
  };
  // A file with no tag is a row of one cell, so its line doesn't end in spaces.
  const rowOf = (name: string, tag: Phrase | undefined): Phrase[] => {
    const cell = phrase`${rowIndent}${printable(name)}`;
    return tag === undefined ? [cell] : [cell, tag];
  };
  return columns([
    ...names.map((name) => rowOf(name, tagOf(name))),
    ...removed.map((name) => rowOf(name, words.removedFile().phrase)),
  ]);
}
