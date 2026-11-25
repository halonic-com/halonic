import type { Attachment, AttachmentRead, MessagingId } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { Button, sizeText } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";

/** The picture types a card draws; SVG never, since it is a document that can hold script. */
const drawnTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Said when an image's bytes couldn't be read or drawn, with **Try again**. */
export const imageFailed = "Couldn't load the image.";

/** Props for {@link AgentAttachments}. */
export interface AgentAttachmentsProps {
  readonly attachments: readonly Attachment[];
  /** Reads a file's bytes through the engine; called only when the person asks to see it. */
  readonly read: (attachment: MessagingId) => Promise<AttachmentRead>;
}

/**
 * The files on an agent's card (`inbox.agent-item-media`): each one's name and size, and for a
 * picture a **Show image** button. Nothing is read until the person presses it, so no file loads
 * on its own and the agent learns nothing from the card being opened. The bytes come through the
 * engine and are drawn on a canvas in the page, so no address, `blob:` or `data:` URL is ever
 * loaded and Studio's content security policy stays as it is.
 */
export function AgentAttachments({ attachments, read }: AgentAttachmentsProps) {
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex flex-col gap-2 text-small text-fg-muted">
          {drawnTypes.has(attachment.type) ? (
            <ImageAttachment attachment={attachment} read={read} />
          ) : (
            <span dir="auto">{attachmentLine(attachment)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A file's line: "login.png · 120 KB". The name is the agent's, so a hidden character is marked. */
export function attachmentLine(attachment: Attachment): string {
  return `${markHiddenName(attachment.name)} · ${sizeText(attachment.size)}`;
}

type Shown =
  | { readonly kind: "hidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "shown"; readonly picture: ImageBitmap };

function ImageAttachment({
  attachment,
  read,
}: {
  readonly attachment: Attachment;
  readonly read: AgentAttachmentsProps["read"];
}) {
  const [shown, setShown] = useState<Shown>({ kind: "hidden" });
  const show = async () => {
    setShown({ kind: "loading" });
    try {
      const result = await read(attachment.id);
      // Offline or signed out, the source's own line already says why; here it only failed.
      if (result.outcome !== "read") {
        setShown({ kind: "failed" });
        return;
      }
      const blob = new Blob([result.bytes.slice()], { type: attachment.type });
      setShown({ kind: "shown", picture: await createImageBitmap(blob) });
    } catch {
      // The line below says it failed and Try again reads it again; bytes that don't decode as
      // a picture fail here too, and are never shown any other way.
      setShown({ kind: "failed" });
    }
  };
  const line = <span dir="auto">{attachmentLine(attachment)}</span>;
  const action = shown.kind === "failed" ? "Try again" : "Show image";

  if (shown.kind === "shown") {
    return (
      <>
        <Picture picture={shown.picture} name={attachment.name} />
        {line}
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {line}
      {shown.kind === "failed" ? <span>{imageFailed}</span> : null}
      <Button
        variant="secondary"
        size="sm"
        busy={shown.kind === "loading"}
        // A card with two pictures has two of these; the file name tells them apart by ear.
        name={`${action}: ${markHiddenName(attachment.name)}`}
        onClick={() => void show()}
      >
        {action}
      </Button>
    </div>
  );
}

/**
 * Draws the decoded picture at its own size, never wider than the card. **Show image** is gone
 * once it's drawn, so focus moves to the picture instead of falling to the page. It's drawn once:
 * strict mode runs the effect again after its cleanup has closed the bitmap, and the canvas keeps
 * its pixels.
 */
function Picture({ picture, name }: { readonly picture: ImageBitmap; readonly name: string }) {
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
      aria-label={markHiddenName(name)}
      tabIndex={-1}
      className="h-auto max-w-full self-start rounded-sm border border-border focus-ring"
    />
  );
}
