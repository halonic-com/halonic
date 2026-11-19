import { type RefObject, useLayoutEffect, useState } from "react";

/** Ten narrow and ten wide letters: in a monospaced font both are as wide. */
const narrowLetters = "i".repeat(10);
const wideLetters = "W".repeat(10);

/**
 * How many characters of `ch` each fit in `width`; undefined while nothing was measured, as in a
 * hidden tree.
 */
export function charsThatFit(width: number, ch: number): number | undefined {
  if (!(width > 0) || !(ch > 0)) return undefined;
  return Math.floor(width / ch);
}

/**
 * The width of one character in the tree's font, or undefined when the font isn't monospaced: a
 * count of characters would then be wrong, and the CSS cut at the end takes over.
 */
function charWidth(probe: HTMLElement | null): number | undefined {
  const [narrow, wide] = Array.from(probe?.children ?? []);
  if (narrow === undefined || wide === undefined) return undefined;
  const narrowWidth = narrow.getBoundingClientRect().width;
  if (!(narrowWidth > 0) || Math.abs(narrowWidth - wide.getBoundingClientRect().width) > 0.5) {
    return undefined;
  }
  return narrowWidth / narrowLetters.length;
}

/** The characters each name in the tree has room for, by the path of its row. */
function measureRoom(tree: HTMLElement, probe: HTMLElement | null): ReadonlyMap<string, number> {
  const room = new Map<string, number>();
  const ch = charWidth(probe);
  if (ch === undefined) return room;
  for (const name of tree.querySelectorAll<HTMLElement>("[data-name]")) {
    const path = name.closest<HTMLElement>("[data-path]")?.dataset["path"];
    const fits = charsThatFit(name.getBoundingClientRect().width, ch);
    if (path !== undefined && fits !== undefined) room.set(path, fits);
  }
  return room;
}

function sameRoom(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>) {
  return (
    before.size === after.size && [...after].every(([path, fits]) => before.get(path) === fits)
  );
}

/**
 * Hidden letters in the rows' font, to measure one character by. It takes no room in the tree, so
 * the sidebar never scrolls sideways for it.
 */
export function CharProbe({ probe }: { probe: RefObject<HTMLSpanElement | null> }) {
  return (
    <span
      ref={probe}
      aria-hidden="true"
      className="pointer-events-none invisible absolute size-0 overflow-hidden text-sm whitespace-pre"
    >
      <span>{narrowLetters}</span>
      <span>{wideLetters}</span>
    </span>
  );
}

/**
 * The characters each row's name has room for, by path, measured again when the tree's width
 * changes (the sidebar's edge, the window, the zoom), when `rows` change and once the fonts have
 * loaded. A name takes the room its row leaves after the indent, the marks and the ⋮, whatever its
 * own length. Empty until measured, and where the font isn't monospaced.
 */
export function useNameRoom(
  tree: RefObject<HTMLElement | null>,
  probe: RefObject<HTMLElement | null>,
  rows: unknown,
): ReadonlyMap<string, number> {
  const [room, setRoom] = useState<ReadonlyMap<string, number>>(new Map());
  // `rows` is a dependency because it changes which names are drawn, and how much room each has.
  useLayoutEffect(() => {
    const target = tree.current;
    if (target === null) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const after = measureRoom(target, probe.current);
      setRoom((before) => (sameRoom(before, after) ? before : after));
    };
    measure();
    // A font that loads late changes a character's width but not the tree's.
    void document.fonts?.ready.then(measure);
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(target);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [tree, probe, rows]);
  return room;
}
