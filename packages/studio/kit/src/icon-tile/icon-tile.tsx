import type { ReactNode } from "react";

/** The props of `IconTile`. */
export interface IconTileProps {
  /** One of our 20px line icons, drawn in `currentColor`. */
  readonly children: ReactNode;
}

/**
 * Our line icon on a 40px halo tile: the halo tint with an 8px radius, the icon in `accent-text`.
 * The same tile as on halonic.dev, next to a feature, a product or a connection. It's decoration:
 * the words next to it say the same, so screen readers skip it.
 *
 * The Empty state keeps its own tile, a `surface` one with a shadow: it sits on the halo wash,
 * where a halo-tinted tile would disappear.
 *
 * @example
 * <IconTile><FileIcon /></IconTile>
 */
export function IconTile({ children }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-10 shrink-0 place-items-center rounded-sm bg-halo-tint text-accent-text"
    >
      <span className="inline-grid size-icon-md place-items-center *:size-full">{children}</span>
    </span>
  );
}
