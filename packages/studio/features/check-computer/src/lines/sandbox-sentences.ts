import { type SandboxLine, sandboxStartWords } from "@halonicjs/app";
import { fix, found, type LineSentence } from "./check-line.ts";

/**
 * The Sandbox line in Studio's own sandbox words (`app.sandbox-start-words`), as the run page and
 * the Inbox say a sandbox that can't start: the reason and its fix, never the check's own
 * `missing` sentences. A ready sandbox reads "Ready · Seatbelt", the kind `halonic doctor` names,
 * or "Ready" when Studio can't tell which kind the agent host runs.
 */
export function sandboxSentences(line: SandboxLine, kind: string | undefined): LineSentence[] {
  if (line.status === "ok") return [found(kind === undefined ? "Ready" : `Ready · ${kind}`)];
  const words = sandboxStartWords(line.reason);
  return [found(words.reason), fix(`Fix: ${words.fix}`)];
}
