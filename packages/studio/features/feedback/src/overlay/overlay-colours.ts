import type { CSSProperties } from "react";

/**
 * The overlay's colours. They lie on someone else's screen, so they stay the same in light and
 * dark and aren't the kit's theme colours, which follow Studio's theme (and the kit's theme
 * removes Tailwind's own `black` and `white`).
 */

/** Black at 40% over the still. */
export const dim = "rgb(0 0 0 / 0.4)";

/** Behind the still while it loads. */
export const overlayBackground: CSSProperties = { background: "#000000" };

/** The box's edge, white so it shows on any screen. */
export const boxEdge = "#ffffff";

/** The hint and the size label: white text on a dark pill. */
export const pill: CSSProperties = { background: "rgb(0 0 0 / 0.75)", color: "#ffffff" };

/** The edge of the Esc key in the hint. */
export const keyEdge: CSSProperties = { borderColor: "rgb(255 255 255 / 0.4)" };
