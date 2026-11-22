import { type SandboxLine, sandboxStartWords } from "@halonicjs/app";
import { fix, found, type LineSentence } from "./check-line.ts";

/** How strong the fence is, after "Ready ·": the host answers what the sandbox can do, not its name. */
const strengthWords = {
  os: "Fenced by the system",
  vm: "In a virtual machine",
  remote: "On another computer",
  none: "No fence",
} as const;

/**
 * The Sandbox line in Studio's own sandbox words (`app.sandbox-start-words`), as the run page and
 * the Inbox say a sandbox that can't start: the reason and its fix, never the check's own
 * `missing` sentences.
 */
export function sandboxSentences(line: SandboxLine): LineSentence[] {
  if (line.status === "ok") return [found(`Ready · ${strengthWords[line.capabilities.strength]}`)];
  const words = sandboxStartWords(line.reason);
  return [found(words.reason), fix(`Fix: ${words.fix}`)];
}
