import { buildChatWords } from "@halonicjs/studio-feature-assistant/words";
import * as connections from "@halonicjs/studio-feature-connections/words";
import { messengerWords } from "@halonicjs/studio-feature-messenger/words";
import { welcomeStartWords } from "@halonicjs/studio-shell/welcome-words";

/**
 * The words the steps look for, from the features' own words files, so a
 * copy change moves the click test with it instead of failing it unnoticed.
 */
export const words = {
  engineNotStarted: buildChatWords.engineNotStarted,
  engineNotAnswering: buildChatWords.engineNotAnswering,
  chatHeading: buildChatWords.heading,
  engineFailed: welcomeStartWords.failedTitle,
  messengerEmpty: messengerWords.noConnections,
  connectionsSection: connections.SECTION_TITLE,
  listFailed: connections.LIST_FAILED,
  connect: connections.CONNECT,
  addressPlaceholder: connections.ADDRESS_PLACEHOLDER,
  continueLabel: connections.CONTINUE,
  connected: connections.stateChips.online,
  disconnect: connections.DISCONNECT,
  // The label is the account's, such as "Paperclip · Acme"; the rest of the line is fixed.
  keyRevoked: connections.disconnectedRevoked("").slice("Disconnected .".length).trim(),
  readOnly: connections.READ_ONLY,
  keyPower: connections.KEY_POWER,
  signInAgain: connections.SIGN_IN_AGAIN,
  signedOut: connections.stateChips["signed-out"],
  signedOutCallout: connections.SIGNED_OUT_CALLOUT,
  httpsOnly: connections.ADDRESS_HTTPS_ONLY,
  addAccount: connections.ADD_ACCOUNT,
  addAccountLead: connections.ADD_ACCOUNT_LEAD,
  openApproval: connections.OPEN_APPROVAL,
  switcher: connections.accountSwitcherWords,
};

/**
 * Button labels that live in React files (`.tsx`), which Node can't load
 * without a build. `words.test.ts` checks each one is still in its file.
 */
export const buttonLabels = {
  openDemo: { text: "Open demo", file: "packages/studio/shell/src/welcome/welcome-sample.tsx" },
  trust: {
    text: "Trust",
    file: "packages/studio/features/workspace/src/trust/trust-check-dialog.tsx",
  },
  settings: { text: "Settings", file: "packages/studio/shell/src/sidebar/places-list.tsx" },
  newTab: { text: "New tab", file: "packages/studio/shell/src/tabs/window-tab-strip.tsx" },
  closeWorkspace: {
    text: "Close workspace",
    file: "packages/studio/features/workspace/src/switcher/workspace-menu.ts",
  },
} as const;

const welcomeFile = "packages/studio/shell/src/welcome/welcome.tsx";
const windowTitleFile = "packages/studio/shell/src/window/window-title.ts";

/**
 * Text the Studio basics steps read (HAL-18866): Welcome, the workspace switcher and its menu,
 * the window tabs and the window title. `words.test.ts` checks each is still in its file.
 */
export const basicsText = {
  welcomeTitle: { text: "Halonic Studio", file: welcomeFile },
  welcomeLine: { text: "Local first, private, and yours.", file: welcomeFile },
  recent: { text: "Recent", file: "packages/studio/shell/src/welcome/welcome-recent.tsx" },
  demoTag: { text: "Demo", file: "packages/studio/shell/src/welcome/welcome-recent.tsx" },
  demoFolder: { text: "Acme sample", file: "apps/studio/src/studio/sample-host.ts" },
  switcher: {
    text: "Workspace: ",
    file: "packages/studio/shell/src/sidebar/workspace-switcher.tsx",
  },
  openFolderRow: {
    text: "Open a folder…",
    file: "packages/studio/features/workspace/src/switcher/workspace-menu.ts",
  },
  openTabs: { text: "Open tabs", file: "packages/studio/shell/src/tabs/window-tab-strip.tsx" },
  appName: { text: "Halonic", file: windowTitleFile },
  titleSeparator: { text: " · ", file: windowTitleFile },
} as const;

const tryItFile = "packages/studio/features/agents/src/chat/try-it-words.ts";

/**
 * Text step 1 reads that no words entry point exports: the shell's place names, the agents
 * feature's Try it words, and the demo's agent. `words.test.ts` checks each is still in its file.
 */
export const screenText = {
  places: { text: "Places", file: "packages/studio/shell/src/sidebar/places-list.tsx" },
  agents: { text: "Agents", file: "packages/studio/shell/src/points/frame.ts" },
  writer: { text: "Writer", file: "examples/acme/hubs/support/agents/writer.agent.yaml" },
  chatWith: { text: "Chat with ", file: tryItFile },
  messageTo: { text: "Message ", file: tryItFile },
  replied: { text: " replied.", file: tryItFile },
  engineStopped: { text: "Stopped when Halonic's engine stopped.", file: tryItFile },
  replyFailed: { text: "'s reply failed: ", file: tryItFile },
} as const;

const settingsFolder = "packages/studio/features/settings";
const appearanceFile = `${settingsFolder}/src/appearance/appearance-text.ts`;
const sandboxStateFile = `${settingsFolder}/src/agent-sandbox/sandbox-state.ts`;
const sandboxTextFile = `${settingsFolder}/src/agent-sandbox/sandbox-text.ts`;
const aboutFile = `${settingsFolder}/src/updater/about-text.ts`;

/**
 * Text the Settings steps read, from the settings feature, which exports no
 * words entry point. `words.test.ts` checks each is still in its file. The
 * Format names and examples come from `Intl` in the window, so no source file
 * holds them: those point at the requirement that states them.
 */
export const settingsText = {
  appearance: { text: "Appearance", file: `${settingsFolder}/src/feature.ts` },
  themeDark: { text: "Dark", file: appearanceFile },
  themeSystem: { text: "System", file: appearanceFile },
  formats: { text: "Formats", file: `${settingsFolder}/src/feature.ts` },
  formatExample: { text: "Example:", file: `${settingsFolder}/src/formats/formats-text.ts` },
  dutch: { text: "Dutch (Netherlands)", file: `${settingsFolder}/requirements/formats-section.md` },
  dutchNumber: { text: "12.345,60", file: `${settingsFolder}/requirements/formats-section.md` },
  followComputer: {
    text: "Follow this computer:",
    file: `${settingsFolder}/requirements/formats-format.md`,
  },
  agentSandbox: {
    text: "Agent sandbox",
    file: sandboxTextFile,
  },
  sandboxChecking: { text: "Checking the sandbox…", file: sandboxTextFile },
  sandboxNotChecked: {
    text: "Couldn't check the sandbox: ",
    file: sandboxTextFile,
  },
  about: { text: "About Halonic", file: aboutFile },
  checkNow: { text: "Check now", file: aboutFile },
  automatic: { text: "Update Halonic automatically", file: aboutFile },
  updaterDidntAnswer: { text: "Halonic's updater didn't answer.", file: aboutFile },
} as const;

/** The chips Settings › Agent sandbox can show once its check answered. */
export const sandboxChips = [
  "Needs setting up",
  "Needs repair",
  "Ready",
  "Restart needed",
  "Not available",
].map((text) => ({ text, file: sandboxStateFile }));

/**
 * The error lines a step can find on screen, by the code the results table
 * shows for each. The code is the words file's name for the line.
 */
export const errorLines: Readonly<Record<string, string>> = {
  LIST_FAILED: connections.LIST_FAILED,
  ENGINE_NOT_STARTED: buildChatWords.engineNotStarted,
  ENGINE_NOT_ANSWERING: buildChatWords.engineNotAnswering,
  ENGINE_FAILED: welcomeStartWords.failedTitle,
  ENGINE_STOPPED: screenText.engineStopped.text,
  REPLY_FAILED: screenText.replyFailed.text,
};

/** The code of the first known error line in the text, if any. */
export function errorCodeIn(text: string): string | undefined {
  return Object.entries(errorLines).find(([, line]) => text.includes(line))?.[0];
}
