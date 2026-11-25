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
  engineStopped: { text: "Stopped when Halonic's engine stopped.", file: tryItFile },
  replyFailed: { text: "'s reply failed: ", file: tryItFile },
} as const;

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
