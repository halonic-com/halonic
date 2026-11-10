import type { SandboxUnavailableReason } from "@halonicjs/ports";
import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * Line 2 of a run refused because the sandbox can't start, by reason code
 * (cli-output 3.8). They are sandbox-screens 3.1's reason and fix as one
 * line, except `container`, whose fix says where `run` works instead, since
 * the command line is where containers come up (CI). `other`, and a code
 * Halonic doesn't know, is worded from the code alone: the check's own
 * sentence is for logs and shows only with `--debug`.
 */
const refusedFixes: Readonly<Record<SandboxUnavailableReason, string>> = {
  windows:
    "The sandbox doesn't work on Windows in this version of Halonic. Use Halonic inside WSL 2 on this computer.",
  container:
    "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the runner or computer itself, not in a container. halonic validate and halonic test work in a container.",
  "user-namespaces-restricted":
    "Ubuntu 24.04 blocks the user namespaces the sandbox needs. Allow them for bubblewrap with an AppArmor rule; the guide has the exact commands.",
  "bubblewrap-missing":
    "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
  other:
    "Halonic can't tell what the sandbox is missing. See what the sandbox needs on this computer, then run it again.",
};

/** sandbox-screens 3.1's reason, by code: what's wrong, for `halonic doctor`'s Sandbox line. */
const reasons: Readonly<Record<SandboxUnavailableReason, string>> = {
  windows: "The sandbox doesn't work on Windows in this version of Halonic.",
  container: "Halonic is running inside a container, and the sandbox can't start there.",
  "user-namespaces-restricted": "Ubuntu 24.04 blocks the user namespaces the sandbox needs.",
  "bubblewrap-missing": "bubblewrap isn't installed, and the sandbox needs it.",
  other: "Halonic can't tell what the sandbox is missing.",
};

/**
 * sandbox-screens 3.1's fix, by code, with a small first letter so it can
 * follow "Fix: ". `container` takes 3.8's fix instead, because `doctor` runs
 * in CI too (cli-output 3.7, revision 24).
 */
const fixes: Readonly<Record<SandboxUnavailableReason, string>> = {
  windows: "use Halonic inside WSL 2 on this computer.",
  container: "run Halonic on the runner or computer itself, not in a container.",
  "user-namespaces-restricted":
    "allow them for bubblewrap with an AppArmor rule. The guide has the exact commands.",
  "bubblewrap-missing":
    "install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
  other: "see what the sandbox needs on this computer.",
};

/**
 * The sentences for a sandbox that can't start (cli-output 1.3, 3.7 and 3.8,
 * sandbox-screens 3.1 and 3.4). `run` and `runs send` check the sandbox
 * before they start anything; `validate` and `test` never do. A code the
 * `Sandbox` port adds later reads as `other` until it gets its own words.
 */
export const sandboxMessages = defineMessages("sandbox", {
  /** The reason on line 1, after "Couldn't run support-reply:"; `run` adds "Nothing ran.". */
  cantStart: () => phrase`the sandbox can't start on this computer.`,
  /** The end of `runs send`'s line 1: the answer wasn't sent, so the run is still waiting. */
  nothingSent: () => phrase`Nothing was sent.`,
  /** Line 2 of a refused `run` or `runs send`. */
  refusedFix: (code: string) => phrase`${refusedFixes[known(code)]}`,
  /** Line 2 of a sandbox error with more than one problem, so no single fix. */
  seeDoctor: () => phrase`Run halonic doctor to see what's missing.`,

  /** `halonic doctor`'s line under "can't start on this computer": what's wrong. */
  reason: (code: string) => phrase`${reasons[known(code)]}`,
  /** `halonic doctor`'s fix under the reason, with "Then run halonic doctor again." after it. */
  doctorFix: (code: string) => doctorFix(fixes[known(code)], afterDoctorAgain[known(code)]),
});

/** A code from the port, or `other` for one this version doesn't know. */
function known(code: string): SandboxUnavailableReason {
  return Object.hasOwn(reasons, code) ? (code as SandboxUnavailableReason) : "other";
}

/**
 * A note that ends `doctor`'s fix, after "Then run halonic doctor again.",
 * because it says what works where the sandbox doesn't, not what to do.
 */
const afterDoctorAgain: Readonly<Partial<Record<SandboxUnavailableReason, string>>> = {
  container: "halonic validate and halonic test work in a container.",
};

/** "Fix: install it, for example on Ubuntu or Debian with sudo apt install bubblewrap. Then run halonic doctor again." */
function doctorFix(fix: string, note?: string): Phrase {
  return note === undefined
    ? phrase`Fix: ${fix} Then run halonic doctor again.`
    : phrase`Fix: ${fix} Then run halonic doctor again. ${note}`;
}
