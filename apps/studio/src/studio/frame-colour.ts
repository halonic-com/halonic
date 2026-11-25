import {
  type DisplaySettings,
  frameColourPair,
  frameColoursPref,
} from "@halonicjs/studio-feature-settings";
import type { TauriIpc } from "@halonicjs/studio-services";
import { focusedFrameClass } from "@halonicjs/studio-shell";

/** Studio's frame: the halo over the canvas (the kit's `bg-halo-frame`, which the shell frame uses). */
const studioFrameClass = "bg-halo-frame";

/**
 * How much of the first frame colour the halo lays over the canvas where it starts, at the top
 * left, which the title bar meets: the kit's `bg-halo-frame`, 30% in light and 15% in dark.
 */
const haloStart = { light: 0.3, dark: 0.15 } as const;

/**
 * `colour` as `#rrggbb`, for a colour the way the browser computes it: `#rrggbb`, `rgb()` or
 * `rgba()` with commas or spaces, or `color(srgb …)` with channels from 0 to 1. `undefined` for a
 * colour that isn't opaque, or anything else: the title bar can't be see-through.
 */
export function hexOfColour(colour: string): string | undefined {
  const text = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(
    text,
  );
  if (rgb !== null) return opaqueHex(rgb.slice(1, 4).map(Number), rgb[4]);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    text,
  );
  if (srgb !== null)
    return opaqueHex(
      srgb.slice(1, 4).map((channel) => Number(channel) * 255),
      srgb[4],
    );
  return undefined;
}

function opaqueHex(channels: readonly number[], alpha: string | undefined): string | undefined {
  if (alpha !== undefined && alpha !== "1" && alpha !== "100%") return undefined;
  if (channels.some((channel) => !Number.isFinite(channel) || channel > 255)) return undefined;
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** `top` laid over `base` at `share`, from 0 to 1, as `color-mix(in srgb, …)` mixes them. */
export function mixOver(base: string, top: string, share: number): string {
  const channels = (hex: string) =>
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const under = channels(base);
  const over = channels(top);
  return `#${under
    .map((channel, index) => Math.round(channel + ((over[index] ?? channel) - channel) * share))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Whether the `#rrggbb` colour is a dark theme's: the canvas is near-black in dark and near-white in light. */
function isDarkCanvas(hex: string): boolean {
  const sum = [1, 3, 5].reduce(
    (total, start) => total + Number.parseInt(hex.slice(start, start + 2), 16),
    0,
  );
  return sum < 3 * 128;
}

/**
 * The colour a frame of `frameClass` has in `document` now, read off a hidden element of that
 * class, so it follows the theme and the system's light or dark as the frame does.
 */
function computedBackground(document: Document, frameClass: string): string | undefined {
  const probe = document.createElement("div");
  probe.hidden = true;
  probe.className = frameClass;
  document.body.append(probe);
  try {
    return hexOfColour(document.defaultView?.getComputedStyle(probe).backgroundColor ?? "");
  } finally {
    probe.remove();
  }
}

/** A focused app's frame colour, `--color-app-frame`: slate-75 in light, slate-950 in dark. */
export function focusedFrameColour(document: Document): string | undefined {
  return computedBackground(document, focusedFrameClass);
}

/**
 * Studio's frame colour where the title bar meets it: the first of the person's frame colours,
 * from Settings, laid over the canvas as the halo starts. The canvas is the frame's own colour
 * under the halo.
 */
export function studioFrameColour(
  document: Document,
  display: DisplaySettings,
): string | undefined {
  const canvas = computedBackground(document, studioFrameClass);
  if (canvas === undefined) return undefined;
  const [first] = frameColourPair(display.get(frameColoursPref));
  const share = isDarkCanvas(canvas) ? haloStart.dark : haloStart.light;
  return mixOver(canvas, first.toLowerCase(), share);
}

/**
 * Tells the shell the frame's colour (`studio.window-title-bar-colour`), so on Windows the title
 * bar takes it: once now, and again whenever the theme, the frame colours or the system's light or
 * dark change it, only when it changed. A refusal goes to the console. Returns the stop.
 */
export function followFrameColour(
  ipc: TauriIpc,
  document: Document,
  read: () => string | undefined,
): () => void {
  let sent: string | undefined;
  const report = () => {
    const colour = read();
    if (colour === undefined || colour === sent) return;
    sent = colour;
    ipc.invoke("set_frame_colour", { colour }).catch((error: unknown) => {
      console.error("The title bar didn't take the frame's colour:", error);
    });
  };
  report();
  // Settings → Appearance shows on <html>: the theme as data-theme, the frame colours as its style.
  const observer = new MutationObserver(report);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
  const view = document.defaultView;
  const scheme =
    typeof view?.matchMedia === "function"
      ? view.matchMedia("(prefers-color-scheme: dark)")
      : undefined;
  scheme?.addEventListener("change", report);
  // Before the stylesheet has loaded, the frame has no colour yet.
  view?.addEventListener("load", report, { once: true });
  return () => {
    observer.disconnect();
    scheme?.removeEventListener("change", report);
    view?.removeEventListener("load", report);
  };
}
