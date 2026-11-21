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
  mapLines,
} from "./map-geometry.ts";

/** The map's natural width; the fit scales it to the panel from there. */
const MAP_WIDTH = "w-[56rem]";

/**
 * Narrower than this many rem, the fitted map's words get too small to read, so its sides stack
 * (C525-5). In rem, so larger text stacks it sooner.
 */
export const STACK_BELOW_REM = 36;

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
 * larger than its natural size and with no zoom buttons. In the gaps it draws the curved lines
 * from each side's cards to the centre card, each ending in a ring-and-dot port; the lines are a
 * picture only, hidden from screen readers and the pointer, so the cards and the add buttons stay
 * the only things to press. Its children are the grid's cells: left, centre and right in the first
 * row, what it can use across the second. The cards mark themselves with `data-map-centre` and,
 * inside an element with `data-map-side`, `data-map-card`.
 *
 * In a panel narrower than {@link STACK_BELOW_REM}, the map isn't fitted: its cells go one under
 * the other in their reading order, left, centre, below, right, at full size and without lines.
 */
export function MapFrame({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<Fit>();
  const [lines, setLines] = useState<readonly MapLine[]>([]);

  const fitNow = useCallback(() => {
    const room = panel.current;
    const content = map.current;
    if (room === null || content === null) return;
    if (tooNarrow(room.clientWidth)) {
      setFit({ stacked: true });
      return;
    }
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    const scale = fitScale(
      { width, height },
      { width: room.clientWidth, height: room.clientHeight },
    );
    setFit({
      stacked: false,
      scale,
      left: Math.max(0, (room.clientWidth - width * scale) / 2),
      top: Math.max(0, (room.clientHeight - height * scale) / 2),
    });
  }, []);

  const stacked = fit?.stacked === true;
  // Fit before the first paint, so the map never shows at the wrong size; and again once it stops
  // being stacked, since its natural width can be measured only then.
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
    <div ref={panel} data-map-panel="" className="relative size-full overflow-auto">
      <section
        ref={map}
        aria-label={label}
        data-map-stacked={stacked ? "" : undefined}
        className={stacked ? "w-full" : `absolute top-0 left-0 ${MAP_WIDTH} origin-top-left`}
        style={
          fit?.stacked === false
            ? { transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` }
            : undefined
        }
      >
        {!stacked && <MapLines lines={lines} />}
        {/* Lines need room between the sides, so the gaps are wider than a page's. Stacked, a flex
            column ignores the cells' grid places, so they follow the DOM's order. */}
        <div className={stacked ? stackedClasses : gridClasses}>
          <MapStacked value={stacked}>{children}</MapStacked>
        </div>
      </section>
    </div>
  );
}

const gridClasses = "grid grid-cols-[1fr_minmax(12rem,auto)_1fr] items-start gap-x-16 gap-y-10 p-6";
const stackedClasses = "flex flex-col gap-6 p-4";

/** Whether a panel this many pixels wide is too narrow for the map; not while it isn't measured. */
function tooNarrow(width: number): boolean {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return width > 0 && width < STACK_BELOW_REM * rem;
}

/**
 * The lines and their ports, one SVG layer over the map that the pointer passes through, so a port
 * on a card's edge shows whole.
 */
function MapLines({ lines }: { readonly lines: readonly MapLine[] }) {
  return (
    <svg
      aria-hidden="true"
      data-map-lines=""
      className="pointer-events-none absolute top-0 left-0 size-px overflow-visible text-border-strong"
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
        className="fill-surface"
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
  return mapLines(boxWithin(centre, map), {
    in: cards("in"),
    use: cards("use"),
    out: cards("out"),
  });
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
