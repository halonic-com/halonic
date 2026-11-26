import { usePresentation } from "@halonicjs/studio-kit";
import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Box,
  FIT_DELAY_MS,
  fitScale,
  type MapLine,
  type MapSide,
  MIN_FIT_SCALE,
  mapLines,
  PHONE_MIN_FIT_SCALE,
} from "./map-geometry.ts";

/**
 * The map's natural width; the fit scales it to the panel from there. At the 0.8 floor it's 43.2 rem,
 * 691 px, so it fits the 700 px panel the chat opens it in (`PANEL_DEFAULT_WIDTH`, C46 AG1).
 */
const MAP_WIDTH = "w-[54rem]";

/**
 * The map's width on a phone, where it lays out for the width instead (HAL-485 11.6): three columns
 * of 92 to 100 px cards round a 108 px centre card, 360 px in all at 16-pixel text.
 */
const PHONE_MAP_WIDTH = "w-[22.5rem]";

/**
 * Narrower than this many rem, the map doesn't fit even at its least scale, 0.8 of its 54 rem
 * (43.2 rem), so its right side would run off the panel; its sides stack instead (C525-5, C46 AG1).
 * In rem, so larger text stacks it sooner.
 */
export const STACK_BELOW_REM = 43.5;

/**
 * On a phone, narrower than this many rem the side cards can't be 92 px wide, so the map stacks
 * (component specs 15.8): a screen under 360 px, or larger text on one that wide.
 */
export const PHONE_STACK_BELOW_REM = 22.5;

/** Whether the map is stacked, for a side to lay out its cards; `false` outside a map. */
export const MapStacked = createContext(false);

/**
 * Where the fit put the map: its scale, and where its top left lands in the panel; or that the
 * panel is too narrow for it, so the map is stacked.
 */
type Fit =
  | { readonly stacked: false; readonly scale: number; readonly left: number; readonly top: number }
  | { readonly stacked: true };

/**
 * The agent map's frame (`agents.map.lines-and-fit`): it fits the map to the panel when it opens
 * and again {@link FIT_DELAY_MS} after the panel or the map stops changing size, centred, never
 * larger than its natural size and with no zoom buttons. On a phone it never shrinks it: there the
 * map is three narrow columns 22.5 rem wide, with 48 px targets (`agents.map.phone-columns`). In the gaps it draws the straight lines
 * from each side's cards to the centre card, each ending in a ring-and-dot port; the lines below
 * turn in the free space between the first row and what it can use (C560 a). The lines are a
 * picture only, hidden from screen readers and the pointer, so the cards and the add buttons stay
 * the only things to press. Its children are the grid's cells: left, centre and right in the first
 * row, what it can use across the second. The cards mark themselves with `data-map-centre` and,
 * inside an element with `data-map-side`, `data-map-card`. A summary card's drawer sits over the
 * panel, outside the fit, so its words keep their size; a press on the empty canvas closes it.
 *
 * In a panel narrower than {@link STACK_BELOW_REM} ({@link PHONE_STACK_BELOW_REM} on a phone), the map isn't fitted: its cells go one under
 * the other in their reading order, left, centre, below, right, at full size and without lines.
 */
export function MapFrame({
  label,
  drawer,
  onCanvasPress,
  children,
}: {
  readonly label: string;
  /** The open summary drawer, if any. */
  readonly drawer?: ReactNode;
  /** Called on a press on the map that isn't on a card or a button. */
  readonly onCanvasPress?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<Fit>();
  const [lines, setLines] = useState<readonly MapLine[]>([]);
  const phone = usePresentation() === "phone";
  const floor = phone ? PHONE_MIN_FIT_SCALE : MIN_FIT_SCALE;
  const narrowest = phone ? PHONE_STACK_BELOW_REM : STACK_BELOW_REM;

  const fitNow = useCallback(() => {
    const room = panel.current;
    const content = map.current;
    if (room === null || content === null) return;
    if (tooNarrow(room.clientWidth, narrowest)) {
      setFit({ stacked: true });
      return;
    }
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    const scale = fitScale(
      { width, height },
      { width: room.clientWidth, height: room.clientHeight },
      floor,
    );
    setFit({
      stacked: false,
      scale,
      // On whole pixels, so the words stay sharp.
      left: Math.max(0, Math.round((room.clientWidth - width * scale) / 2)),
      top: Math.max(0, Math.round((room.clientHeight - height * scale) / 2)),
    });
  }, [floor, narrowest]);

  const stacked = fit?.stacked === true;
  // Fit before the first paint, so the map never shows at the wrong size; again on a change between
  // the phone and the desktop; and once it stops being stacked, since its natural width can be
  // measured only then.
  useLayoutEffect(() => {
    if (!stacked) fitNow();
  }, [stacked, fitNow]);

  // Cards move when what the map shows changes, so the lines are measured after every render.
  useLayoutEffect(() => {
    if (map.current === null) return;
    const next = stacked ? [] : measureLines(map.current);
    setLines((now) => (sameLines(now, next) ? now : next));
  });

  useEffect(() => {
    const room = panel.current;
    const content = map.current;
    if (room === null || content === null || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fitNow, FIT_DELAY_MS);
    });
    observer.observe(room);
    observer.observe(content);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitNow]);

  // One section in both layouts, so the resize observer keeps watching it when the layout changes.
  return (
    <div className="relative size-full">
      {/* The pointer's way to close the drawer; the keyboard's is Esc, so no key handler here.
          pointer-check-ignore: a press on the empty map closes it, so the map keeps the arrow. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above. */}
      <div
        ref={panel}
        data-map-panel=""
        className="relative size-full overflow-auto"
        onClick={(event) => {
          if (!(event.target instanceof Element) || event.target.closest("button, a") === null) {
            onCanvasPress?.();
          }
        }}
        // A card or button Tab reaches shows whole, its ring too, also below the panel's fold.
        onFocus={(event) => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}
      >
        <section
          ref={map}
          aria-label={label}
          data-map-stacked={stacked ? "" : undefined}
          className={
            stacked
              ? "w-full"
              : `absolute top-0 left-0 ${phone ? PHONE_MAP_WIDTH : MAP_WIDTH} origin-top-left`
          }
          style={
            fit?.stacked === false
              ? { transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` }
              : undefined
          }
        >
          {!stacked && <MapLines lines={lines} />}
          {/* Lines need room between the sides, so the gaps are wider than a page's. Stacked, a flex
              column ignores the cells' grid places, so they follow the DOM's order. */}
          <div className={gridOf(stacked, phone)}>
            <MapStacked value={stacked}>{children}</MapStacked>
          </div>
        </section>
      </div>
      {drawer}
    </div>
  );
}

const gridClasses = "grid grid-cols-[1fr_minmax(12rem,auto)_1fr] items-start gap-x-16 gap-y-10 p-6";
/** 94 px side columns at 360 px, with 16 px for each line to cross between them and the centre. */
const phoneGridClasses =
  "grid grid-cols-[minmax(5.75rem,6.25rem)_6.75rem_minmax(5.75rem,6.25rem)] justify-center items-start gap-x-4 gap-y-6 p-4";
/** Flush rows edge to edge; the centre card insets itself (component specs 15.8). */
const stackedClasses = "flex flex-col gap-6 py-4";

/** The classes of the map's cells' container in each layout. */
function gridOf(stacked: boolean, phone: boolean): string {
  if (stacked) return stackedClasses;
  return phone ? phoneGridClasses : gridClasses;
}

/**
 * Whether a panel this many pixels wide is narrower than `rem` rem, too narrow for the map; not
 * while it isn't measured.
 */
function tooNarrow(width: number, rem: number): boolean {
  const remPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return width > 0 && width < rem * remPixels;
}

/**
 * The lines and their ports, one SVG layer over the map that the pointer passes through, so a port
 * on a card's edge shows whole. They take the workflow canvas's line colour, and the text colour in
 * forced colours, so they read like the cards' borders there.
 */
function MapLines({ lines }: { readonly lines: readonly MapLine[] }) {
  return (
    <svg
      aria-hidden="true"
      data-map-lines=""
      className="pointer-events-none absolute top-0 left-0 size-px overflow-visible text-fg-muted forced-colors:text-[CanvasText]"
    >
      {lines.map((line, index) => (
        // Two lines can have the same path while the map isn't laid out, so the place is the key.
        <g key={index}>
          <path d={line.path} fill="none" stroke="currentColor" strokeWidth={1.5} />
          <Port at={line.from} />
          <Port at={line.to} />
        </g>
      ))}
    </svg>
  );
}

/** A ring with a dot in it, where a line meets a card's edge. */
function Port({ at }: { readonly at: { readonly x: number; readonly y: number } }) {
  return (
    <g data-map-port="">
      <circle
        cx={at.x}
        cy={at.y}
        r={4}
        className="fill-surface forced-colors:fill-[Canvas]"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <circle cx={at.x} cy={at.y} r={1.5} fill="currentColor" />
    </g>
  );
}

/** Each marked card's box within `map`, and the lines between them. */
function measureLines(map: HTMLElement): readonly MapLine[] {
  const centre = map.querySelector<HTMLElement>("[data-map-centre]");
  if (centre === null) return [];
  const cards = (side: MapSide) =>
    [...map.querySelectorAll<HTMLElement>(`[data-map-side="${side}"] [data-map-card]`)].map(
      (card) => boxWithin(card, map),
    );
  const side = (name: MapSide) => map.querySelector<HTMLElement>(`[data-map-side="${name}"]`);
  const bottom = (element: HTMLElement | null) => {
    if (element === null) return 0;
    const box = boxWithin(element, map);
    return box.y + box.height;
  };
  const centreBox = boxWithin(centre, map);
  const use = side("use");
  return mapLines(
    centreBox,
    { in: cards("in"), use: cards("use"), out: cards("out") },
    use === null
      ? undefined
      : {
          top: Math.max(centreBox.y + centreBox.height, bottom(side("in")), bottom(side("out"))),
          bottom: boxWithin(use, map).y,
        },
  );
}

/**
 * Where `element` sits within `root`, from the offsets, which the fit's transform doesn't change:
 * the lines are drawn inside the map, so they scale with it.
 */
function boxWithin(element: HTMLElement, root: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = element;
  while (at !== null && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

const sameLines = (a: readonly MapLine[], b: readonly MapLine[]) =>
  a.length === b.length && a.every((line, index) => line.path === b[index]?.path);
