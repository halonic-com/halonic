// The text of a chat turn's answer as the model writes it, for the person to
// watch. Only the last model call's text ends up as the turn's answer, so any
// call that follows text already sent starts with a `restart`: text from a
// call that failed part way, or from a round the turn went on from, never
// mixes with the text that stays.

import type { ChatTurnText } from "@halonicjs/ports";

/** Passes a turn's text deltas on, with a `restart` before each model call that follows sent text. */
export class TurnText {
  private readonly listener: (text: ChatTurnText) => void;
  /** Whether a delta went out since the last `restart`. */
  private sent = false;

  constructor(listener: (text: ChatTurnText) => void) {
    this.listener = listener;
  }

  /** A model call starts: the text sent so far is thrown away. */
  startCall(): void {
    if (!this.sent) return;
    this.sent = false;
    this.listener({ kind: "restart" });
  }

  /** The model wrote `text`; an empty piece is not passed on. */
  delta(text: string): void {
    if (text === "") return;
    this.sent = true;
    this.listener({ kind: "delta", text });
  }
}
