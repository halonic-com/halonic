import type { AgentActivity, MessagingRefusal } from "@halonicjs/ports";
import type { MessengerTab } from "./messenger.ts";

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
  noMatches: "No message in this chat holds that.",
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
  } satisfies Record<MessagingRefusal, (source: string) => string>,
  you: "You",
  /** An agent's open card in its chat (HAL-17421 render 4e, approved by the board, 24 Nov). */
  card: {
    needsYou: "Needs you",
    waitingSince: (time: string) => `Waiting since ${time}`,
    alsoInInbox: "Also in your Inbox. Answering here answers it there.",
    answeredBy: (name: string) => `${name} answered this first.`,
  },
  askForUpdate: "Ask for an update",
  /** Why a quick action sent nothing; it is never sent later on its own. */
  notSent: {
    offline: (source: string) => `${source} is offline, so nothing was sent.`,
    "signed-out": (source: string) =>
      `You're signed out of ${source}, so nothing was sent. Sign in again first.`,
    "not-found": () => "This is gone, so nothing was sent.",
  } satisfies Record<MessagingRefusal, (source: string) => string>,
} as const;
