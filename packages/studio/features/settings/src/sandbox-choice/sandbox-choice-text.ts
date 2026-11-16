/**
 * The words of the sandbox onboarding's choice screens: HAL-3778 (wording) as HAL-3777 (plan)
 * places them. Reasons a backend can't run are short sentences written here from the engine's
 * codes; the code never reaches a person.
 */
import type { SandboxUnavailableReason } from "@halonicjs/ports";

export const TITLE = "Keep agents inside your project";
export const INTRO =
  "A sandbox is a fenced area. Agents can work freely inside your project, but they can't reach the rest of your computer.";
export const OTHER_OPTIONS_INTRO =
  "Prefer something else? Pick one. You can change this later in Settings.";

export const SET_UP = "Set up";
export const OTHER_OPTIONS = "Other options";
export const MORE_INFO = "More info";
export const CONTINUE_WITHOUT = "Continue without a sandbox";
export const setUpWith = (name: string) => `Set up ${name}`;

export const BADGE_RECOMMENDED = "Recommended";
export const BADGE_EXPERIMENTAL = "Experimental";
export const BADGE_NEEDS_DOCKER = "Needs Docker";
export const BADGE_FILES_LEAVE = "Files leave your machine";
export const BADGE_IN_USE = "In use";

export const NAME_SRT = "Sandbox on this computer";
export const NAME_SRT_WSL = "srt inside WSL";
export const NAME_MXC = "MXC";
export const NAME_DOCKER = "Docker Sandboxes";
export const NAME_CLOUD = "Cloud sandbox";

export const SRT_SUBTITLE = "Uses srt, a small sandbox tool we install for you.";
export const SRT_WSL_RECOMMENDED_SUBTITLE =
  "Uses srt inside WSL, a small Linux system next to Windows.";
export const SRT_WSL_SUBTITLE =
  "The strongest protection on Windows. Runs the sandbox in a small Linux system next to Windows.";
export const SRT_WINDOWS_SUBTITLE =
  "Runs srt directly on Windows. Network protection is weaker than with WSL.";
export const MXC_SUBTITLE = "Windows' own app isolation.";
export const DOCKER_SUBTITLE = "Runs agents in containers. Needs Docker on this computer.";
export const CLOUD_SUBTITLE = "Runs agents on a server instead of this computer.";
export const CLOUD_WARNING =
  "Your project files are uploaded to the provider. Off by default. Only pick this if you're comfortable with that.";

export const WHAT_HAPPENS_WINDOWS =
  "Windows will ask for administrator permission once. No restart needed.";
export const WHAT_HAPPENS_MACOS = "Nothing to install. We'll check that it works.";
export const WHAT_HAPPENS_LINUX = "We'll check that everything it needs is installed.";
export const WHAT_HAPPENS_WSL =
  "Needs administrator permission, a restart, and hardware virtualisation turned on. Files on your Windows drive open more slowly from inside WSL.";

export const WINDOWS_NETWORK_CAVEAT =
  "On Windows, the protection for network traffic is weaker than for files. Files and folders outside your project stay protected.";

export const STATE_FAILED = "Its safety test didn't pass, so it's off until Halonic starts again.";

const reasonSentences: Record<SandboxUnavailableReason, string> = {
  windows: "It doesn't run on Windows.",
  container: "Halonic is running inside a container.",
  "not-supported": "This version of the operating system can't run it.",
  "blocked-by-policy": "A policy on this computer blocks it.",
  "virtualisation-off": "Hardware virtualisation is turned off on this computer.",
  "wsl-missing": "WSL isn't installed yet.",
  "restart-needed": "Windows needs to restart first.",
  "distro-missing": "Its small Linux system isn't installed yet.",
  "setup-conflict": "Another program already set this up on this computer.",
  "setup-needed": "It needs a one-time setup.",
  "user-namespaces-restricted": "This system blocks sandboxes by default.",
  "bubblewrap-missing": "bubblewrap isn't installed.",
  "linux-tools-missing": "A tool it needs (socat or ripgrep) isn't installed.",
  "ripgrep-missing": "ripgrep isn't installed.",
  "sign-in-needed": "It needs you to sign in first.",
  other: "It can't run on this computer.",
};

/** The sentence for a reason a backend can't run here. */
export const unavailable = (reason: SandboxUnavailableReason): string => reasonSentences[reason];
