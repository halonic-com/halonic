// WORDS MODULE: the one place the reason, fix and docs link for "plugin and
// integration code runs without the sandbox" live (the "Runs" line design 2
// and 11, HAL-1873; microcopy 24.1 R3, approved on HAL-1949). The plugin trust
// check, the workspace trust check and the pages that ask for the yes read the
// same sentences by reason code, so a new reason, or the Windows 11 rows held
// back on HAL-3381, is added here and nowhere else.

import { type RunnerUnfencedReason, runnerUnfencedReasons } from "./runner-fence.ts";
import { sandboxStartWords } from "./sandbox-start-words.ts";

/** Whose code runs without the sandbox: R3's *what*. */
export type UnfencedCode = "plugin" | "integration";

/**
 * A reason's words for plugin and integration code.
 *
 * - `key`: the catalogue key, `runner-unfenced.<reason>`.
 * - `reason`: what is wrong, one sentence.
 * - `fix`: what to do, one sentence.
 * - `docsKey`: the docs page and section, relative to the docs address.
 * - `docsLabel`: the docs link's name, which says where it goes (microcopy 23.3's Docs link).
 */
export interface RunnerUnfencedWords {
  readonly key: string;
  readonly reason: string;
  readonly fix: string;
  readonly docsKey: string;
  readonly docsLabel: string;
}

const whatTheSandboxNeeds = "What the sandbox needs";

/** 23.3's and 23.3a's Docs link, per reason; every other reason links to what the sandbox needs. */
const docsLabels: Readonly<Partial<Record<RunnerUnfencedReason, string>>> = {
  windows: "How to run Halonic in WSL 2",
  container: "Why the sandbox needs a real computer",
  "not-supported": "How to switch to WSL 2",
  "user-namespaces-restricted": "How to allow it on Ubuntu 24.04",
  "bubblewrap-missing": "How to install bubblewrap",
  "linux-tools-missing": "How to install the sandbox's tools",
};

/**
 * Whether `code` is a reason plugin and integration code runs without the
 * sandbox. A code from a newer version, or any other text, isn't.
 */
export function isRunnerUnfencedReason(code: string): code is RunnerUnfencedReason {
  return (runnerUnfencedReasons as readonly string[]).includes(code);
}

/**
 * The words for plugin or integration code that runs without the sandbox, by
 * reason (requirement `app.runner-unfenced-words`). `windows` has its own
 * reason, R3, because the agent sandbox may work on Windows while this code
 * still can't run in it; its fix is WSL 2, on Windows 11 too (HAL-3381).
 * `no-sandbox` names the person's own choice in S6's words and the Set up a
 * sandbox button (HAL-12350), and its docs link goes to the page's section on
 * running without a sandbox (HAL-12359). Every other
 * reason uses 23.3's reason, fix and docs link word for word. A code Halonic
 * doesn't know reads as `other`.
 *
 * @example
 * runnerUnfencedWords("windows", "integration").reason;
 * // "On Windows, integration code can't run in the sandbox in this version of Halonic."
 * runnerUnfencedWords("container", "plugin").fix;
 * // "Run Halonic on the computer itself, not in a container."
 */
export function runnerUnfencedWords(code: string, what: UnfencedCode): RunnerUnfencedWords {
  const reason = isRunnerUnfencedReason(code) ? code : "other";
  const key = `runner-unfenced.${reason}`;
  if (reason === "windows") {
    return {
      key,
      reason: `On Windows, ${what} code can't run in the sandbox in this version of Halonic.`,
      fix: "Use Halonic inside WSL 2 on this computer.",
      docsKey: "security/sandbox/#windows-preview",
      docsLabel: "How to run Halonic in WSL 2",
    };
  }
  if (reason === "no-sandbox") {
    return {
      key,
      reason: "You chose to continue without a sandbox on this computer.",
      fix: "Set up a sandbox in Settings › Agent sandbox.",
      docsKey: "security/sandbox/#no-sandbox",
      docsLabel: "What changes without a sandbox",
    };
  }
  const words = sandboxStartWords(reason);
  return {
    key,
    reason: words.reason,
    fix: words.calloutFix,
    docsKey: words.docsKey,
    docsLabel: docsLabels[reason] ?? whatTheSandboxNeeds,
  };
}
