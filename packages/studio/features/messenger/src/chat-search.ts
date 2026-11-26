import type { Message } from "@halonicjs/ports";
import { chatName } from "./chat-name.ts";
import type { ConversationRow } from "./messenger.ts";

/** A conversation a chat search found, with the line of its newest message that holds the text. */
export interface FoundChat {
  readonly row: ConversationRow;
  /** None when only the conversation's name holds the text. */
  readonly line: string | undefined;
}

/**
 * The conversations whose name or messages hold `search`, ignoring case, in the list's order
 * (`messenger.chat-search`). An automatic note isn't searched: it isn't the agent's answer. A
 * conversation whose messages can't be read is searched by its name alone.
 */
export async function findChats(
  rows: readonly ConversationRow[],
  search: string,
  read: (row: ConversationRow) => Promise<readonly Message[]>,
): Promise<readonly FoundChat[]> {
  const wanted = search.trim().toLowerCase();
  const found = await Promise.all(
    rows.map(async (row): Promise<FoundChat | undefined> => {
      if (wanted === "") return { row, line: undefined };
      const messages = await read(row);
      const message = messages.findLast(
        (each) => each.automatic !== true && each.body.toLowerCase().includes(wanted),
      );
      if (message !== undefined) return { row, line: lineHolding(message.body, wanted) };
      return chatName(row).toLowerCase().includes(wanted) ? { row, line: undefined } : undefined;
    }),
  );
  return found.filter((each) => each !== undefined);
}

/** The first line of `body` that holds `wanted`, so the row shows the match. */
function lineHolding(body: string, wanted: string): string {
  const line = body.split("\n").find((each) => each.toLowerCase().includes(wanted));
  return (line ?? body).trim();
}
