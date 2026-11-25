import type { MessagingId } from "@halonicjs/ports";
import { useEffect, useRef, useState } from "react";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** Each chat agent's decoded picture, by its avatar ID. */
export type AgentPictures = ReadonlyMap<MessagingId, ImageBitmap>;

/** The picture types drawn: never SVG, a document that can hold script, and no GIF. */
const pictureTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The picture of `row`'s chat agent, if it has one and it was read; a channel has none. */
export function pictureOf(pictures: AgentPictures, row: ConversationRow): ImageBitmap | undefined {
  const avatar = chatAgent(row)?.avatar;
  return avatar === undefined ? undefined : pictures.get(avatar);
}

/**
 * Reads each chat agent's picture once while the Messenger is open (`messenger.agent-pictures`):
 * a later read of the list reads no picture again, and one that was refused or didn't decode
 * isn't tried again until the Messenger opens again, so its initial stays. The pictures are closed
 * when the Messenger closes.
 */
export function useAgentPictures(
  messenger: Messenger,
  rows: readonly ConversationRow[],
): AgentPictures {
  const [pictures, setPictures] = useState<AgentPictures>(new Map());
  const asked = useRef(new Set<MessagingId>());
  const held = useRef(new Map<MessagingId, ImageBitmap>());
  const open = useRef(true);

  useEffect(() => {
    open.current = true;
    const kept = held.current;
    // What was asked stays asked: strict mode's second run must not read every picture again.
    return () => {
      open.current = false;
      for (const picture of kept.values()) picture.close();
      kept.clear();
    };
  }, []);

  // One line per avatar ID, so a new read of the same list starts nothing.
  const wanted = [...new Set(rows.flatMap((row) => chatAgent(row)?.avatar ?? []))].join("\n");
  useEffect(() => {
    for (const avatar of wanted.split("\n")) {
      if (avatar === "" || asked.current.has(avatar)) continue;
      asked.current.add(avatar);
      void readPicture(messenger, avatar).then((picture) => {
        if (picture === undefined) return;
        // Closed already, or read twice by strict mode's second run: this copy isn't kept.
        if (!open.current || held.current.has(avatar)) return picture.close();
        held.current.set(avatar, picture);
        setPictures(new Map(held.current));
      });
    }
  }, [messenger, wanted]);

  return pictures;
}

/** The decoded picture, or `undefined` for a refused read, another type or bytes that don't decode. */
async function readPicture(
  messenger: Messenger,
  avatar: MessagingId,
): Promise<ImageBitmap | undefined> {
  try {
    const read = await messenger.readAttachment(avatar);
    // A refusal (offline, signed out, too large) leaves the initial; the source's line says why.
    if (read.outcome !== "read" || !pictureTypes.has(read.type)) return undefined;
    return await createImageBitmap(new Blob([new Uint8Array(read.bytes)], { type: read.type }));
  } catch (error) {
    console.warn("The Messenger couldn't show an agent's picture:", error);
    return undefined;
  }
}
