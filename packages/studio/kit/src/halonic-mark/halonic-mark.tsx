import { type ReactNode, useId } from "react";

/** The props of `HalonicMark`. */
export interface HalonicMarkProps {
  /**
   * The name the mark carries when no words sit next to it: "Halonic Studio". Without one, the
   * mark is decoration and screen readers skip it.
   */
  readonly label?: string | undefined;
  /** Its size: `size-icon-md` (20px) unless you give another. */
  readonly className?: string;
  /**
   * What sits in the ring, on its 100-unit box: an app's glyph, drawn by the kit's `AppLogo`.
   * Without it the ring is bare.
   */
  readonly children?: ReactNode;
}

/**
 * The Halonic ring, drawn as on halonic.dev (`brand/masters/halonic-mark.svg`): the band is 16% of
 * the diameter in one viewBox, so no pixel stroke, and the one gradient runs bottom left to top
 * right (design decisions 42, 91, 92). The ring has no glow, so it looks the same in light and
 * dark. Its colours are the brand's own, not tokens: a mark is never recoloured. Each mark gets
 * its own gradient id, so two on a page never share one. The Studio's title bar and Cloud's
 * shells draw it (HAL-16050); the Android connect page is plain HTML and keeps its own copy.
 *
 * @example
 * <HalonicMark label={narrow ? "Halonic Studio" : undefined} />
 */
export function HalonicMark({ label, className = "size-icon-md", children }: HalonicMarkProps) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 100 100"
      className={`shrink-0 ${className}`}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3175f2" />
          <stop offset="1" stopColor="#1bc6c8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${gradientId})`} strokeWidth="16" />
      {children}
    </svg>
  );
}
