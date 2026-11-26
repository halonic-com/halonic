import type { Attachment, AttachmentRead, MessagingId } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { Button, sizeText } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";

/** The picture types a card draws; SVG never, since it is a document that can hold script. */
const drawnTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * The most bytes a card reads or decodes for one picture. A screenshot is far smaller; above
 * this the card says it couldn't load the image rather than hold the bytes.
 */
export const maxImageBytes = 20 * 1024 * 1024;

/**
 * The most pixels a card draws for one picture, about a 8K screen. A small file can decode to a
 * huge bitmap (a decompression bomb), so the decoded size is checked too.
 */
export const maxImagePixels = 8192 * 4320;

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
  const picture = useRef<ImageBitmap>(undefined);
  const gone = useRef(false);
  // The bitmap is closed when the card goes, not in the effect that draws it: strict mode runs
  // that effect again after its cleanup, and a closed bitmap can't be drawn.
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      picture.current?.close();
    };
  }, []);
  const show = async () => {
    setShown({ kind: "loading" });
    try {
      const decoded = await readPicture(attachment, read);
      // Closed at once if the card went while it was read, since nothing else would close it.
      if (gone.current) decoded?.close();
      picture.current = decoded;
      setShown(decoded === undefined ? { kind: "failed" } : { kind: "shown", picture: decoded });
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
 * Reads and decodes a picture, or `undefined` when it mustn't be drawn: listed or read above
 * {@link maxImageBytes}, read as a type the card doesn't draw (the type the source listed isn't
 * proof of what it sends), refused by the source, or decoded above {@link maxImagePixels}.
 * Offline or signed out, the source's own line already says why; here it only failed.
 */
async function readPicture(
  attachment: Attachment,
  read: AgentAttachmentsProps["read"],
): Promise<ImageBitmap | undefined> {
  if (attachment.size > maxImageBytes) return undefined;
  const result = await read(attachment.id);
  if (result.outcome !== "read") return undefined;
  if (!drawnTypes.has(result.type) || result.bytes.byteLength > maxImageBytes) return undefined;
  const blob = new Blob([result.bytes.slice()], { type: result.type });
  const decoded = await createImageBitmap(blob);
  if (decoded.width * decoded.height > maxImagePixels) {
    decoded.close();
    return undefined;
  }
  return decoded;
}

/**
 * Draws the decoded picture at its own size, never wider than the card. **Show image** is gone
 * once it's drawn, so focus moves to the picture instead of falling to the page. It's drawn once
 * per canvas, since strict mode runs the effect twice and the canvas keeps its pixels; the card
 * that read the bitmap closes it.
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
