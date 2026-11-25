import type { Attachment } from "@halonicjs/ports";
import { Button, sizeText } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { isPicture } from "../draft-files.ts";
import type { Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";

/** The props of {@link AttachmentList}. */
export interface AttachmentListProps {
  readonly messenger: Messenger;
  readonly attachments: readonly Attachment[];
}

/**
 * A message's files, each by its name and size. A picture shows only once the
 * person asks: its bytes come through the engine and are drawn in the page,
 * so nothing loads on its own and no address is ever used (ADR, Attachments).
 */
export function AttachmentList({ messenger, attachments }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex flex-col items-start gap-1 text-small">
          {isPicture(attachment.type) ? (
            <Picture messenger={messenger} attachment={attachment} />
          ) : (
            <FileLine attachment={attachment} />
          )}
        </li>
      ))}
    </ul>
  );
}

function FileLine({ attachment }: { readonly attachment: Attachment }) {
  return (
    <span>
      <bdi>{attachment.name}</bdi>
      <span className="text-fg-muted"> · {sizeText(attachment.size)}</span>
    </span>
  );
}

/** A picture behind "Show <name>": read and drawn only after the click. */
function Picture({
  messenger,
  attachment,
}: {
  readonly messenger: Messenger;
  readonly attachment: Attachment;
}) {
  const [picture, setPicture] = useState<ImageBitmap | "not-shown" | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  function show() {
    setBusy(true);
    void pictureOf(messenger, attachment)
      .catch((error: unknown) => {
        console.error("The picture couldn't be shown:", error);
        return "not-shown" as const;
      })
      .then(setPicture)
      .finally(() => setBusy(false));
  }

  if (picture === undefined) {
    return (
      <Button variant="secondary" size="sm" busy={busy} onClick={show}>
        {messengerWords.files.show(attachment.name)} · {sizeText(attachment.size)}
      </Button>
    );
  }
  if (picture === "not-shown") {
    // The Inbox's line and button for a picture that didn't load (HAL-17851).
    return (
      <>
        <FileLine attachment={attachment} />
        <span className="flex flex-wrap items-center gap-2 text-fg-muted">
          {messengerWords.files.notShown}
          <Button
            variant="secondary"
            size="sm"
            busy={busy}
            name={`${messengerWords.files.tryAgain}: ${attachment.name}`}
            onClick={show}
          >
            {messengerWords.files.tryAgain}
          </Button>
        </span>
      </>
    );
  }
  return <DrawnPicture name={attachment.name} picture={picture} />;
}

/** Reads a picture's bytes through the engine and decodes them; only the four picture types. */
async function pictureOf(
  messenger: Messenger,
  attachment: Attachment,
): Promise<ImageBitmap | "not-shown"> {
  const read = await messenger.readAttachment(attachment.id);
  if (read.outcome === "refused" || !isPicture(read.type)) return "not-shown";
  return createImageBitmap(new Blob([new Uint8Array(read.bytes)], { type: read.type }));
}

/**
 * The decoded picture on a canvas: no `<img>`, so no address and no load of its own. The Show
 * button is gone once it's drawn, so focus moves to the picture instead of falling to the page.
 * It's drawn once: strict mode runs the effect again after its cleanup has closed the bitmap,
 * and the canvas keeps its pixels. The size is set there too, since a closed bitmap has none.
 */
function DrawnPicture({ name, picture }: { readonly name: string; readonly picture: ImageBitmap }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<ImageBitmap>(undefined);
  useEffect(() => {
    const target = canvas.current;
    if (target === null) return;
    if (drawn.current !== picture) {
      target.width = picture.width;
      target.height = picture.height;
      target.getContext("2d")?.drawImage(picture, 0, 0);
      drawn.current = picture;
    }
    target.focus();
    return () => picture.close();
  }, [picture]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={name}
      tabIndex={-1}
      className="h-auto max-w-full rounded-md border border-border focus-ring"
    />
  );
}
