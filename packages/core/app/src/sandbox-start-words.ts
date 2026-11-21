// WORDS MODULE: the one place Studio's sentences for "the sandbox can't start"
// live (sandbox-screens 3.1, microcopy 23.3). Every screen asks for them by
// reason code and reads a part by key, so no screen words a reason itself.
// The words are placeholders until HAL-1784 is approved; reviewers check the
// keys, not the sentences. Everything else in `app` hands out codes and lets
// the CLI or Studio word them; this module is the exception, because the Inbox,
// the run page and the run controls must read the same sentence.

import { type SandboxUnavailableReason, sandboxUnavailableReasons } from "@halonicjs/ports";

/**
 * A reason's words, as microcopy 23.3 names them. `key` is the reason's
 * catalogue key; a part's key is `${key}.${part}`.
 *
 * - `reason`: what is wrong, one sentence.
 * - `fix`: what to do, as a fragment that follows "Fix: ".
 * - `calloutFix`: the same fix as a sentence of its own, for a Callout that shows the reason first.
 * - `cantRunFix`: the fix for the can't-run Callout, which shows no reason before it, so it names
 *   the thing where the fix says "it" (microcopy 23.3, "Fix in the can't-run Callout").
 * - `phoneFix`: the fix for someone on a phone, who has to do it on the computer.
 * - `cantRunPhoneFix`: the can't-run Callout's fix for someone on a phone, so it names the thing too.
 * - `settingsFix`: the fix as Settings › Agent sandbox shows it, or `null` where the section's own
 *   set-up button is the fix (microcopy 23.3a).
 * - `command`: the command the fixes name, word for word as they write it, so a screen can show it
 *   as code; absent when the fix names none.
 * - `docsKey`: the docs page and section that explain it, relative to the docs address.
 * - `docsName`: the name of the link to them, which says where it goes (23.3's Docs link).
 */
export interface SandboxStartWords {
  readonly key: string;
  readonly reason: string;
  readonly fix: string;
  readonly calloutFix: string;
  readonly cantRunFix: string;
  readonly phoneFix: string;
  readonly cantRunPhoneFix: string;
  readonly settingsFix: string | null;
  readonly command?: string;
  readonly docsKey: string;
  readonly docsName: string;
}

/**
 * A reason's source words: the sentence, the fix fragment, the can't-run Callout's fix when the
 * fix alone says "it" (else the fix with a capital letter), the command the fix names, the docs
 * section and the link's name, when it has its own.
 */
type Words = Readonly<{
  reason: string;
  fix: string;
  cantRunFix?: string;
  command?: string;
  docsSection?: string;
  docsName?: string;
}>;

/** The link's name for a reason whose docs have no guide of its own. */
const generalDocsName = "What the sandbox needs";

/** Where Studio sends the fixes the CLI words as "use Halonic inside WSL 2" (0.1 has no Studio on Windows, HAL-7540). */
const inSettings = "open Settings and set up the sandbox there.";

const words: Readonly<Record<SandboxUnavailableReason, Words>> = {
  windows: {
    // Only MXC gives this code, on a machine that isn't Windows 11 or lacks its container tier.
    reason: "The sandbox can't start on this version of Windows.",
    fix: "pick another sandbox in Settings.",
    docsSection: "windows-preview",
  },
  container: {
    reason: "Halonic is running inside a container, and the sandbox can't start there.",
    fix: "run Halonic on the computer itself, not in a container.",
    docsSection: "container",
    docsName: "Why the sandbox needs a real computer",
  },
  "not-supported": {
    reason: "This distro runs on WSL 1, and the sandbox needs WSL 2.",
    fix: "switch it to WSL 2 with wsl --set-version <distro> 2 in PowerShell on Windows.",
    cantRunFix:
      "Switch the distro to WSL 2 with wsl --set-version <distro> 2 in PowerShell on Windows.",
    command: "wsl --set-version <distro> 2",
    docsSection: "wsl1",
    docsName: "How to switch to WSL 2",
  },
  "blocked-by-policy": {
    reason: "A company policy on this computer blocks the sandbox.",
    fix: "ask whoever manages this computer to allow it.",
    cantRunFix: "Ask whoever manages this computer to allow the sandbox.",
  },
  "virtualisation-off": {
    reason: "Hardware virtualisation is turned off on this computer.",
    fix: "turn it on in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation.",
    cantRunFix:
      "Turn on hardware virtualisation in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation.",
  },
  "wsl-missing": {
    reason: "WSL isn't installed, and the sandbox needs it.",
    fix: "install it with wsl --install --no-distribution in a terminal run as administrator, then restart Windows.",
    cantRunFix:
      "Install WSL with wsl --install --no-distribution in a terminal run as administrator, then restart Windows.",
    command: "wsl --install --no-distribution",
  },
  "restart-needed": {
    reason: "Windows needs to restart to finish setting up WSL.",
    fix: "restart Windows.",
  },
  "distro-missing": {
    reason: "WSL works, but Halonic's own Linux system for the sandbox isn't installed.",
    fix: inSettings,
  },
  "setup-conflict": {
    reason: "Another program set up the sandbox on this computer, in a way Halonic can't use.",
    fix: inSettings,
  },
  "setup-needed": {
    reason: "The sandbox's one-time setup isn't done for this version of Halonic.",
    fix: inSettings,
  },
  "user-namespaces-restricted": {
    reason: "Ubuntu 24.04 blocks the user namespaces the sandbox needs.",
    fix: "allow them for bubblewrap with an AppArmor rule. The guide has the exact commands.",
    cantRunFix:
      "Allow user namespaces for bubblewrap with an AppArmor rule. The guide has the exact commands.",
    docsSection: "user-namespaces",
    docsName: "How to allow it on Ubuntu 24.04",
  },
  "bubblewrap-missing": {
    reason: "bubblewrap isn't installed, and the sandbox needs it.",
    fix: "install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
    cantRunFix:
      "Install bubblewrap, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
    command: "sudo apt install bubblewrap",
    docsSection: "bubblewrap",
    docsName: "How to install bubblewrap",
  },
  "linux-tools-missing": {
    reason: "socat or ripgrep isn't installed, and the sandbox needs both.",
    fix: "install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep.",
    cantRunFix:
      "Install socat and ripgrep, for example on Ubuntu or Debian with sudo apt install socat ripgrep.",
    command: "sudo apt install socat ripgrep",
    docsSection: "linux-tools",
    docsName: "How to install the sandbox's tools",
  },
  "ripgrep-missing": {
    reason: "ripgrep isn't installed, and the sandbox needs it.",
    fix: "install it, for example on macOS with brew install ripgrep.",
    cantRunFix: "Install ripgrep, for example on macOS with brew install ripgrep.",
    command: "brew install ripgrep",
  },
  "sign-in-needed": {
    reason: "The sandbox needs you to sign in to its service first.",
    fix: "sign in to the sandbox's service.",
  },
  "not-offered": {
    reason: "Halonic can't run Claude Code or Codex agents outside the sandbox yet.",
    // Any byte counts: the choice holds only for the file as it was (`app.agent-placement`).
    fix: "save any change to this agent's file, even one added space. A changed file undoes the choice to run the agent outside the sandbox.",
  },
  other: {
    reason: "Halonic can't tell what the sandbox is missing.",
    fix: "see what the sandbox needs on this computer.",
    docsSection: "other",
  },
};

/**
 * Whether `code` is a reason Halonic has words for. A code from a newer
 * version, or any other text, isn't.
 *
 * @example
 * isSandboxStartReason("bubblewrap-missing"); // true
 * isSandboxStartReason("from-the-future"); // false
 */
export function isSandboxStartReason(code: string): code is SandboxUnavailableReason {
  return (sandboxUnavailableReasons as readonly string[]).includes(code);
}

/** The first letter as a capital, so a fix that follows "Fix: " can stand alone. */
function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** The first letter in lower case, so a sentence can follow "On the computer Halonic runs on: ". */
function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** What a fix for someone on a phone starts with: they have to do it on the computer. */
const onTheComputer = "On the computer Halonic runs on: ";

/**
 * The words for a sandbox that can't start, by reason code (requirement
 * `app.sandbox-start-words`). A code Halonic doesn't know reads as `other`,
 * and the check's own sentence is never part of them (HAL-2089).
 *
 * @example
 * sandboxStartWords("bubblewrap-missing").calloutFix;
 * // "Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap."
 * sandboxStartWords("bubblewrap-missing").cantRunFix;
 * // "Install bubblewrap, for example on Ubuntu or Debian with sudo apt install bubblewrap."
 * sandboxStartWords("from-the-future").key; // "sandbox-start.other"
 */
export function sandboxStartWords(code: string): SandboxStartWords {
  const reason = isSandboxStartReason(code) ? code : "other";
  const { reason: sentence, fix, cantRunFix, command, docsSection, docsName } = words[reason];
  const ownFix = cantRunFix ?? capitalised(fix);
  return {
    key: `sandbox-start.${reason}`,
    reason: sentence,
    fix,
    calloutFix: capitalised(fix),
    cantRunFix: ownFix,
    phoneFix: `${onTheComputer}${fix}`,
    cantRunPhoneFix: `${onTheComputer}${lowerFirst(ownFix)}`,
    settingsFix: fix === inSettings ? null : capitalised(fix),
    ...(command === undefined ? {} : { command }),
    docsKey: docsSection === undefined ? "security/sandbox/" : `security/sandbox/#${docsSection}`,
    docsName: docsName ?? generalDocsName,
  };
}
