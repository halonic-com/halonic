// `decide` is pure, so a file a state saves reaches `step` as its text. The
// blob goes into the store before the events do: an `artifact.created` in
// the log always names a blob that is there.

import type { BlobStore } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { DecidedEvent, LoggedEvent } from "./decide-types.ts";

/**
 * The event as the kernel folds it before the file is saved. Folding
 * `artifact.created` reads neither its hash nor its size, so the hash is
 * left empty here; only {@link saveArtifacts} gives the stored one.
 */
export function foldableEvent(event: DecidedEvent): LoggedEvent {
  if (event.type !== "save-artifact") {
    return event;
  }
  const { state, name, mediaType, text } = event;
  return {
    type: "artifact.created",
    state,
    name,
    hash: "",
    mediaType,
    size: encodeUtf8(text).length,
  };
}

/**
 * Keeps the text of every `save-artifact` in the blob store, in order, and
 * puts `artifact.created` with the blob's hash, size and media type in its
 * place. Every other event stays as it is. Storing the same text twice keeps
 * one copy, so a `step` that lost a race and decides again can save again.
 *
 * @throws when a blob can't be stored; the caller appends nothing then
 */
export async function saveArtifacts(
  blobs: Pick<BlobStore, "put">,
  events: readonly DecidedEvent[],
): Promise<LoggedEvent[]> {
  const logged: LoggedEvent[] = [];
  for (const event of events) {
    if (event.type !== "save-artifact") {
      logged.push(event);
      continue;
    }
    const { hash, mediaType, size } = await blobs.put(encodeUtf8(event.text), event.mediaType);
    logged.push({
      type: "artifact.created",
      state: event.state,
      name: event.name,
      hash,
      mediaType,
      size,
    });
  }
  return logged;
}
