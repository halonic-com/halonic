/**
 * The words of the sandbox onboarding's choice screens: the final wording in HAL-3777 (`wording`), as its plan
 * places them. Reasons a backend can't run are short sentences written here from the engine's
 * codes; the code never reaches a person.
 */
import type { SandboxUnavailableReason } from "@halonicjs/ports";

export const TITLE = "Keep agents inside your project";
export const INTRO =
  "A sandbox lets agents work on your project and keeps the rest of your computer out of reach.";
export const OTHER_OPTIONS_INTRO =
  "Pick the one that fits this computer. You can change it later in Settings.";

export const SET_UP = "Set up";
export const OTHER_OPTIONS = "Other options";
export const MORE_INFO = "More info";
export const CONTINUE_WITHOUT = "Continue without sandbox";
export const setUpWith = (name: string) => `Set up ${name}`;

export const BADGE_RECOMMENDED = "Recommended";
export const BADGE_EXPERIMENTAL = "Experimental";
export const BADGE_NEEDS_DOCKER = "Needs Docker";
export const BADGE_FILES_LEAVE = "Files leave your computer";
export const BADGE_IN_USE = "In use";

export const NAME_SANDBOX = "Sandbox";
export const NAME_SANDBOX_WINDOWS = "Sandbox for Windows";
export const NAME_SANDBOX_WSL = "Sandbox in WSL";
export const NAME_MXC = "MXC";
export const NAME_DOCKER = "Docker Sandboxes";
export const NAME_CLOUD = "Cloud sandbox";

export const SANDBOX_SUBTITLE = "Limits files and network access.";
export const WSL_RECOMMENDED_SUBTITLE =
  "Limits files and network access. Runs in WSL, a Microsoft part of Windows that runs Linux next to it.";
export const WSL_SUBTITLE =
  "Stronger network limits. Needs admin rights, one restart and virtualisation. Files on your Windows drive are slower.";
export const WINDOWS_SUBTITLE = "Limits files, and network access only in part. Quick to set up.";
export const MXC_SUBTITLE = "Microsoft's sandbox. Needs Windows 11.";
export const DOCKER_SUBTITLE = "Runs agents in containers. Needs Docker installed.";
export const CLOUD_SUBTITLE = "Runs agents on a cloud service. Your project files are sent to it.";
export const CLOUD_WARNING =
  "Your project files are sent to a cloud service. Only choose this if you are fine with that.";
export const CLOUD_CONFIRMATION = "I understand my project files leave this computer.";

/** The three icon lines of a card: permission, restart, speed. */
export const PERMISSION_WINDOWS = "Windows asks for permission once";
export const PERMISSION_MACOS = "No permission prompt";
export const PERMISSION_LINUX = "You may need to run one command";
export const RESTART_NO = "No restart";
export const RESTART_YES = "One restart";
export const SPEED_NATIVE = "Files stay fast on your drive";
export const SPEED_WSL = "Files on your Windows drive are slower";

export const WINDOWS_NETWORK_CAVEAT = "network limits are weaker on Windows.";

export const STATE_FAILED = "Its safety test didn't pass, so it's off until Halonic starts again.";

const reasonSentences: Record<SandboxUnavailableReason, string> = {
  windows: "Not available on Windows.",
  container: "Not available when Halonic runs inside a container.",
  "not-supported": "This version of your operating system doesn't support it.",
  "blocked-by-policy": "Your organisation doesn't allow this.",
  "virtualisation-off": "Virtualisation is turned off on this computer.",
  "wsl-missing": "WSL isn't installed yet.",
  "restart-needed": "Windows needs to restart to finish setup.",
  "distro-missing": "The Linux part of this sandbox isn't installed yet.",
  "setup-conflict": "Another program has already set this up on this computer.",
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

/** The modal's own words: step label, back link, the checking and failed states. */
export const STEP_LABEL = "Step 2 of 3";
export const BACK = "Back";
export const WHAT_HAPPENS_LEAD = "What will happen on this computer:";
export const WHY = "Why?";
export const CHECKING = "Checking your computer…";
export const DETECTION_FAILED = "We couldn't check this computer.";
export const PICK_ONE = "Pick a sandbox first.";
export const OTHER_OPTIONS_TITLE = "Choose a sandbox";

/** The More info sections. The setup size and time are left out until they are measured (HAL-3777). */
export const MORE_WHAT_TITLE = "What a sandbox does";
export const MORE_WHAT =
  "Agents can read and change files in your project. They can't see the rest of your computer, and they can only reach websites you allow.";
export const MORE_COVERS_TITLE = "What this option covers";
export const MORE_COVERS_WINDOWS = [
  "Covers: files outside your project, your home folder, saved keys and passwords.",
  "Covers partly: network access. Some connections can't be limited on Windows.",
  "Doesn't cover: anything you approve yourself when an agent asks.",
];
export const MORE_COVERS = [
  "Covers: files outside your project, your home folder, saved keys and passwords.",
  "Covers: network access, to the websites you allow.",
  "Doesn't cover: anything you approve yourself when an agent asks.",
];
export const MORE_WSL_TITLE = "What is WSL?";
export const MORE_WSL =
  "WSL is a Microsoft component of Windows that runs Linux next to Windows. Halonic uses it to host a stronger sandbox. It is made by Microsoft and installs through Windows.";
export const MORE_OTHERS_TITLE = "Other options, one line each";
export const MORE_OTHERS_WINDOWS = [
  "Sandbox in WSL: stronger network limits, needs one restart.",
  "MXC: Microsoft's sandbox for Windows 11.",
  "Docker Sandboxes: runs agents in containers. Needs Docker.",
  "Cloud sandbox: runs agents on a cloud service. Your project files are sent there.",
];
export const MORE_OTHERS = [
  "Docker Sandboxes: runs agents in containers. Needs Docker.",
  "Cloud sandbox: runs agents on a cloud service. Your project files are sent there.",
];

/** S6: continue without a sandbox. */
export const CONFIRM_TITLE = "Continue without a sandbox?";
export const CONFIRM_BODY = [
  "Without a sandbox, agents run commands as you. That means an agent, or instructions hidden in a file or web page it reads, could look at things outside your project. For example, your SSH keys.",
  "A sandbox makes that a hard limit instead of a question. You can set one up any time in Settings.",
];
/** Shown between the two paragraphs of {@link CONFIRM_BODY} only once the harness really asks (O4). */
export const CONFIRM_ASKS =
  "Halonic still asks before an agent runs a command or touches files outside the project.";
export const SET_UP_A_SANDBOX = "Set up a sandbox";

/** S3: setting up, with the steps of each path (HAL-3777 wording). */
export const SETUP_TITLE = "Setting up your sandbox";
export const CANCEL = "Cancel";
export const STEP_DONE = "Done";
export const STEP_WORKING = "Working…";
export const STEP_WAITING = "Waiting";
export const STEP_STOPPED = "Stopped";
export const PERMISSION_NEXT_WINDOWS = "Windows will ask for permission next. This is expected.";
export const PERMISSION_NEXT_PASSWORD =
  "Your computer will ask for your password next. This is expected.";
export const OFFLINE = "We couldn't download what we need. Check your connection.";
export const TRY_AGAIN = "Try again";
export const STEPS_WSL = [
  "Check your computer",
  "Download WSL",
  "Install WSL",
  "Set up the sandbox",
  "Finish",
] as const;
export const STEPS_NATIVE = ["Check your computer", "Install the sandbox", "Finish"] as const;

/** S3b: restart needed. */
export const RESTART_TITLE = "Restart to finish";
export const RESTART_BODY =
  "WSL is installed. Windows has to restart to finish. Halonic reopens and continues where you left off.";
export const RESTART_NOW = "Restart now";
export const RESTART_LATER = "Restart later";

/** S3c: can't set up. One reason and one hint show, never the engine's code. */
export const CANT_TITLE = "We couldn't set this up";
export const CHOOSE_ANOTHER = "Choose another option";
export const CANT_REASONS = {
  "not-allowed": "Your Windows account isn't allowed to install it.",
  "virtualisation-off": "Virtualisation is turned off on this computer.",
  "blocked-by-policy": "Your organisation doesn't allow it.",
} as const;
export const CANT_HINTS = {
  "not-allowed": "Ask your IT admin to allow it.",
  "virtualisation-off": "Turn it on in your computer's BIOS settings.",
  "blocked-by-policy": "Ask your IT admin to allow it.",
} as const;
/** Not shown yet: it waits for the Show steps work (HAL-3777 leaves it out on purpose). */
export const SHOW_STEPS = "Show steps";

/** S3d: a tool is missing (macOS and Linux). */
export const CHECK_TITLE = "One thing is missing";
/** `tools` are the missing ones; with none named, the line says "A tool" so it never starts mid-sentence. */
export const checkBody = (tools: readonly string[]) =>
  `${tools.length === 0 ? "A tool" : tools.join(" and ")} is needed for the sandbox. Run this in a terminal, then check again.`;
export const UBUNTU_2404 =
  "Ubuntu 24.04 blocks the sandbox by default. This command allows it. It needs admin rights, so Halonic doesn't run it for you.";
export const CHECK_AGAIN = "Check again";
export const COPY_COMMAND = "Copy the command";
export const toolReady = (tool: string) => `${tool}: ready`;
export const toolMissing = (tool: string) => `${tool}: missing`;

/** S4: the quick test, and S4b when it didn't pass. */
export const TEST_TITLE = "Testing your sandbox";
export const TEST_INTRO = "This takes a few seconds.";
export const TEST_FAILED_TITLE = "The test didn't pass";
export const testFailedBody = (failedCheck: string) =>
  `${failedCheck}, so the sandbox isn't protecting you yet.`;
export const CHECK_PASSED = "passed";
export const CHECK_DIDNT_PASS = "didn't pass";
export const CHECK_PENDING = "waiting";

/** S5: done, with a sandbox and without. */
export const DONE_TITLE = "Sandbox is on";
export const doneBody = (name: string) => `${name} is active. Agents work inside your project.`;
/** The caveat is stored with a lower-case first letter (names like "WSL" stay as written), because it follows a lead here. */
export const doneCaveat = (caveat: string) => `Good to know: ${caveat}`;
/** A caveat on its own line, such as on a card: the stored one starts lower case. */
export const caveatSentence = (caveat: string) => caveat.charAt(0).toUpperCase() + caveat.slice(1);
export const DONE_FOOTER = "You can change this any time in Settings → Sandbox.";
export const NONE_TITLE = "You're all set";
export const NONE_BODY =
  "Agents will ask before running commands or touching files outside your project.";
export const NONE_FOOTER = "You can set up a sandbox any time in Settings → Sandbox.";
export const OPEN_HALONIC = "Open Halonic";
