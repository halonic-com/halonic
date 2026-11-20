import { KindedError } from "@halonicjs/std";

/**
 * Why `InboxRuns.send` refuses: Studio can't send answers itself, and no retry changes that.
 * The Inbox shows the message and, when there is one, the command that answers from a terminal,
 * with no **Try again**. Without a command the message stands alone, as for a Windows folder,
 * which no terminal can answer (D-A, HAL-12822).
 */
export class AnswerElsewhere extends KindedError {
  /**
   * @param message - the sentence the Inbox shows, safe to show and to log
   * @param command - the command to copy that sends the answer; `undefined` when there is none
   */
  constructor(message: string, command: string | undefined) {
    super("unavailable", message, command === undefined ? {} : { fix: command });
  }
}
