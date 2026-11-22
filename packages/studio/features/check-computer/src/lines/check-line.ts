import type { DoctorAction } from "@halonicjs/app";
import type { CheckLineId } from "../check-facts.ts";
import type { CheckMark } from "../check-marks.ts";

/** A part of a sentence: plain words, or a name the screen sets as code, such as `localhost:11434`. */
export type LinePart = string | { readonly code: string };

/** One sentence of a line: what it found, or the fix under it ("Fix: …"). */
export interface LineSentence {
  readonly kind: "found" | "fix";
  readonly parts: readonly LinePart[];
}

/**
 * What a line offers (first-run-progress 4.2's Button column): the doctor's actions, plus
 * **Check again** on a model server and **Continue** and **Start over…** on a Google setup.
 */
export type CheckAction = DoctorAction | "check-again" | "continue-setup" | "start-over";

/** One line of Check this computer as the screen shows it. */
export interface CheckLine {
  readonly id: CheckLineId;
  readonly label: string;
  readonly mark: CheckMark;
  /** The first is beside the label; the rest under it. Never empty. */
  readonly sentences: readonly LineSentence[];
  readonly actions: readonly CheckAction[];
}

/** A sentence of what the line found. */
export function found(...parts: LinePart[]): LineSentence {
  return { kind: "found", parts };
}

/** A fix, which the screen sets under what was found: "Fix: start Ollama on this computer, then check again." */
export function fix(text: string): LineSentence {
  return { kind: "fix", parts: [text] };
}

/**
 * The sentence as plain text, such as for a screen reader or a test: a code part keeps its text.
 *
 * @example
 * sentenceText(found("Ollama isn't answering at ", { code: "localhost:11434" }, ".")); // "Ollama isn't answering at localhost:11434."
 */
export function sentenceText(sentence: LineSentence): string {
  return sentence.parts.map((part) => (typeof part === "string" ? part : part.code)).join("");
}
