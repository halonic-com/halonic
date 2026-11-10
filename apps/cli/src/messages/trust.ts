import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** Where an unpinned program downloads its code from: npm for `npx`, PyPI for `uvx` and `pipx run`. */
export type PackageRegistry = "npm" | "PyPI";

/** How many program rows are marked New and how many Changed since the workspace was trusted. */
export interface ProgramChanges {
  readonly added: number;
  readonly changed: number;
}

/**
 * The sentences of `halonic trust [--dir <folder>]` (cli-output 1.7, 1.9 and
 * 3.5), in the content and order of Studio's trust check. In 0.1 the check
 * covers connectors only, so there are no sections for models, budgets or
 * sending without asking. Dates come in as the output writes them, such as
 * "3 Nov". Wherever a fix names `halonic trust`, `dir` is the user's own
 * `--dir`, so the command works where they typed it.
 */
export const trustMessages = defineMessages("trust", {
  summary: () => phrase`Review what a workspace or plugin can start, and trust it on this computer`,
  /** What `trust` was doing, for "✕ Couldn't trust Acme: …". */
  action: (name: string) => phrase`trust ${name}`,

  heading: (name: string, folder: string) => phrase`Trust check for ${name} (${folder})`,
  intro: (name: string) =>
    phrase`Before anything in ${name} runs on this computer, here's what it can start and where it can talk to.`,
  /** The heading instead, when the workspace changed since it was trusted. */
  changedHeading: (name: string, trustedOn: string) =>
    phrase`What changed in ${name} since you trusted it on ${trustedOn}`,
  /**
   * Studio's summary sentence, first under the changed heading. It names only
   * what changed, never a 0 (cli-output 3.5, revision 24). One changed row
   * carries the date; several are one list, new before changed, without the
   * date, because the heading already has it. Called only when something
   * changed.
   */
  changeSummary: (changes: ProgramChanges, trustedOn: string) => {
    if (changes.added + changes.changed === 1) {
      const row = changes.added === 1 ? "new program" : "changed program";
      return phrase`1 ${row} since you trusted this on ${trustedOn}.`;
    }
    return phrase`${changeList(changes)}.`;
  },
  /** After a row that wasn't there when it was trusted. */
  newRow: () => phrase`New`,
  /** After a row that is different from when it was trusted. */
  changedRow: () => phrase`Changed`,
  programsHeading: () => phrase`Programs`,
  /** The secrets a program gets, after its command: "gets the secret GMAIL_TOKEN". */
  getsSecrets: (names: readonly string[]) =>
    phrase`gets the ${names.length === 1 ? "secret" : "secrets"} ${listed(names)}`,
  /** Under a program whose version isn't pinned, with a ! (decided from the command alone). */
  notPinned: (registry: PackageRegistry) =>
    phrase`Can download new code from ${registry} when it starts: version not pinned.`,
  /** The label above the full fingerprint, which is never shortened. */
  fingerprintHeading: () => phrase`Fingerprint`,

  /** The question, framed with [y/N] by the question line. */
  question: (name: string) => phrase`Trust ${name} on this computer?`,
  /** The second question for a program that isn't pinned (Studio's checkbox). */
  notPinnedQuestion: () => phrase`It can download new code when it starts. Trust it anyway?`,
  trusted: (name: string) => phrase`${name} can run now.`,
  /** Answer No, or Enter: exit 3. */
  notTrusted: () => phrase`Not trusted. Nothing was started.`,
  alreadyTrusted: (name: string, trustedOn: string) =>
    phrase`${name} is already trusted on this computer. Nothing changed since ${trustedOn}.`,
  /** With a !, before the check, when the record of what's trusted can't be read. */
  listUnreadable: () =>
    phrase`Halonic couldn't read its list of trusted workspaces, so it's asking again.`,

  /** `--list`: "trusted on 3 Nov", after the name and the folder. */
  trustedOn: (date: string) => phrase`trusted on ${date}`,
  noneTrusted: () => phrase`No trusted workspaces yet.`,
  /** `--remove`. */
  removed: (name: string) =>
    phrase`Removed trust for ${name}. Its programs and real models won't start until you review it again.`,

  /** `--yes` alone: wrong usage, exit 2, and never a question (Liam's F5 on HAL-2618). */
  yesNeedsFingerprint: () =>
    phrase`--yes needs --fingerprint, so you trust exactly what you reviewed.`,
  yesNeedsFingerprintFix: (dir?: string) =>
    phrase`Run ${suggestedCommand("trust", dir)} to see it; the fingerprint is in the check, above the question.`,
  /** `--fingerprint` doesn't match: exit 3, and never a question, also in a terminal (F5). */
  fingerprintChanged: () => phrase`it changed since that fingerprint was made.`,
  fingerprintChangedFix: (dir?: string) =>
    phrase`Run ${suggestedCommand("trust", dir)} again to see what changed.`,
  /** No terminal, or `CI` set, and no flags that answer: exit 3 (F6), in F16's two lines (D4). */
  noTerminal: (name: string) =>
    phrase`${name} isn't trusted on this computer yet, and there's no terminal to ask you.`,
  noTerminalFix: (dir?: string) =>
    phrase`Review it with ${suggestedCommand("trust", dir)}, then pass --yes --fingerprint <fingerprint>.`,

  /** Why another command didn't start: "Acme isn't trusted on this computer yet." (section 4). */
  notTrustedYet: (name: string) => phrase`${name} isn't trusted on this computer yet.`,
  /** The fix under {@link notTrustedYet}. */
  reviewThenTrust: (dir?: string) =>
    phrase`Review what it can start, then trust it: ${suggestedCommand("trust", dir)}`,
});

/** "2 changed programs", "1 new program and 2 changed programs": the parts that aren't 0, new first. */
function changeList(changes: ProgramChanges): string {
  const parts = [
    changes.added > 0 ? counted(changes.added, "new program", "new programs") : undefined,
    changes.changed > 0
      ? counted(changes.changed, "changed program", "changed programs")
      : undefined,
  ].filter((part) => part !== undefined);
  return parts.join(" and ");
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): Phrase {
  const last = names.at(-1) ?? "";
  if (names.length < 2) {
    return phrase`${last}`;
  }
  return phrase`${names.slice(0, -1).join(", ")} and ${last}`;
}
