import type { DraftOutcome } from "@halonicjs/studio-feature-messenger/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AskWindow } from "../../src/api.ts";
import { AskMemory, memoryStorage } from "../../src/ask-memory.ts";
import { AskSession } from "../../src/ask-session.ts";
import { agent, chat, FakeMessenger } from "../../src/test-support/fake-messenger.ts";
import { AskBox } from "../../src/ui/ask-box.tsx";

/**
 * Quick ask's real box over a Messenger where Chief answers every question at length, a moment
 * after it's sent, so the end-to-end test can fill the box past its window's height.
 */
const chief = agent("Chief");

/** The answer's paragraphs: far more than the box's 380 px answer area holds. */
const longAnswer = Array.from(
  { length: 24 },
  (_, line) => `Step ${line + 1}: the release card is with the board, and the notes are ready.`,
).join("\n\n");

/** Each question and its answer a minute apart, so every answer comes after its question. */
let minute = 0;
const at = () => `2026-11-25T13:${String(40 + minute).padStart(2, "0")}:00.000Z`;

class AnsweringMessenger extends FakeMessenger {
  override async sendText(conversation: string, body: string): Promise<DraftOutcome> {
    this.sentAt = at();
    const outcome = await super.sendText(conversation, body);
    minute += 1;
    const answeredAt = at();
    minute += 1;
    setTimeout(() => {
      this.reply(chief, longAnswer, answeredAt);
      this.change(chief.source);
    }, 0);
    return outcome;
  }
}

const window: AskWindow = {
  hide: async () => {},
  openStudio: async () => {},
  openChat: async () => {},
};

const session = new AskSession(
  new AnsweringMessenger([chat(chief)]),
  new AskMemory(memoryStorage()),
);
const root = document.getElementById("root");
if (root === null) throw new Error("The quick ask page needs its #root element (box.html).");
createRoot(root).render(
  <StrictMode>
    <AskBox session={session} window={window} onClosed={() => undefined} />
  </StrictMode>,
);
