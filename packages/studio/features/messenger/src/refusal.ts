import type { MessagingRefusal } from "@halonicjs/ports";
import type { ConversationRow } from "./messenger.ts";

/** Why a row's source can't take a message or an answer now, or `undefined` when it can. */
export function refusalOf(row: ConversationRow): MessagingRefusal | undefined {
  const state = row.source?.state.kind ?? "not-found";
  return state === "online" ? undefined : state;
}
