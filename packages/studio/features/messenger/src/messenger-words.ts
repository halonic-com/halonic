import type { AgentActivity, InboxAnswer, MessagingRefusal } from "@halonicjs/ports";
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
  /**
   * The Messenger with nothing connected: the words of Settings › Connections with no connection
   * (Noah's wording table on HAL-17498), so both places say the same. The shell's `NoConnections`
   * shows them; `title` and `connect` repeat its `noConnectionsWords` for the click test, which
   * reads this file in Node and can't load the shell.
   */
  noConnections: {
    title: "No connections",
    line: "Connect Paperclip to answer your agents' cards and chat with them from Inbox and Messenger.",
    connect: "Connect Paperclip",
  },
  searchLabel: "Search this chat",
  noMatches: "No message in this chat matches.",
  /**
   * Loading and failed reads, in the Inbox's words (design review HAL-18481, improvement 3,
   * approved by the board on HAL-10, 25 Nov).
   */
  load: {
    chats: "Loading your chats",
    chat: "Loading this chat",
    chatsFailed: "Couldn't load your chats",
    chatFailed: "Couldn't load this chat",
    tryAgain: "Try again",
    /** After 10 seconds, the kit List's own words. */
    slow: "Still loading",
  },
  /** The chat's times and markers (design review HAL-18481, improvements 1, 2 and 4). */
  today: "Today",
  yesterday: "Yesterday",
  sending: "Sending…",
  /** Under the chat while its agent has a run on it (the board's request on HAL-18736). */
  typing: (name: string) => `${name} is typing…`,
  /** The person's sent message: one tick (the board's request on HAL-18736, 19:00 UTC). */
  sent: "Sent",
  /** The person's message the chat's agent picked up: two ticks. */
  readAt: (time: string) => `Read ${time}`,
  /** The pill over the box while replies came in below where the person reads. */
  newMessages: (count: number) => (count === 1 ? "1 new message" : `${count} new messages`),
  /** A row's chip while its agent's cards wait. */
  openCards: (count: number) => (count === 1 ? "1 card" : `${count} cards`),
  /** The unread dot, for a screen reader. */
  unread: "Unread",
  /** Before the person's own message in a row's preview. */
  youSaid: "You: ",
  /** One pane at a time in a narrow window: back from the open chat to the list (HAL-18074). */
  backToChats: "Back to chats",
  /**
   * An automatic note's mark: its tooltip, the plan's wording (HAL-18743 section 4, approved by the
   * board on 25 Nov), which a screen reader reads before the note.
   */
  automatic: (name: string) =>
    `Written automatically from what ${name} is doing. ${name}'s own answer follows.`,
  /** Read out when the agent writes after the chat opened: its name and the message's start. */
  newMessage: (name: string, body: string) => `${name}: ${[...body].slice(0, 100).join("")}`,
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
    "bad-answer": () => "This can't be sent in this chat. Your message stays here and isn't sent.",
    // Sending from this box can't get these two: its `to` holds only the channel's members, and
    // a source without channels lists none to send in.
    "bad-members": () => "A channel needs at least 2 agents. Your message stays here.",
    "not-supported": (source: string) =>
      `${source} doesn't have channels. Your message stays here and isn't sent.`,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
  you: "You",
  /** An agent's open card in its chat (HAL-17421 render 4e, approved by the board, 24 Nov). */
  card: {
    needsYou: "Needs you",
    alsoInInbox: "Also in your Inbox. Answering here answers it there.",
    answeredBy: (name: string) => `${name} answered this first.`,
    answeredByYou: "You already answered this.",
    /** Read out once an option answered the card, which then leaves the chat. */
    answered: (option: string) => `Answered: ${option}.`,
    /** Before an answered card's record, for a screen reader only: "Answered: Approve, 12:10". */
    recordPrefix: "Answered: ",
    /** How an action card ended, as its record says it (Noah's check on HAL-18476). */
    outcomes: {
      succeeded: "Succeeded",
      failed: "Failed",
      declined: "Declined",
      expired: "Expired",
    } satisfies Record<Extract<InboxAnswer, { kind: "action-result" }>["outcome"], string>,
  },
  /** The bar under the chat while cards wait (board decision on HAL-18471, 25 Nov). */
  cardsWaiting: (count: number) => (count === 1 ? "1 card waiting" : `${count} cards waiting`),
  askForUpdate: "Ask for an update",
  /** Files and screenshots in a chat: picked, pasted, or sent by the agent. */
  files: {
    attach: "Attach a file",
    remove: (name: string) => `Remove ${name}`,
    removed: (name: string) => `${name} removed.`,
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
    "bad-answer": () => "This can't be sent here, so nothing was sent.",
    // A quick action sends no `to` and starts no channel, so it can't get these two yet.
    "bad-members": () => "A channel needs at least 2 agents, so nothing was sent.",
    "not-supported": (source: string) => `${source} doesn't have channels, so nothing was sent.`,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
} as const;
