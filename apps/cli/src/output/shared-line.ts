import type { Message } from "../messages/define.ts";
import type { LiveLine } from "./progress.ts";

/**
 * The live line a command's steps draw, shared with the printer. Every other
 * line the printer writes to the same screen goes through {@link around}, so a
 * result, warning or error never lands on top of the ◌ line or gets erased
 * by its next draw.
 */
export interface SharedLine extends LiveLine {
  /**
   * Writes other output with the live line out of the way: erases it, runs
   * `write`, then draws it again below what was written. With no line shown
   * it only runs `write`.
   */
  around(write: () => void): void;
  /**
   * Takes the line away for good, when the command has ended. A step that
   * forgot to end can't draw it again.
   */
  close(): void;
}

/** The {@link SharedLine} on top of a terminal's live line. */
export function sharedLine(line: LiveLine): SharedLine {
  let shown: Message | undefined;
  let closed = false;
  const clear = () => {
    if (shown !== undefined) {
      line.clear();
      shown = undefined;
    }
  };
  return {
    draw(message) {
      if (!closed) {
        line.draw(message);
        shown = message;
      }
    },
    clear,
    around(write) {
      if (shown === undefined) {
        write();
        return;
      }
      line.clear();
      write();
      line.draw(shown);
    },
    close() {
      clear();
      closed = true;
    },
  };
}
