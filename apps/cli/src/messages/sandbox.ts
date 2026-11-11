import type { SandboxUnavailableReason } from "@halonicjs/ports";
import { defineMessages } from "./define.ts";
import { docsBase } from "./docs.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * The reason codes the CLI has words for: every code of the `Sandbox` port,
 * and `windows-node-in-wsl`, which is the CLI's own, not the port's: the
 * sandbox check refuses Windows' Node.js in a WSL folder with it (HAL-6517),
 * because the fix is Node.js inside WSL, whatever the Windows sandbox says.
 */
type WordedReason = SandboxUnavailableReason | typeof windowsNodeInWsl;

/** The CLI's own reason code for Windows' Node.js running in a WSL folder. */
export const windowsNodeInWsl = "windows-node-in-wsl";

/**
 * Line 2 of a run refused because the sandbox can't start, by reason code
 * (cli-output 3.8). They are sandbox-screens 3.1's reason and fix as one
 * line, except `container`, whose fix says where `run` works instead, since
 * the command line is where containers come up (CI). `other`, and a code
 * Halonic doesn't know, is worded from the code alone: the check's own
 * sentence is for logs and shows only with `--debug`. The codes port
 * version 6 added take the onboarding wording's reasons where it has them
 * (HAL-3778 section 4) and the team's words where it doesn't (HAL-5900).
 */
const refusedFixes: Readonly<Record<WordedReason, string>> = {
  windows:
    "The sandbox doesn't work on Windows in this version of Halonic. Use Halonic inside WSL 2 on this computer.",
  [windowsNodeInWsl]:
    "This is Windows' Node.js, running in a WSL folder, and the sandbox can't start with it. Install Node.js inside WSL and run halonic from a WSL terminal.",
  container:
    "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the computer itself, not in a container. halonic validate and halonic test work in a container.",
  "not-supported":
    "This version or edition of the operating system can't run the sandbox. Update it, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
  "blocked-by-policy":
    "A company policy on this computer blocks the sandbox. Ask whoever manages this computer to allow it, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
  "virtualisation-off":
    "Hardware virtualisation is turned off on this computer. Turn it on in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation. Then run it again.",
  "wsl-missing":
    "WSL isn't installed, and the sandbox needs it. Install it with wsl --install --no-distribution in a terminal run as administrator, restart Windows, then run it again.",
  "restart-needed":
    "Windows needs to restart to finish setting up WSL. Restart Windows, then run it again.",
  "distro-missing":
    "WSL works, but Halonic's own Linux system for the sandbox isn't installed. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, then run it again.",
  "setup-conflict":
    "Another program set up the sandbox on this computer, in a way Halonic can't use. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, then run it again.",
  "setup-needed":
    "The sandbox's one-time setup isn't done for this version of Halonic. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, or finish this sandbox's setup there, then run it again.",
  "user-namespaces-restricted":
    "Ubuntu 24.04 blocks the user namespaces the sandbox needs. Allow them for bubblewrap with an AppArmor rule; the guide has the exact commands.",
  "bubblewrap-missing":
    "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
  "linux-tools-missing":
    "socat or ripgrep isn't installed. Install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep, then run it again.",
  "ripgrep-missing":
    "ripgrep isn't installed. Install it, for example on macOS with brew install ripgrep, then run it again.",
  "sign-in-needed":
    "The sandbox needs you to sign in to its service first. Sign in, for example with docker login for Docker Sandboxes, then run it again.",
  other:
    "Halonic can't tell what the sandbox is missing. See what the sandbox needs on this computer, then run it again.",
};

/** sandbox-screens 3.1's reason, by code: what's wrong, for `halonic doctor`'s Sandbox line. */
const reasons: Readonly<Record<WordedReason, string>> = {
  windows: "The sandbox doesn't work on Windows in this version of Halonic.",
  [windowsNodeInWsl]: "Windows' Node.js can't start the sandbox in a WSL folder.",
  container: "Halonic is running inside a container, and the sandbox can't start there.",
  "not-supported": "This version or edition of the operating system can't run the sandbox.",
  "blocked-by-policy": "A company policy on this computer blocks the sandbox.",
  "virtualisation-off": "Hardware virtualisation is turned off on this computer.",
  "wsl-missing": "WSL isn't installed, and the sandbox needs it.",
  "restart-needed": "Windows needs to restart to finish setting up WSL.",
  "distro-missing": "WSL works, but Halonic's own Linux system for the sandbox isn't installed.",
  "setup-conflict":
    "Another program set up the sandbox on this computer, in a way Halonic can't use.",
  "setup-needed": "The sandbox's one-time setup isn't done for this version of Halonic.",
  "user-namespaces-restricted": "Ubuntu 24.04 blocks the user namespaces the sandbox needs.",
  "bubblewrap-missing": "bubblewrap isn't installed, and the sandbox needs it.",
  "linux-tools-missing": "socat or ripgrep isn't installed, and the sandbox needs both.",
  "ripgrep-missing": "ripgrep isn't installed, and the sandbox needs it.",
  "sign-in-needed": "The sandbox needs you to sign in to its service first.",
  other: "Halonic can't tell what the sandbox is missing.",
};

/**
 * sandbox-screens 3.1's fix, by code, with a small first letter so it can
 * follow "Fix: ". `container` takes 3.8's fix instead, because `doctor` runs
 * in CI too (cli-output 3.7, revision 24).
 */
const fixes: Readonly<Record<WordedReason, string>> = {
  windows: "use Halonic inside WSL 2 on this computer.",
  [windowsNodeInWsl]: "install Node.js inside WSL and open a WSL terminal.",
  container: "run Halonic on the computer itself, not in a container.",
  "not-supported":
    "update the operating system, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
  "blocked-by-policy":
    "ask whoever manages this computer to allow it, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
  "virtualisation-off":
    "turn it on in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation.",
  "wsl-missing":
    "install it with wsl --install --no-distribution in a terminal run as administrator, then restart Windows.",
  "restart-needed": "restart Windows.",
  "distro-missing": "set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox.",
  "setup-conflict": "set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox.",
  "setup-needed":
    "set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, or finish this sandbox's setup there.",
  "user-namespaces-restricted":
    "allow them for bubblewrap with an AppArmor rule. The guide has the exact commands.",
  "bubblewrap-missing":
    "install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
  "linux-tools-missing":
    "install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep.",
  "ripgrep-missing": "install it, for example on macOS with brew install ripgrep.",
  "sign-in-needed": "sign in, for example with docker login for Docker Sandboxes.",
  other: "see what the sandbox needs on this computer.",
};

/**
 * The sentences for a sandbox that can't start (cli-output 1.3, 3.7 and 3.8,
 * sandbox-screens 3.1 and 3.4). `run` and `runs send` check the sandbox
 * before they start anything; `validate` and `test` never do. A code this
 * version doesn't know, from a newer log, reads as `other`.
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

/** A code the CLI has words for, or `other` for one it doesn't. */
function known(code: string): WordedReason {
  return Object.hasOwn(reasons, code) ? (code as WordedReason) : "other";
}

/**
 * A note that ends `doctor`'s fix, after "Then run halonic doctor again.",
 * because it says what works where the sandbox doesn't, not what to do.
 */
const afterDoctorAgain: Readonly<Partial<Record<WordedReason, string>>> = {
  container: "halonic validate and halonic test work in a container.",
};

/** "Fix: install it, for example on Ubuntu or Debian with sudo apt install bubblewrap. Then run halonic doctor again." */
function doctorFix(fix: string, note?: string): Phrase {
  return note === undefined
    ? phrase`Fix: ${fix} Then run halonic doctor again.`
    : phrase`Fix: ${fix} Then run halonic doctor again. ${note}`;
}

/** The sandbox page of the docs, which `More:` links under a sandbox that can't start. */
const sandboxDocs = `${docsBase}/sandbox`;

/**
 * The section of {@link sandboxDocs} for each reason that cli-output names
 * one for. The other reasons link the page itself, rather than a section
 * that may not exist.
 */
const docsSections: Readonly<Partial<Record<WordedReason, string>>> = {
  "bubblewrap-missing": "bubblewrap",
  container: "container",
  "user-namespaces-restricted": "apparmor",
};

/**
 * The docs link for `More:` under a sandbox that can't start.
 *
 * @example
 * sandboxDocsLink("bubblewrap-missing"); // "https://docs.halonic.dev/sandbox#bubblewrap"
 * sandboxDocsLink("windows"); // "https://docs.halonic.dev/sandbox"
 */
export function sandboxDocsLink(code: string): string {
  const section = docsSections[known(code)];
  return section === undefined ? sandboxDocs : `${sandboxDocs}#${section}`;
}

/** The section of {@link sandboxDocs} on a workspace on a Windows drive under WSL, for `More:` under doctor's Workspace line (HAL-6552). */
export const wsl2FolderDocs = `${sandboxDocs}#wsl2-folder`;
