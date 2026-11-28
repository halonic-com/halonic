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
  notConnected: connections.stateChips["no-key"],
  noKeyCallout: connections.NO_KEY_CALLOUT,
  signIn: connections.SIGN_IN,
  httpsOnly: connections.ADDRESS_HTTPS_ONLY,
  addAccount: connections.ADD_ACCOUNT,
  addAccountLead: connections.ADD_ACCOUNT_LEAD,
  openApproval: connections.OPEN_APPROVAL,
  switcher: connections.accountSwitcherWords,
  messengerComposer: messengerWords.composerLabel,
  messengerNeedsNote: messengerWords.card.needsNoteInInbox,
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
  approve: {
    text: "Approve",
    file: "packages/adapters/paperclip-client/src/approval-words.ts",
  },
  // A yes/no card's buttons, Paperclip's own words when the card names none (HAL-19002).
  accept: { text: "Accept", file: "packages/adapters/paperclip-client/src/cards.ts" },
  reject: { text: "Reject", file: "packages/adapters/paperclip-client/src/approval-words.ts" },
  // A card of questions, checkboxes, item verdicts or suggested tasks sends with this.
  submit: { text: "Submit", file: "packages/studio/kit/src/question-form/question-form.tsx" },
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
  demoFolder: { text: "Acme demo", file: "apps/studio/src/studio/sample-host.ts" },
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
  settingsTitle: {
    text: "Settings",
    file: "packages/studio/shell/src/settings/settings-dialog.tsx",
  },
} as const;

/** Settings' × button: the kit's Dialog names it "Close" and the dialog's title. */
export const closeSettingsLabel = `Close ${basicsText.settingsTitle.text}`;

const supportReplyFile = "examples/acme/hubs/support/workflows/support-reply.workflow.yaml";
const tryItFile = "packages/studio/features/agents/src/chat/try-it-words.ts";

/**
 * Text the steps read that no words entry point exports: the shell's place names, the agents
 * feature's Try it words, the shell's key line, the demo's agent, and the Inbox, search and
 * overview screens. `words.test.ts` checks each is still in its file.
 */
export const screenText = {
  places: { text: "Places", file: "packages/studio/shell/src/sidebar/places-list.tsx" },
  agents: { text: "Agents", file: "packages/studio/shell/src/points/frame.ts" },
  inbox: { text: "Inbox", file: "packages/studio/shell/src/points/frame.ts" },
  // The Inbox row names a Paperclip approval by its type in words (paperclip-client.approval-fields).
  strategyApproval: {
    text: "Strategy approval",
    file: "packages/adapters/paperclip-client/src/approval-words.ts",
  },
  // An answered Paperclip card leaves Needs you, which then says this (run 45727671231).
  nothingWaiting: {
    text: "Nothing is waiting for you.",
    file: "packages/studio/features/inbox/src/ui/needs-you-card.tsx",
  },
  // An answered card can stay open; this takes step 8 back to the list (run 45834340178). Since
  // #6615 it is the header's back arrow, found by its name.
  backToInbox: {
    text: "Back to Inbox",
    file: "packages/studio/features/inbox/src/ui/item-header.tsx",
  },
  // The Inbox's lines over a list it couldn't read again: the engine's, a refusal's, or the agents'
  // (HAL-19190).
  engineShowingLast: {
    text: "Showing what it said last.",
    file: "packages/studio/shell/src/engine/engine-words.ts",
  },
  // The engine line while the shown workspace's engine starts (HAL-19965).
  engineStarting: {
    text: "Starting the engine…",
    file: "packages/studio/shell/src/welcome/welcome-open-words.ts",
  },
  staleInbox: {
    text: "Showing what was read last.",
    file: "packages/studio/features/inbox/src/ui/load-lines.tsx",
  },
  agentLoadFailed: {
    text: "Couldn't load the items from your agents.",
    file: "packages/studio/features/inbox/src/ui/use-agent-items.tsx",
  },
  // The field a card's Reject opens when the card needs a reason (HAL-19002).
  rejectReason: {
    text: "Why are you rejecting this?",
    file: "packages/adapters/paperclip-client/src/approval-words.ts",
  },
  search: { text: "Search", file: "packages/studio/shell/src/palette/command-palette.tsx" },
  overview: { text: "Overview", file: "packages/studio/features/overview/src/feature.ts" },
  recap: { text: "Recap", file: "packages/studio/features/overview/src/ui/recap-view.tsx" },
  nothingBlocked: {
    text: "Nothing is blocked.",
    file: "packages/studio/features/overview/src/ui/overview-view.tsx",
  },
  writer: { text: "Writer", file: "examples/acme/hubs/support/agents/writer.agent.yaml" },
  chatWith: { text: "Chat with ", file: tryItFile },
  messageTo: { text: "Message ", file: tryItFile },
  replied: { text: " replied.", file: tryItFile },
  said: { text: " said", file: tryItFile },
  stoppedByYou: { text: "Stopped by you.", file: tryItFile },
  turnLimit: { text: " without finishing.", file: tryItFile },
  engineStopped: { text: "Stopped when Halonic's engine stopped.", file: tryItFile },
  replyFailed: { text: "'s reply failed: ", file: tryItFile },
  sendAnyway: { text: "Send anyway", file: tryItFile },
  keyLine: {
    text: "This looks like an API key. Keys go in the key field, so they stay out of chats and files.",
    file: "packages/studio/shell/src/secret-hold/secret-hold.ts",
  },
  // The demo's Support reply waits at its `review` step, with its own answer labels (HAL-20621).
  waitTitle: { text: "Approve this reply?", file: supportReplyFile },
  waitApprove: { text: "Approve", file: supportReplyFile },
  waitReject: { text: "Reject", file: supportReplyFile },
} as const;

const configurationFile =
  "packages/studio/features/agents/src/configuration/configuration-words.ts";

/**
 * Text the harness model step reads (HAL-18930): an agent's Configuration, its Harness and Model
 * pages, and the Model page's sentence for a Codex agent on a model Codex can't call. The agents
 * feature exports no words entry point; `words.test.ts` checks each is still in its file.
 */
export const configurationText = {
  configuration: { text: "Configuration", file: configurationFile },
  harness: { text: "Harness", file: configurationFile },
  model: { text: "Model", file: configurationFile },
  halonic: { text: "Halonic", file: configurationFile },
  codex: { text: "Codex", file: configurationFile },
  codexRefused: {
    text: "This model can't be used with Codex. Choose another.",
    file: configurationFile,
  },
  // The demo's only model alias, the test model, which no harness program can call.
  testModel: { text: "default", file: "examples/acme/models.yaml" },
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
  themeLight: { text: "Light", file: appearanceFile },
  themeDark: { text: "Dark", file: appearanceFile },
  themeSystem: { text: "System", file: appearanceFile },
  formats: { text: "Formats", file: `${settingsFolder}/src/feature.ts` },
  sectionsList: {
    text: "Settings sections",
    file: "packages/studio/shell/src/settings/settings-nav.tsx",
  },
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
