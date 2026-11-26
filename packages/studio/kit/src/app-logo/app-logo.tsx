import { useId } from "react";
import { HalonicMark } from "../halonic-mark/halonic-mark.tsx";
import { type AppGlyphShape, type AppLogoId, appGlyphScale, appGlyphs } from "./app-glyphs.ts";

/** The props of `AppLogo`. */
export interface AppLogoProps {
  /** The app whose logo it is: its glyph sits in the ring. */
  readonly app: AppLogoId;
  /**
   * The app's name when no words sit next to the logo, such as "Halonic Messenger". Without one,
   * the logo is decoration and screen readers skip it.
   */
  readonly label?: string | undefined;
  /** Its size: `size-icon-md` (20px) unless you give another. */
  readonly className?: string;
  /** The size it shows at, in CSS pixels, which decides how much the glyph grows: 20 by default. */
  readonly pixels?: number;
}

/**
 * An app's logo (HAL-17379, approved with the Halonic apps card HAL-17358): the Halonic ring, with
 * the app's glyph where the point of light sits. Studio keeps the point of light, Messenger has a
 * message bubble, Inbox an envelope, Workspaces stacked layers, Code brackets, Runs the play shape and
 * Ask a question mark. Under 48px the glyph grows so it stays readable. The glyph takes the text
 * colour, so it is white on dark and near-black on light; the ring keeps the brand gradient. A
 * glyph's `cut` shapes are masked out of it, so the background shows through them. The Studio's
 * native icons are drawn from the same glyphs.
 *
 * @example
 * <AppLogo app="messenger" label={narrow ? "Halonic Messenger" : undefined} />
 */
export function AppLogo({ app, label, className = "size-icon-md", pixels = 20 }: AppLogoProps) {
  const scale = appGlyphScale(pixels);
  const maskId = useId();
  const shapes = appGlyphs[app];
  const cuts = shapes.filter((shape) => shape.kind === "cut");
  return (
    <HalonicMark label={label} className={className}>
      {cuts.length > 0 && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          {cuts.map((shape) => (
            <path
              key={keyOf(shape)}
              d={shape.d}
              fill="none"
              stroke="#000"
              strokeWidth={shape.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </mask>
      )}
      <g
        data-app-glyph={app}
        className="text-fg"
        transform={`translate(50 50) scale(${scale}) translate(-50 -50)`}
        mask={cuts.length > 0 ? `url(#${maskId})` : undefined}
      >
        {shapes
          .filter((shape) => shape.kind !== "cut")
          .map((shape) => (
            <GlyphShape key={keyOf(shape)} shape={shape} />
          ))}
      </g>
    </HalonicMark>
  );
}

const keyOf = (shape: AppGlyphShape) =>
  shape.kind === "dot" ? `dot ${shape.cx} ${shape.cy}` : shape.d;

function GlyphShape({ shape }: { readonly shape: AppGlyphShape }) {
  switch (shape.kind) {
    case "dot":
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="currentColor" />;
    case "solid":
      return (
        <path
          d={shape.d}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
      );
    case "cut":
      // Drawn by `AppLogo`'s mask, not as a shape.
      return null;
    case "line":
      return (
        <path
          d={shape.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}
