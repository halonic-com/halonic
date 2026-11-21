import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** "trust instructions coder", the words after `halonic` in every command these sentences suggest. */
function trustWords(agent: string): string {
  return `trust instructions ${agent}`;
}

/**
 * The sentences of `halonic trust instructions <agent>` (HAL-13062, the
 * board's C on HAL-10522), in the shape of `halonic trust`'s own: the files
 * and the full fingerprint, the question, and the refusals with the command
 * that answers them. `agent` is shown as the person typed it; `dir` is their
 * own `--dir`, so a suggested command works where they typed it.
 */
export const trustInstructionsMessages = defineMessages("trustInstructions", {
  summary: () => phrase`Review an agent's instructions, and trust them on this computer`,
  /** For "✕ Couldn't trust coder's instructions: …". */
  action: (agent?: string) =>
    agent === undefined ? phrase`trust the instructions` : phrase`trust ${agent}'s instructions`,

  heading: (agent: string) => phrase`Instructions of ${agent}`,
  /** Above the list, when the agent never had instructions trusted on this computer. */
  firstTime: (agent: string) =>
    phrase`Before ${agent} runs in a harness on this computer, check what its instructions tell it to do.`,
  /** Above the list instead, when the trusted instructions changed. */
  changedSince: () => phrase`These changed since you trusted them on this computer.`,
  /** Above the list instead, when what was trusted can't be read: it never counts as trust. */
  unreadable: () => phrase`Halonic couldn't read what was trusted before, so it's asking again.`,
  /** The tags in front of a file, as `halonic trust` tags its rows. */
  newFile: () => phrase`New`,
  changedFile: () => phrase`Changed`,
  removedFile: () => phrase`Removed`,

  question: (agent: string) => phrase`Trust ${agent}'s instructions on this computer?`,
  trusted: (agent: string) => phrase`${agent}'s instructions are trusted. It can run now.`,
  alreadyTrusted: (agent: string) =>
    phrase`${agent}'s instructions are already trusted on this computer. Nothing changed.`,
  /** Answer No, or Enter: exit 3. */
  notTrusted: () => phrase`Not trusted. Nothing was saved.`,
  /** An agent with no instructions and no skills: a run of it has nothing to check. */
  noInstructions: (agent: string) =>
    phrase`${agent} has no instructions or skills, so there's nothing to trust.`,

  yesNeedsFingerprint: () =>
    phrase`--yes needs --fingerprint, so you trust exactly the instructions you reviewed.`,
  yesNeedsFingerprintFix: (agent: string, dir?: string) =>
    phrase`Run ${suggestedCommand(trustWords(agent), dir)} to see it; the fingerprint is above the question.`,
  fingerprintNotCurrent: (agent: string) =>
    phrase`That fingerprint doesn't match ${agent}'s instructions as they are now.`,
  fingerprintNotCurrentFix: (agent: string, dir?: string) =>
    phrase`Run ${suggestedCommand(trustWords(agent), dir)} again to review them as they are now.`,
  noTerminal: (agent: string) =>
    phrase`${agent}'s instructions aren't trusted on this computer yet, and there's no terminal to ask you.`,
  noTerminalFix: (agent: string, fingerprint: string, dir?: string) =>
    phrase`Read the list above, then run: ${suggestedCommand(trustWords(agent), dir, `--yes --fingerprint ${fingerprint}`)}`,

  /** `<agent>` missing, or more than one word. */
  oneAgent: () => phrase`Name one agent, such as halonic trust instructions coder.`,
  unknownAgent: (agent: string) => phrase`There's no agent ${agent} in this workspace.`,
  unknownAgentFix: () =>
    phrase`Use the id in the agent's file name, such as coder for coder.agent.yaml.`,
  /** The same id in more than one hub: the person picks one, as `<hub>/<agent>`. */
  sameIdInHubs: (agent: string, choices: string) =>
    phrase`More than one hub has an agent ${agent}: ${choices}.`,
  sameIdInHubsFix: () => phrase`Name its hub too, such as support/coder.`,
});
