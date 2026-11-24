import type { AgentActivity, MessagingRefusal } from "@halonicjs/ports";
import type { FileRefusal } from "./file-limits.ts";
import type { MessengerTab } from "./messenger.ts";

/** Why the engine refused a message's files; it sends none of the message then. Approved on HAL-17459. */
const filesNotSent =
  "These files can't be sent. Up to 5 files of 10 MB each can: PNG, JPEG, GIF or WebP pictures, PDFs and text files.";

/**
 * The Messenger's words. "Messenger", "All" and "Waiting for me" are the
 * HAL-17421 renders' (approved by the board, 24 Nov); a single conversation is
 * "chat" in lower case, never the app's name (HAL-17358).
 */
export const messengerWords = {
  title: "Messenger",
  tabsLabel: "Chats",
  tabs: { all: "All", waiting: "Waiting for me" } satisfies Record<MessengerTab, string>,
  noChats: "No chats yet.",
  nothingWaiting: "No chat is waiting for you.",
  pickChat: "Pick a chat to read it.",
  searchLabel: "Search this chat",
  noMatches: "No message in this chat matches.",
  activity: {
    idle: "Idle",
    working: "Working",
    waiting: "Waiting",
    paused: "Paused",
    other: "",
  } satisfies Record<AgentActivity, string>,
  composerLabel: (name: string) => `Message ${name}`,
  composerPlaceholder: (name: string) => `Message ${name}…`,
  /** Why a message stayed in the box; it is never sent later on its own. */
  kept: {
    offline: (source: string) => `${source} is offline. Your message stays here and isn't sent.`,
    "signed-out": (source: string) =>
      `You're signed out of ${source}. Sign in again to send; your message stays here.`,
    "not-found": () => "This chat is gone. Your message stays here and isn't sent.",
    "too-large": () => filesNotSent,
    "unsupported-type": () => filesNotSent,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
  you: "You",
  /** An agent's open card in its chat (HAL-17421 render 4e, approved by the board, 24 Nov). */
  card: {
    needsYou: "Needs you",
    alsoInInbox: "Also in your Inbox. Answering here answers it there.",
    answeredBy: (name: string) => `${name} answered this first.`,
    answeredByYou: "You already answered this.",
  },
  askForUpdate: "Ask for an update",
  /** Files and screenshots in a chat: picked, pasted, or sent by the agent. */
  files: {
    attach: "Attach a file",
    remove: (name: string) => `Remove ${name}`,
    /** Why a file wasn't added to the box; the limits are `messengerFileLimits`. */
    refused: {
      "too-large": (name: string) => `${name} is over 10 MB, so it wasn't added.`,
      "too-many": () => "A message takes at most 5 files.",
      "unsupported-type": (name: string) =>
        `${name} can't be sent. PNG, JPEG, GIF and WebP pictures, PDFs and text files can.`,
    } satisfies Record<FileRefusal, (name: string) => string>,
    notSent: filesNotSent,
    pastedName: "Screenshot.png",
    show: (name: string) => `Show ${name}`,
    /** The Inbox's own line and button for a picture that didn't load. */
    notShown: "Couldn't load the image.",
    tryAgain: "Try again",
  },
  /** Why a quick action sent nothing; it is never sent later on its own. */
  notSent: {
    offline: (source: string) => `${source} is offline, so nothing was sent.`,
    "signed-out": (source: string) =>
      `You're signed out of ${source}, so nothing was sent. Sign in again first.`,
    "not-found": () => "This is gone, so nothing was sent.",
    "too-large": () => filesNotSent,
    "unsupported-type": () => filesNotSent,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
} as const;
