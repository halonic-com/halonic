import { useRef, useState } from "react";
import { type Box, boxAt, type Point } from "../canvas/geometry.ts";
import { pageWords } from "./page-words.ts";

/** A drag from a step's output port: where it started, where the pointer is and the step under it. */
export interface Connecting {
  readonly from: string;
  readonly at: Point;
  /** Another step under the pointer, which a drop connects to; never the step dragged from. */
  readonly over: string | undefined;
}

/** How the canvas outlines a step during a drag from a port: a drop can land on it, or will. */
export type ConnectTarget = "can" | "over";

/** The pointer handlers that make an element an output port. */
export type PortHandlers = Pick<
  React.HTMLAttributes<HTMLElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

/**
 * Dragging from a step's output port onto another step (`workflows.canvas.drag-to-connect`,
 * flow-workflows 4.3). `pointAt` turns a pointer event into a canvas point; `connect` is told the
 * two steps on a drop, and is absent where the canvas can't add arrows, so there are no ports.
 * The port holds the pointer for the whole drag, so the canvas under it never pans.
 */
export function useConnectDrag(
  boxes: ReadonlyMap<string, Box>,
  pointAt: (event: { readonly clientX: number; readonly clientY: number }) => Point,
  connect: ((from: string, to: string) => void) | undefined,
) {
  const [connecting, setConnecting] = useState<Connecting | undefined>();
  // The step a drag started from, read by the move and release handlers of the same drag.
  const draggingFrom = useRef<string | undefined>(undefined);

  const where = (from: string, event: React.PointerEvent): Connecting => {
    const at = pointAt(event);
    const under = boxAt(boxes, at);
    return { from, at, over: under === from ? undefined : under };
  };
  const end = () => {
    draggingFrom.current = undefined;
    setConnecting(undefined);
  };
  const portOf = (from: string): PortHandlers => ({
    onPointerDown: (event) => {
      // The press is the port's: not a pan, and not a click on the background.
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      draggingFrom.current = from;
      setConnecting(where(from, event));
    },
    onPointerMove: (event) => {
      if (draggingFrom.current !== from) return;
      setConnecting(where(from, event));
    },
    onPointerUp: (event) => {
      if (draggingFrom.current !== from) return;
      event.stopPropagation();
      const { over } = where(from, event);
      end();
      if (over !== undefined) connect?.(from, over);
    },
    onPointerCancel: end,
  });
  const targetOf = (stepId: string): ConnectTarget | undefined => {
    if (connecting === undefined || stepId === connecting.from) return undefined;
    return stepId === connecting.over ? "over" : "can";
  };
  return {
    connecting,
    /** The port handlers for a step; `undefined` where the canvas can't add arrows. */
    portOf: connect === undefined ? undefined : portOf,
    targetOf,
  };
}

/** The port's size, in canvas units: a 12px ring round a 4px dot. */
const PORT = 12;

/** Where a card's output port sits: the middle of its bottom edge. */
export function portCentre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height };
}

/**
 * A step's output port (flow-workflows 4.3): a ring with a dot at the middle of the card's bottom
 * edge, to drag an arrow from. For a pointer only: the step card's **Go to…** and **Add** do the
 * same from the keyboard, so a screen reader doesn't meet it.
 */
export function ConnectPort({
  stepId,
  box,
  handlers,
}: {
  readonly stepId: string;
  readonly box: Box;
  readonly handlers: PortHandlers;
}) {
  const centre = portCentre(box);
  return (
    <span
      {...handlers}
      aria-hidden="true"
      data-connect-port={stepId}
      title={pageWords.connectHint}
      style={{ left: centre.x - PORT / 2, top: centre.y - PORT / 2, width: PORT, height: PORT }}
      className="absolute grid cursor-crosshair place-items-center rounded-full border-2 border-accent bg-surface"
    >
      <span className="size-1 rounded-full bg-accent" />
    </span>
  );
}

/**
 * The line a drag from a port draws: dashed, from the port to the pointer, so the person sees
 * what a drop would join.
 */
export function ConnectLine({
  connecting,
  boxes,
}: {
  readonly connecting: Connecting;
  readonly boxes: ReadonlyMap<string, Box>;
}) {
  const box = boxes.get(connecting.from);
  if (box === undefined) return null;
  const start = portCentre(box);
  return (
    <svg
      aria-hidden="true"
      data-testid="connect-line"
      className="pointer-events-none absolute left-0 top-0 size-px overflow-visible text-accent"
    >
      <line
        x1={start.x}
        y1={start.y}
        x2={connecting.at.x}
        y2={connecting.at.y}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
    </svg>
  );
}
