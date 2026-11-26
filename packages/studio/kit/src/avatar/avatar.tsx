import { useEffect, useRef, useState } from "react";

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
}

const tile = "size-7 shrink-0 rounded-full bg-surface-muted";
/** The tile's side in CSS pixels; it matches `size-7`. */
const tilePixels = 28;

/**
 * A member's initials, or their picture, on a 28px round tile: who is signed in, in Cloud's top
 * bar (HAL-16050), or an agent in the Messenger. `surface-muted` and `fg-muted`, not the accent,
 * so it doesn't read as a product. It's decoration: the member's name is next to it, or in the
 * top bar's name for screen readers.
 *
 * @example
 * <Avatar name={member.name} />
 * <Avatar name={agent.name} picture={pictures.get(agent.avatar)} />
 */
export function Avatar({ name, picture }: AvatarProps) {
  if (picture !== undefined) return <AvatarPicture picture={picture} />;
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center text-caption font-semibold text-fg-muted ${tile}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Draws the picture's centre square on a canvas the tile's size in device pixels, never larger
 * than the square itself. Drawing it small here, with high-quality smoothing, keeps fine detail
 * from turning into moiré, which a CSS shrink of a full-size canvas does, and a 2000px picture
 * from holding 16 MB per row (HAL-18570). It is drawn again only for another picture. Once drawn,
 * the tile says so with `data-picture="drawn"`: the canvas's pixels are out of WebDriver's reach,
 * so that is how the click test tells a picture from the initials (HAL-19151).
 */
function AvatarPicture({ picture }: { readonly picture: ImageBitmap }) {
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
  }, [picture]);
  return (
    <span
      aria-hidden="true"
      data-picture={pictureDrawn ? "drawn" : undefined}
      className={`block overflow-hidden ${tile}`}
    >
      <canvas ref={canvas} className="block size-full" />
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
