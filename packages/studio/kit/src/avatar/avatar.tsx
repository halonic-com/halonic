import { useEffect, useRef } from "react";

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
 * Draws the picture's centre square on a canvas at the picture's own resolution; the tile scales
 * it down and rounds it. It is drawn again only for another picture.
 */
function AvatarPicture({ picture }: { readonly picture: ImageBitmap }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (target === null) return;
    const side = Math.max(1, Math.min(picture.width, picture.height));
    target.width = side;
    target.height = side;
    const left = (picture.width - side) / 2;
    const top = (picture.height - side) / 2;
    target.getContext("2d")?.drawImage(picture, left, top, side, side, 0, 0, side, side);
  }, [picture]);
  return (
    <span aria-hidden="true" className={`block overflow-hidden ${tile}`}>
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
