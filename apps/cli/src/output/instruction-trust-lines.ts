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

/** Where a person reads one of the pinned files: what it is, and its file in the workspace. */
export interface InstructionSource {
  /** "Instructions", or "Skill review". */
  readonly label: Phrase;
  /** The workspace-relative path; `undefined` for a removed skill whose file is gone. */
  readonly path: string | undefined;
}

/** What the lines say about the agent besides its files. */
export interface InstructionsAbout {
  /** The name of the harness it runs in, such as Claude Code. */
  readonly harness: string | undefined;
  /** Where to read a file of the pin, by its name in the pin, such as `AGENTS.md`. */
  readonly sourceOf: (name: string) => InstructionSource;
}

/**
 * The question's intro, in the run's three cases: never trusted, changed
 * since, or what was trusted can't be read (which never counts as trust).
 */
export function whyAsked(check: InstructionQuestion): "first-time" | "changed" | "unreadable" {
  if (check.unreadable !== undefined) return "unreadable";
  return check.hadTrusted ? "changed" : "first-time";
}

/**
 * What a person reads before trusting an agent's instructions: one row per
 * file, naming the workspace file to read, tagged New, Changed or Removed
 * when other instructions were trusted before, then the full fingerprint,
 * which `--fingerprint` takes. The same lines go before the question and
 * into a refusal.
 *
 * @param agent - the agent as the person typed it, escaped for the terminal
 *
 * @example
 * instructionTrustLines("coder", check, pin, about);
 * // ["Trust check for coder's instructions", "These changed since you trusted them on this computer.", "",
 * //  "  Instructions   hubs/lab/agents/coder.agent.yaml          Changed",
 * //  "  Skill review   hubs/lab/library/skills/review/SKILL.md   New",
 * //  "", "Fingerprint", "  sha256:…"] (as phrases)
 */
export function instructionTrustLines(
  agent: string,
  check: InstructionQuestion,
  pin: InstructionPin,
  about: InstructionsAbout,
): Phrase[] {
  return [
    words.heading(agent).phrase,
    introOf(agent, check, about.harness),
    phrase``,
    ...fileRows(check, pin, about.sourceOf),
    phrase``,
    trustMessages.fingerprintHeading().phrase,
    phrase`${rowIndent}${pin.digest}`,
  ];
}

/** Starts at the left edge, right under the heading, as `halonic trust`'s does. */
function introOf(agent: string, check: InstructionQuestion, harness: string | undefined): Phrase {
  switch (whyAsked(check)) {
    case "unreadable":
      return words.unreadable().phrase;
    case "changed":
      return words.changedSince().phrase;
    case "first-time":
      return words.firstTime(agent, harness).phrase;
  }
}

/**
 * One row per file: what it is, its workspace file, and its tag. The first
 * time, every file is new, so none is tagged; after that only what changed
 * is, and a removed file is listed too. A tag goes at the end of its row, as
 * in `halonic trust`, and the cells line up in columns.
 */
function fileRows(
  check: InstructionQuestion,
  pin: InstructionPin,
  sourceOf: (name: string) => InstructionSource,
): Phrase[] {
  const names = Object.keys(pin.files);
  const { added, changed, removed } = check.hadTrusted
    ? check.changes
    : { added: [], changed: [], removed: [] };
  const tagOf = (name: string): Phrase | undefined => {
    if (added.includes(name)) return words.newFile().phrase;
    if (changed.includes(name)) return words.changedFile().phrase;
    return undefined;
  };
  // A file with no tag ends at its path, so its line doesn't end in spaces.
  const rowOf = (name: string, tag: Phrase | undefined): Phrase[] => {
    const source = sourceOf(name);
    const cells = [phrase`${rowIndent}${source.label}`, phrase`${printable(source.path ?? "")}`];
    return tag === undefined ? cells : [...cells, tag];
  };
  return columns([
    ...names.map((name) => rowOf(name, tagOf(name))),
    ...removed.map((name) => rowOf(name, words.removedFile().phrase)),
  ]);
}
