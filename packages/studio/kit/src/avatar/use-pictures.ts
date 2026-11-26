import { useEffect, useRef, useState } from "react";

/** One picture's bytes as the engine read them, or a refusal; the shape of `AgentMessaging.readAttachment`'s answer. */
export type PictureRead =
  | { readonly outcome: "read"; readonly bytes: Uint8Array; readonly type: string }
  | { readonly outcome: "refused" };

/** Each decoded picture, by the ID it was read with. */
export type Pictures = ReadonlyMap<string, ImageBitmap>;

/** The picture types drawn: never SVG, a document that can hold script, and no GIF. */
const pictureTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Reads each of `ids` once with `read` and decodes it for `Avatar`'s `picture`, while the caller is
 * mounted (`messenger.agent-pictures`, `inbox.picture-badge`): a later render with the same IDs reads nothing again, and one that was
 * refused or didn't decode isn't tried again until the caller mounts again, so its initial stays.
 * The pictures are closed on unmount. The Messenger reads its chat agents' pictures with it, the
 * Inbox the pictures of the agents who ask.
 *
 * @example
 * const pictures = usePictures(messaging.readAttachment, agents.flatMap((agent) => agent.avatar ?? []));
 */
export function usePictures(
  read: (id: string) => Promise<PictureRead>,
  ids: readonly string[],
): Pictures {
  const [pictures, setPictures] = useState<Pictures>(new Map());
  const asked = useRef(new Set<string>());
  const held = useRef(new Map<string, ImageBitmap>());
  const mounted = useRef(true);
  // The latest `read`, so a caller's new arrow function each render starts no read.
  const reader = useRef(read);
  reader.current = read;

  useEffect(() => {
    mounted.current = true;
    const kept = held.current;
    // What was asked stays asked: strict mode's second run must not read every picture again.
    return () => {
      mounted.current = false;
      for (const picture of kept.values()) picture.close();
      kept.clear();
    };
  }, []);

  // One line per ID, so a new render with the same IDs starts nothing.
  const wanted = [...new Set(ids)].join("\n");
  useEffect(() => {
    for (const id of wanted.split("\n")) {
      if (id === "" || asked.current.has(id)) continue;
      asked.current.add(id);
      void decodePicture(reader.current, id).then((picture) => {
        if (picture === undefined) return;
        // Unmounted already, or read twice by strict mode's second run: this copy isn't kept.
        if (!mounted.current || held.current.has(id)) return picture.close();
        held.current.set(id, picture);
        setPictures(new Map(held.current));
      });
    }
  }, [wanted]);

  return pictures;
}

/** The decoded picture, or `undefined` for a refused read, another type or bytes that don't decode. */
async function decodePicture(
  read: (id: string) => Promise<PictureRead>,
  id: string,
): Promise<ImageBitmap | undefined> {
  try {
    const answer = await read(id);
    // A refusal (offline, signed out, too large) leaves the initial; the source's line says why.
    if (answer.outcome !== "read" || !pictureTypes.has(answer.type)) return undefined;
    return await createImageBitmap(new Blob([new Uint8Array(answer.bytes)], { type: answer.type }));
  } catch (error) {
    console.warn("Studio couldn't show a picture:", error);
    return undefined;
  }
}
