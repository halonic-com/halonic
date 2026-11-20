import { type RefObject, useLayoutEffect, useState } from "react";

/** The room each name in the tree has, and the drawn width of a text in the names' font. */
export interface NameRoom {
  /** The width each name may take, in pixels, by the path of its row. Empty until measured. */
  readonly room: ReadonlyMap<string, number>;
  /** Undefined where text can't be measured: names then keep their fixed cut. */
  readonly widthOf: ((text: string) => number) | undefined;
}

/** How the names are drawn, from the parts of their style that change a text's width. */
interface NamesFont {
  /** A CSS `font` value; browsers leave the computed `font` shorthand empty, so it's built here. */
  readonly font: string;
  readonly letterSpacing: string;
}

/**
 * Measures text as the browser draws it in the names' font, with any font, monospaced or not.
 * Undefined where there's no canvas to measure with, or it won't take the font.
 */
function textMeasure({ font, letterSpacing }: NamesFont): ((text: string) => number) | undefined {
  if (font === "") return undefined;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = document.createElement("canvas").getContext("2d");
  } catch {
    return undefined;
  }
  if (context === null) return undefined;
  const defaultFont = context.font;
  context.font = font;
  // A canvas keeps its own font when it can't parse the one it's given.
  if (context.font === defaultFont && font !== defaultFont) return undefined;
  if (letterSpacing !== "normal" && "letterSpacing" in context)
    context.letterSpacing = letterSpacing;
  const widths = new Map<string, number>();
  return (text) => {
    let width = widths.get(text);
    if (width === undefined) {
      width = context.measureText(text).width;
      widths.set(text, width);
    }
    return width;
  };
}

/** The width each drawn name may take, by the path of its row. */
function measureRoom(tree: HTMLElement): Map<string, number> {
  const room = new Map<string, number>();
  for (const name of tree.querySelectorAll<HTMLElement>("[data-name]")) {
    const path = name.closest<HTMLElement>("[data-path]")?.dataset["path"];
    const width = name.getBoundingClientRect().width;
    if (path !== undefined && width > 0) room.set(path, width);
  }
  return room;
}

/** The font the names are drawn in. */
function namesFont(tree: HTMLElement): NamesFont {
  const name = tree.querySelector<HTMLElement>("[data-name]");
  if (name === null) return { font: "", letterSpacing: "normal" };
  const style = getComputedStyle(name);
  return {
    font: [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" "),
    letterSpacing: style.letterSpacing,
  };
}

function sameFont(before: NamesFont, after: NamesFont): boolean {
  return before.font === after.font && before.letterSpacing === after.letterSpacing;
}

function sameRoom(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>) {
  return (
    before.size === after.size && [...after].every(([path, width]) => before.get(path) === width)
  );
}

/**
 * The room each row's name has and a way to measure text in its font, measured again when the
 * tree's width changes (the sidebar's edge, the window, the zoom), when `rows` change and once the
 * fonts have loaded. A name takes the room its row leaves after the indent, the marks and the ⋮,
 * whatever its own length.
 */
export function useNameRoom(tree: RefObject<HTMLElement | null>, rows: unknown): NameRoom {
  const [measured, setMeasured] = useState<NameRoom & { font: NamesFont }>({
    room: new Map(),
    widthOf: undefined,
    font: { font: "", letterSpacing: "normal" },
  });
  // `rows` is a dependency because it changes which names are drawn, and how much room each has.
  useLayoutEffect(() => {
    const target = tree.current;
    if (target === null) return;
    let live = true;
    const measure = (fontsLoaded = false) => {
      if (!live) return;
      const room = measureRoom(target);
      const font = namesFont(target);
      setMeasured((before) => {
        const fontKept = sameFont(before.font, font) && !fontsLoaded;
        if (fontKept && sameRoom(before.room, room)) return before;
        // A new font, or one that has just loaded, draws text at new widths: measure it afresh.
        return { room, font, widthOf: fontKept ? before.widthOf : textMeasure(font) };
      });
    };
    measure();
    void document.fonts?.ready.then(() => measure(true));
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => measure());
    observer?.observe(target);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [tree, rows]);
  return measured;
}
