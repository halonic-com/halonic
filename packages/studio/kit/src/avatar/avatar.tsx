import { type ReactNode, useEffect, useRef, useState } from "react";
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
   * hard to see beside a two-line title (HAL-19192, `kit.avatar-size`), or 48px in a two-pane
   * app's sidebar row, the Inbox's and the Messenger's (HAL-19735, `kit.plain-row-size`).
   */
  readonly size?: AvatarSize;
  /**
   * An agent's own colour, from `agentTint`, for the initials' tile, so the agent looks the same
   * wherever it shows (`kit.avatar-tint`). Without a tint, as for the signed-in person, it stays neutral.
   */
  readonly tint?: AgentTint | undefined;
  /**
   * What kind of item the member asks about, as a small glyph such as `KindIcon`'s, on a round
   * badge at the tile's bottom right: 16px on a 28px tile, 20px on a 40px or 48px one
   * (`kit.avatar-badge`). The picture says who asks, the badge what it is. On a 28px tile the
   * initials keep one letter, so the badge covers none of the second.
   */
  readonly badge?: ReactNode;
  /**
   * A glyph in place of the initials, on the neutral tile, such as `KindIcon`'s silhouette for a
   * sender the source doesn't name (`kit.avatar-badge`). A picture still wins.
   */
  readonly glyph?: ReactNode;
}

/** The Avatar's three sizes: 28px in a row, 40px in a header, 48px in a sidebar row. */
export type AvatarSize = "row" | "header" | "sidebar";

/**
 * Each size's tile classes, its initials' text style, its side in CSS pixels, and the padding
 * around a picture inside the tile, so a face doesn't touch the circle's edge (HAL-19539,
 * `kit.avatar-inset`): 2px at 28px, 3px at 40px and 48px.
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
  sidebar: {
    tile: "size-12 shrink-0 rounded-full",
    text: "text-heading",
    pixels: 48,
    inset: "p-[3px]",
  },
} as const satisfies Record<
  AvatarSize,
  { tile: string; text: string; pixels: number; inset: string }
>;

/**
 * The neutral tile, for a person and behind a picture. On a muted fill, such as a hovered or open
 * sidebar row, it turns `surface`, so its circle stays visible (HAL-19751, `kit.avatar-on-row-fill`).
 */
const neutral = "bg-surface-muted on-muted:bg-surface";

/**
 * A member's initials, or their picture, on a 28px round tile (40px with `size="header"`, 48px with
 * `size="sidebar"` in a two-pane app's sidebar row): who is signed in, in Cloud's top
 * bar (HAL-16050), or an agent in the Messenger. `surface-muted` with a `border-strong` edge and `fg-muted`, not the accent,
 * so it doesn't read as a product. An agent's initials sit on its own tint instead, in `fg` so
 * they read as well on every tint, with the same edge. It's decoration: the member's name is next to it, or in the
 * top bar's name for screen readers.
 *
 * @example
 * <Avatar name={member.name} />
 * <Avatar name={agent.name} tint={agentTint(agent.id)} picture={pictures.get(agent.avatar)} />
 * <Avatar name={agent.name} tint={agentTint(agent.id)} badge={<KindIcon kind="approval" />} />
 */
export function Avatar({ badge, ...tile }: AvatarProps) {
  if (badge === undefined) return <AvatarTile {...tile} />;
  const size = tile.size ?? "row";
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${badgeHolders[size]}`}>
      <AvatarTile {...tile} letters={size === "row" ? 1 : 2} />
      <span
        data-avatar-badge
        className={`absolute -end-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-surface text-fg-muted ring-1 ring-border-strong ${badgeSizes[size]}`}
      >
        {badge}
      </span>
    </span>
  );
}

/** The square that holds the tile and its badge, the tile's own size, so the row lines up as before. */
const badgeHolders: Record<AvatarSize, string> = {
  row: "size-7",
  header: "size-10",
  sidebar: "size-12",
};

/** The badge's side and its glyph's: 16px on a 28px tile, 20px on the larger ones. */
const badgeSizes: Record<AvatarSize, string> = {
  row: "size-4 [&>svg]:size-3",
  header: "size-5 [&>svg]:size-3.5",
  sidebar: "size-5 [&>svg]:size-3.5",
};

/** A glyph's side on each tile, as the Inbox's marks: half the tile or a little more. */
const glyphSizes: Record<AvatarSize, string> = {
  row: "[&>svg]:size-4",
  header: "[&>svg]:size-5",
  sidebar: "[&>svg]:size-6",
};

/** The round tile alone: the picture, or up to `letters` initials. */
function AvatarTile({
  name,
  picture,
  size = "row",
  tint,
  glyph,
  letters = 2,
}: Omit<AvatarProps, "badge"> & { readonly letters?: 1 | 2 }) {
  const { tile, text } = sizes[size];
  if (picture !== undefined) return <AvatarPicture picture={picture} size={size} />;
  if (glyph !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center ${neutral} text-fg-muted ring-1 ring-inset ring-border-strong ${glyphSizes[size]} ${tile}`}
      >
        {glyph}
      </span>
    );
  }
  // A hovered, focused or open plain row is filled `surface-muted` too, so the edge keeps the
  // circle from vanishing into it (`kit.avatar-edge`); a picture fills the tile on its own.
  const look = tint === undefined ? `${neutral} text-fg-muted` : `${tint} text-fg`;
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center ${text} font-semibold ${look} ring-1 ring-inset ring-border-strong ${tile}`}
    >
      {initials(name, letters)}
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

/** The first letters of the first two words (or the first word), upper case: "Sofia Marin" is "SM"; empty is "?". */
function initials(name: string, most: 1 | 2): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  const letters = words.slice(0, most).map((word) => [...word][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
