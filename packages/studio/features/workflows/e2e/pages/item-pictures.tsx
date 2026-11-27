import {
  Avatar,
  type AvatarSize,
  agentTint,
  KindIcon,
  type KindIconName,
} from "@halonicjs/studio-kit";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/*
 * Who asks and what kind of item, as the Inbox's rows (48px), the open item's header (40px) and the
 * Messenger's Needs you (28px) draw them (HAL-19666, Sofia's proposal on HAL-19491): made-up agents
 * on their own tints, one with a picture, a person's initials, a sender nobody named, each with its
 * kind's badge, then the Inbox's own items with no badge.
 */

interface Sender {
  readonly label: string;
  readonly name: string;
  readonly agent?: string;
  readonly kind: KindIconName;
  readonly glyph?: KindIconName;
  readonly picture?: boolean;
  readonly noBadge?: boolean;
}

const senders: readonly Sender[] = [
  {
    label: "Agent with a picture · approval",
    name: "Robin",
    agent: "acme-robin",
    kind: "approval",
    picture: true,
  },
  { label: "Agent · question", name: "Kai", agent: "acme-kai", kind: "question" },
  { label: "Agent · action", name: "Mo", agent: "acme-mo", kind: "action" },
  { label: "Agent · answer elsewhere", name: "Ira", agent: "acme-ira", kind: "elsewhere" },
  { label: "Agent · task", name: "Tess", agent: "acme-tess", kind: "task" },
  { label: "Agent · comment", name: "Cal", agent: "acme-cal", kind: "comment" },
  { label: "Person · approval", name: "Sam Lee", kind: "approval" },
  { label: "Sender nobody named · question", name: "", kind: "question", glyph: "unknown" },
  { label: "Own approval", name: "", kind: "approval", glyph: "approval", noBadge: true },
  { label: "Own person step", name: "", kind: "wait", glyph: "wait", noBadge: true },
  { label: "Own setup", name: "", kind: "setup", glyph: "setup", noBadge: true },
  { label: "Notice", name: "", kind: "notice", glyph: "notice", noBadge: true },
];

const sizes: readonly [AvatarSize, string][] = [
  ["sidebar", "Inbox row, 48px"],
  ["header", "Item header, 40px"],
  ["row", "Needs you, 28px"],
];

/** A made-up picture: two soft bands, drawn here so the page loads no file. */
function usePicture(): ImageBitmap | undefined {
  const [picture, setPicture] = useState<ImageBitmap>();
  useEffect(() => {
    const canvas = new OffscreenCanvas(120, 120);
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.fillStyle = "#e8b48a";
    context.fillRect(0, 0, 120, 120);
    context.fillStyle = "#6b4f3a";
    context.beginPath();
    context.arc(60, 48, 26, 0, Math.PI * 2);
    context.fill();
    context.fillRect(22, 84, 76, 36);
    void createImageBitmap(canvas).then(setPicture);
  }, []);
  return picture;
}

function Sheet() {
  const picture = usePicture();
  return (
    <div
      id="shot"
      className="inline-grid grid-cols-[14rem_repeat(3,8rem)] items-center gap-3 bg-surface p-6 text-fg"
    >
      <span />
      {sizes.map(([size, label]) => (
        <span key={size} className="text-small text-fg-muted">
          {label}
        </span>
      ))}
      {senders.map((sender) => (
        <Row key={sender.label} sender={sender} picture={picture} />
      ))}
    </div>
  );
}

function Row({
  sender,
  picture,
}: {
  readonly sender: Sender;
  readonly picture: ImageBitmap | undefined;
}) {
  return (
    <>
      <span className="text-small">{sender.label}</span>
      {sizes.map(([size]) => (
        <span key={size}>
          <Avatar
            name={sender.name}
            size={size}
            tint={sender.agent === undefined ? undefined : agentTint(sender.agent)}
            picture={sender.picture ? picture : undefined}
            glyph={sender.glyph === undefined ? undefined : <KindIcon kind={sender.glyph} />}
            badge={sender.noBadge ? undefined : <KindIcon kind={sender.kind} />}
          />
        </span>
      ))}
    </>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The item pictures page needs its #root element (item-pictures.html).");
}
createRoot(root).render(
  <StrictMode>
    <Sheet />
  </StrictMode>,
);
