import type { Attachment } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { isPicture } from "../draft-files.ts";
import type { Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { sizeOf } from "./file-size.ts";

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
      <bdi>{attachment.name}</bdi> <span className="text-fg-muted">{sizeOf(attachment.size)}</span>
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

  async function show() {
    setBusy(true);
    try {
      setPicture(await pictureOf(messenger, attachment));
    } finally {
      setBusy(false);
    }
  }

  if (picture === undefined) {
    return (
      <Button
        variant="secondary"
        size="sm"
        busy={busy}
        onClick={() => {
          void show().catch((error: unknown) => {
            console.error("The picture couldn't be shown:", error);
            setPicture("not-shown");
          });
        }}
      >
        {messengerWords.files.show(attachment.name)} · {sizeOf(attachment.size)}
      </Button>
    );
  }
  if (picture === "not-shown") {
    return (
      <>
        <FileLine attachment={attachment} />
        <span className="text-fg-muted">{messengerWords.files.notShown}</span>
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

/** The decoded picture on a canvas: no `<img>`, so no address and no load of its own. */
function DrawnPicture({ name, picture }: { readonly name: string; readonly picture: ImageBitmap }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas.current?.getContext("2d")?.drawImage(picture, 0, 0);
    return () => picture.close();
  }, [picture]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={name}
      width={picture.width}
      height={picture.height}
      className="h-auto max-w-full rounded-md border border-border"
    />
  );
}
