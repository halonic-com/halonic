import { sandboxStartWords } from "@halonicjs/app";
import type { SandboxFact, SandboxKind } from "../check-facts.ts";
import { fix, found, type LineSentence } from "./check-line.ts";

/** Each kind's name after "Ready ·", as `halonic doctor` prints it (`sandboxKindName`). */
const kindNames: Readonly<Record<SandboxKind, string>> = {
  seatbelt: "Seatbelt",
  bubblewrap: "bubblewrap",
  // The name Settings › Agent sandbox gives srt's Windows mode, so a person meets one name.
  windows: "Sandbox for Windows",
};

/**
 * The Sandbox line in Studio's own sandbox words (`app.sandbox-start-words`), as the run page and
 * the Inbox say a sandbox that can't start: the reason and its fix, never the check's own
 * `missing` sentences. A ready sandbox reads "Ready · " and the kind the agent host names, as
 * `halonic doctor` prints it ("Ready · Seatbelt"), or "Ready" when the host names none.
 */
export function sandboxSentences(line: SandboxFact): LineSentence[] {
  if (line.status === "ok") {
    const kind = line.sandboxKind;
    return [found(kind === undefined ? "Ready" : `Ready · ${kindNames[kind]}`)];
  }
  const words = sandboxStartWords(line.reason);
  return [found(words.reason), fix(`Fix: ${words.fix}`)];
}
