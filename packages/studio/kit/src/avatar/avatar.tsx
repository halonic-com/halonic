import { useEffect, useRef, useState } from "react";
import type { AgentTint } from "./agent-tint.ts";

/** The props of `Avatar`. */
export interface AvatarProps {
  /** The member's name: "Sofia Marin". It shows the first letters of its first two words. */
  readonly name: string;
  /**
   * The member's picture, decoded by the caller from bytes the engine read, so no address,
   * `blob:` or `data:` URL is ever loaded and Studio's content security policy stays as it is
   * (`kit.avatar-picture`). The caller owns it and closes it; without one, the initials show.
   */
  readonly picture?: ImageBitmap | undefined;
  /**
   * The tile's size: 28px in a row (the default), or 40px in an open item's header, where 28px is
   * hard to see beside a two-line title (HAL-19192, `kit.avatar-size`).
   */
  readonly size?: AvatarSize;
  /**
   * An agent's own colour, from `agentTint`, for the initials' tile, so the agent looks the same
   * wherever it shows (`kit.avatar-tint`). A person's avatar has none and stays neutral.
   */
  readonly tint?: AgentTint | undefined;
}

/** The Avatar's two sizes: 28px in a row, 40px in a header. */
export type AvatarSize = "row" | "header";

/**
 * Each size's tile classes, its initials' text style, its side in CSS pixels, and the padding
 * around a picture inside the tile, so a face doesn't touch the circle's edge (HAL-19539,
 * `kit.avatar-inset`): 2px at 28px, 3px at 40px.
 */
const sizes = {
  row: {
    tile: "size-7 shrink-0 rounded-full",
    text: "text-caption",
    pixels: 28,
    inset: "p-0.5",
  },
  header: {
    tile: "size-10 shrink-0 rounded-full",
    text: "text-small",
    pixels: 40,
    inset: "p-[3px]",
  },
} as const satisfies Record<
  AvatarSize,
  { tile: string; text: string; pixels: number; inset: string }
>;

/** The neutral tile, for a person and behind a picture. */
const neutral = "bg-surface-muted";

/**
 * A member's initials, or their picture, on a 28px round tile (40px with `size="header"`): who is signed in, in Cloud's top
 * bar (HAL-16050), or an agent in the Messenger. `surface-muted` with a `border-strong` edge and `fg-muted`, not the accent,
 * so it doesn't read as a product. An agent's initials sit on its own tint instead, in `fg` so
 * they read as well on every tint, with the same edge. It's decoration: the member's name is next to it, or in the
 * top bar's name for screen readers.
 *
 * @example
 * <Avatar name={member.name} />
 * <Avatar name={agent.name} tint={agentTint(agent.id)} picture={pictures.get(agent.avatar)} />
 */
export function Avatar({ name, picture, size = "row", tint }: AvatarProps) {
  const { tile, text } = sizes[size];
  if (picture !== undefined) return <AvatarPicture picture={picture} size={size} />;
  // A hovered, focused or open plain row is filled `surface-muted` too, so the edge keeps the
  // circle from vanishing into it (`kit.avatar-edge`); a picture fills the tile on its own.
  const look = tint === undefined ? `${neutral} text-fg-muted` : `${tint} text-fg`;
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center ${text} font-semibold ${look} ring-1 ring-inset ring-border-strong ${tile}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Draws the picture's centre square, inside the tile's padding, on a round canvas drawn at the
 * tile's size in device pixels (`kit.avatar-size`), never larger
 * than the square itself. Drawing it small here, with high-quality smoothing, keeps fine detail
 * from turning into moiré, which a CSS shrink of a full-size canvas does, and a 2000px picture
 * from holding 16 MB per row (HAL-18570). It is drawn again only for another picture. Once drawn,
 * the tile says so with `data-picture="drawn"`: the canvas's pixels are out of WebDriver's reach,
 * so that is how the click test tells a picture from the initials (HAL-19151).
 */
function AvatarPicture({
  picture,
  size,
}: {
  readonly picture: ImageBitmap;
  readonly size: AvatarSize;
}) {
  const { tile, pixels: tilePixels, inset } = sizes[size];
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pictureDrawn, setPictureDrawn] = useState(false);
  useEffect(() => {
    const target = canvas.current;
    if (target === null) return;
    const side = Math.max(1, Math.min(picture.width, picture.height));
    const drawn = Math.min(side, Math.ceil(tilePixels * window.devicePixelRatio));
    target.width = drawn;
    target.height = drawn;
    const context = target.getContext("2d");
    if (context === null) return;
    context.imageSmoothingQuality = "high";
    const left = (picture.width - side) / 2;
    const top = (picture.height - side) / 2;
    context.drawImage(picture, left, top, side, side, 0, 0, drawn, drawn);
    setPictureDrawn(true);
  }, [picture, tilePixels]);
  return (
    <span
      aria-hidden="true"
      data-picture={pictureDrawn ? "drawn" : undefined}
      className={`block overflow-hidden ${neutral} ${inset} ${tile}`}
    >
      <canvas ref={canvas} className="block size-full rounded-full" />
    </span>
  );
}

/** The first letters of the first two words, upper case: "Sofia Marin" is "SM"; empty is "?". */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
