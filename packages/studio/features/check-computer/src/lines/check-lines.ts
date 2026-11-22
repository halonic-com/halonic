import { doctorLineActions, type WorkspaceLine } from "@halonicjs/app";
import {
  type DoctorFace,
  type DoctorLineWords,
  doctorLineWords,
  doctorMessages,
  plainText,
  printable,
  timedOutWords,
} from "@halonicjs/words";
import type { CheckFact, GoogleFact, ModelsFact, NotCheckedFact } from "../check-facts.ts";
import { checkMark } from "../check-marks.ts";
import { lineLabels } from "../report/report-lines.ts";
import { dayInReport } from "../report/report-names.ts";
import { type CheckAction, type CheckLine, fix, found, type LineSentence } from "./check-line.ts";
import { modelsSentences } from "./models-sentences.ts";
import { defaultModelSentences, lastRunSentences } from "./run-sentences.ts";
import { sandboxSentences } from "./sandbox-sentences.ts";

/** What the dialog knows besides the facts: Halonic's version and system, and whether the demo is open. */
export interface LinesContext {
  /** "Halonic 0.1.0 · macOS arm64", for the Engine line. */
  readonly about: string;
  readonly demo: boolean;
}

/**
 * Studio's face for the shared doctor words. Only the Harnesses, Network and Disk lines are worded
 * by them here, and none of those names a command, so the commands are the CLI's own.
 */
const studioFace: DoctorFace = {
  trustCommand: "halonic trust",
  validateCommand: "halonic validate",
  signInShell: "sh",
  shellWord: (text) => text,
};

/** The first letter as a capital: the shared words start in lower case after the CLI's label column. */
function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A line in the shared doctor words (`words.doctor-lines`), as the CLI says it, without its docs link. */
function sharedSentences(words: DoctorLineWords): LineSentence[] {
  return words.items.flatMap((item) => {
    if ("docs" in item) return [];
    if ("fix" in item) return [fix(plainText(item.fix))];
    return [found(capitalised(plainText(item.sentence)))];
  });
}

/** What the Workspace line says of its trust (4.2): the demo is always trusted, and the first run adds that Studio can open it. */
function trustSentences(
  name: string,
  trust: WorkspaceLine["trust"],
  demo: boolean,
): LineSentence[] {
  if (demo) return [found(`${name} demo · Studio can open it · Trusted.`)];
  switch (trust) {
    case "trusted":
      return [found(`${name} · Trusted.`)];
    case "not-needed":
      return [found(`${name} · Test model only, no trust needed.`)];
    case "changed":
      return [
        found(`${name} changed since you trusted it.`),
        found("Halonic asks again before the next run."),
      ];
    case "refused":
      return [found(`${name} has something Halonic can't trust.`)];
    case "new":
    case "unreadable":
      // A record that can't be read reads as not trusted, as in `halonic doctor`.
      return [
        found(`${name} isn't trusted yet.`),
        found("Halonic asks once, before the first run. This is on purpose."),
      ];
  }
}

/** The Workspace line in the 4.2 table's words: trust is asked once, on purpose, so it is a warning. */
function workspaceSentences(line: WorkspaceLine, demo: boolean): LineSentence[] {
  const sentences = trustSentences(printable(line.name), line.trust, demo);
  if (line.fileProblems !== undefined) {
    const count = line.fileProblems === 1 ? "1 problem" : `${line.fileProblems} problems`;
    sentences.push(found(`Its files have ${count}, so no run starts until they're fixed.`));
  }
  // The CLI's own sentences; its fix for the Windows drive is for the command line, so it stays there.
  if (line.windowsDrive !== undefined) {
    sentences.push(
      found(plainText(doctorMessages.onWindowsDrive(printable(line.windowsDrive)).phrase)),
    );
  }
  if (line.tooManyFilesToWatch !== undefined) {
    sentences.push(
      found(plainText(doctorMessages.tooManyFilesToWatch(line.tooManyFilesToWatch).phrase)),
      fix(plainText(doctorMessages.openSmallerFolder().phrase)),
    );
  }
  return sentences;
}

function googleSentences(line: GoogleFact): LineSentence[] {
  return [
    found(
      `Setup for ${printable(line.email)} is at step ${line.step} of ${line.steps}, started ${dayInReport(line.startedAt)}.`,
    ),
  ];
}

/** "Not checked here: the sandbox and harnesses, because the demo doesn't use them." (section 9) */
function notCheckedSentences(line: NotCheckedFact, demo: boolean): LineSentence[] {
  const parts = `the ${line.parts.join(" and ")}`;
  const who = demo ? "the demo doesn't" : "this workspace doesn't";
  return [found(`Not checked here: ${parts}, because ${who} use them.`)];
}

function sentencesOf(fact: CheckFact, context: LinesContext): LineSentence[] {
  if ("timedOut" in fact) return sharedSentences(timedOutWords(fact.check));
  switch (fact.check) {
    case "engine":
      return [found(fact.running ? `Running · ${context.about}` : "Not running")];
    case "workspace":
      return workspaceSentences(fact, context.demo);
    case "models":
      return modelsSentences(fact);
    case "default-model":
      return defaultModelSentences(fact);
    case "last-run":
      return lastRunSentences(fact);
    case "sandbox":
      return sandboxSentences(fact);
    case "google":
      return googleSentences(fact);
    case "not-checked":
      return notCheckedSentences(fact, context.demo);
    default:
      return sharedSentences(doctorLineWords(fact, studioFace));
  }
}

/** The Models line's actions: Test again for a real model, Check again on a server, Open Models while it has a problem. */
function modelsActions(fact: ModelsFact): CheckAction[] {
  const servers = fact.servers !== undefined && !("timedOut" in fact.servers);
  const testable = fact.keys.some((key) => key.keyStored === true) || servers;
  const actions: CheckAction[] = [];
  if (testable) actions.push("test-again");
  if (servers) actions.push("check-again");
  if (checkMark(fact) === "problem") actions.push("open-models");
  return actions;
}

function actionsOf(fact: CheckFact): readonly CheckAction[] {
  switch (fact.check) {
    case "engine":
    case "not-checked":
      return [];
    case "models":
      return modelsActions(fact);
    case "google":
      return ["continue-setup", "start-over"];
    default:
      return doctorLineActions(fact);
  }
}

/**
 * One line of Check this computer as the screen shows it (requirement `check-computer.lines`):
 * its label, its mark (one cause counted once, as the report's), its sentences and its actions.
 * The shared doctor words say the Harnesses, Network and Disk lines and a check that ran over its
 * time, so the dialog and `halonic doctor` agree; the 4.2 table's words say the others.
 *
 * @example
 * checkLine({ check: "engine", running: true }, { about: "Halonic 0.1.0 · macOS arm64", demo: true });
 * // { id: "engine", label: "Engine", mark: "pass", sentences: [Running · Halonic 0.1.0 · macOS arm64], actions: [] }
 */
export function checkLine(fact: CheckFact, context: LinesContext): CheckLine {
  return {
    id: fact.check,
    label: lineLabels[fact.check],
    mark: checkMark(fact),
    sentences: sentencesOf(fact, context),
    actions: actionsOf(fact),
  };
}
