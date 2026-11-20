import { Button, MaximiseIcon, PlusIcon } from "@halonicjs/studio-kit";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WorkflowView } from "../api.ts";
import { boxesFor } from "../canvas/auto-layout.ts";
import {
  type Box,
  boundsOf,
  fitView,
  panBy,
  panToShow,
  toCanvas,
  type View,
  zoomAround,
} from "../canvas/geometry.ts";
import type { StepMark } from "../start/run-strip.ts";
import { Arrows } from "./arrows.tsx";
import { CanvasToolbar, newStepPlace, TOOLBAR_GUTTER } from "./canvas-toolbar.tsx";
import { ConnectLine, ConnectPort, useConnectDrag } from "./connect-port.tsx";
import { pageWords } from "./page-words.ts";
import { PointOfLight } from "./point-of-light.tsx";
import { cardExtent, DOT_VAR, dotCentre, StepCard } from "./step-card.tsx";
import { waysOnFrom } from "./ways-on.ts";
import { MinusIcon } from "./zoom-icons.tsx";

/**
 * The room the zoom buttons take at the left edge of the canvas, in pixels: their width and the
 * margin round them. A fit leaves it free, so no card sits under them.
 */
const ZOOM_GUTTER = 56;

/** What a viewport is taken to measure where the browser can't say (a test, a hidden tab). */
const FALLBACK_VIEWPORT = { width: 800, height: 600 };

/**
 * The workflow's canvas (`workflows.canvas`): step cards and arrows on a surface that pans by
 * dragging the background and zooms with the wheel or the buttons. It fits all steps once, when it
 * opens; after that the workflow can change under it and the zoom and pan stay (D9). The page
 * keeps the view (`saved`, `onView`), so it also stays across a visit to Configuration, and when a problem's link opens a card (kept
 * on purpose, D9). To open a
 * different workflow, give it a new `key`.
 */
export function WorkflowCanvas({
  workflow,
  selectedStep,
  failedStep,
  route,
  marks,
  active,
  saved,
  onView,
  onSelectStep,
  edit,
  picked,
  docked = false,
  onBackgroundClick,
}: {
  readonly workflow: WorkflowView;
  /** The zoom and pan the canvas had when it was last shown; absent the first time. */
  readonly saved?: View | undefined;
  /** Told each time the zoom or pan changes, so the page can hand it back on the next mount. */
  readonly onView?: ((view: View) => void) | undefined;
  /** The card that starts picked, when the person came from a problem's link. */
  readonly selectedStep?: string | undefined;
  /** The step the shown run failed in, ringed with its Failed chip. */
  readonly failedStep?: string | undefined;
  /** The steps the shown run went through, in order; the arrows it went along are drawn blue. */
  readonly route?: readonly string[] | undefined;
  /** How each step the shown run reached stands: its status dot. */
  readonly marks?: Readonly<Record<string, StepMark>> | undefined;
  /** The step the shown run is in now: the point of light rests on its dot. */
  readonly active?: string | undefined;
  /** Told when a card is picked, so the page can dock what it has to say about the step. */
  readonly onSelectStep?: ((stepId: string) => void) | undefined;
  /** How the toolbar changes the workflow; absent where it can't, so the canvas has no toolbar. */
  readonly edit?: CanvasEdit | undefined;
  /**
   * The step the page has picked. When it changes (the step's card closed), the selection follows;
   * absent, the canvas keeps its own.
   */
  readonly picked?: string | undefined;
  /** A card is docked at the right: a step picked while it is pans clear of it. */
  readonly docked?: boolean | undefined;
  /** A click on the background, not a drag: the page closes the picked step's card. */
  readonly onBackgroundClick?: (() => void) | undefined;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const [view, setView] = useState<View>(saved ?? { zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => onView?.(view), [view, onView]);
  const [selected, setSelected] = useState<string | undefined>(selectedStep);
  // Only a change of the page's pick moves the selection, so a card a problem's link selected stays.
  const lastPicked = useRef(picked);
  useEffect(() => {
    if (picked === lastPicked.current) return;
    lastPicked.current = picked;
    setSelected(picked);
  }, [picked]);
  // Where a press on the background started, to tell a click from a pan.
  const pressedAt = useRef<{ x: number; y: number } | undefined>(undefined);

  const boxes = useMemo(
    () =>
      boxesFor(
        workflow.steps.map((step) => step.id),
        workflow.arrows,
        workflow.initial,
        workflow.layout,
      ),
    [workflow],
  );

  const activeBox = active === undefined ? undefined : boxes.get(active);
  const activeMark = active === undefined ? undefined : marks?.[active];
  const activeDot =
    activeBox === undefined || activeMark === undefined
      ? undefined
      : { box: activeBox, mark: activeMark };

  const size = () => ({
    width: viewport.current?.clientWidth || FALLBACK_VIEWPORT.width,
    height: viewport.current?.clientHeight || FALLBACK_VIEWPORT.height,
  });
  // With a toolbar, a fit leaves its row at the top free too.
  const top = edit === undefined ? 0 : TOOLBAR_GUTTER;
  const fitAll = () => {
    const { width, height } = size();
    const room = { width: width - ZOOM_GUTTER, height: height - top };
    const fitted = fitView(boundsOf([...boxes.values()]), room);
    setView({ ...fitted, pan: { x: fitted.pan.x + ZOOM_GUTTER, y: fitted.pan.y + top } });
  };
  // Auto layout fits once the steps have their new places (flow-workflows 4.2).
  const fitOnMove = useRef(false);
  useLayoutEffect(() => {
    if (!fitOnMove.current) return;
    fitOnMove.current = false;
    fitAll();
  }, [boxes]);
  const addStep = async (type: "task" | "wait") => {
    const id = await edit?.addStep(type, newStepPlace(boxes.values()));
    if (id === undefined) return;
    setSelected(id);
    onSelectStep?.(id);
  };
  const autoLayout = () => {
    // With no places saved there is nothing to move, so it only fits.
    if (Object.keys(workflow.layout).length === 0) return fitAll();
    fitOnMove.current = true;
    void edit?.autoLayout().then((moved) => {
      if (!moved) fitOnMove.current = false;
    });
  };
  // A drag from a step's port onto another adds an arrow (flow-workflows 4.3). The canvas point
  // under the pointer undoes the zoom and pan from the viewport's top left.
  const pointAt = (event: { readonly clientX: number; readonly clientY: number }) => {
    const rect = viewport.current?.getBoundingClientRect();
    return toCanvas(view, {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  };
  const connect = edit?.connect;
  const connecting = useConnectDrag(
    boxes,
    pointAt,
    connect && ((from, to) => void connect(from, to)),
  );
  // Fit once, before the first paint, so the canvas never shows its steps in the wrong place. A
  // view the page kept stays as it was.
  useLayoutEffect(() => {
    if (saved === undefined) fitAll();
  }, []);

  const centre = () => ({ x: size().width / 2, y: size().height / 2 });
  // Where a card is shown when it's brought into view: clear of the zoom buttons, like a fit.
  const room = () => {
    const { width, height } = size();
    return { x: ZOOM_GUTTER, y: 0, width: width - ZOOM_GUTTER, height };
  };
  // A card reached with the keyboard pans into view, so focus never lands out of sight
  // (`workflows.canvas.focus-in-view`). A click doesn't pan: the card would move from under the
  // pointer before the click lands.
  const showFocused = (event: React.FocusEvent<HTMLButtonElement>, card: Box) => {
    if (!event.currentTarget.matches(":focus-visible")) return;
    setView((now) => panToShow(now, card, room()));
  };
  // The page docks a picked step's card at the right, which narrows the canvas. Once the card has
  // opened or been replaced, the click has landed, so the step pans just clear of it, at the same
  // zoom (`workflows.page.step-card`).
  useLayoutEffect(() => {
    if (picked === undefined || !docked) return;
    const box = boxes.get(picked);
    if (box === undefined) return;
    setView((now) => panToShow(now, cardExtent(box, picked === workflow.initial), room()));
  }, [picked, docked]);
  return (
    // A group, not an application: the canvas has no keys of its own, so a screen reader stays in
    // its reading mode here (a11y check E3).
    // biome-ignore lint/a11y/useSemanticElements: a canvas holds cards, not form fields, so not a fieldset.
    <div
      ref={viewport}
      role="group"
      aria-label={pageWords.canvas}
      // `overflow-clip`, not `overflow-hidden`: a box that hides its overflow still scrolls when
      // focus moves to a card outside it, and that shift is lost to the zoom and pan.
      className="relative min-h-80 flex-1 touch-none overflow-clip bg-canvas-grid"
      onPointerDown={(event) => {
        // A press on a card, a button or the controls around them (the toolbar's padding and
        // divider, the gaps between the zoom buttons) is theirs: it is neither a pan nor a click
        // on the background, and capturing it here would steal a button's click.
        if ((event.target as Element).closest("button, [data-canvas-controls]") !== null) return;
        drag.current = { x: event.clientX, y: event.clientY };
        pressedAt.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current === undefined) return;
        const delta = { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y };
        drag.current = { x: event.clientX, y: event.clientY };
        setView((now) => panBy(now, delta));
      }}
      onPointerUp={(event) => {
        drag.current = undefined;
        const from = pressedAt.current;
        pressedAt.current = undefined;
        if (from === undefined || !isClick(from, event)) return;
        setSelected(undefined);
        onBackgroundClick?.();
      }}
      onPointerCancel={() => {
        drag.current = undefined;
        pressedAt.current = undefined;
      }}
      onWheel={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setView((now) => zoomAround(now, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
      }}
    >
      {edit !== undefined && (
        <CanvasToolbar onAddStep={(type) => void addStep(type)} onAutoLayout={autoLayout} />
      )}
      <div
        data-testid="canvas-surface"
        style={{
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
          transformOrigin: "0 0",
        }}
        className="absolute left-0 top-0"
      >
        <Arrows arrows={workflow.arrows} boxes={boxes} route={route} />
        {workflow.steps.map((step) => {
          const box = boxes.get(step.id);
          const first = step.id === workflow.initial;
          // An end step has no way on, so no port to drag one from.
          const port = step.type === "final" ? undefined : connecting.portOf?.(step.id);
          return box === undefined ? null : (
            <Fragment key={step.id}>
              <StepCard
                step={step}
                box={box}
                first={first}
                selected={selected === step.id}
                failed={failedStep === step.id}
                mark={marks?.[step.id]}
                focusOnMount={selectedStep === step.id}
                waysOn={waysOnFrom(step.id, workflow, boxes)}
                onSelect={() => {
                  setSelected(step.id);
                  onSelectStep?.(step.id);
                }}
                onFocus={(event) => showFocused(event, cardExtent(box, first))}
                connectTarget={connecting.targetOf(step.id)}
              />
              {port !== undefined && <ConnectPort stepId={step.id} box={box} handlers={port} />}
            </Fragment>
          );
        })}
        {connecting.connecting !== undefined && (
          <ConnectLine connecting={connecting.connecting} boxes={boxes} />
        )}
        <PointOfLight
          target={activeDot === undefined ? undefined : dotCentre(activeDot.box)}
          color={activeDot === undefined ? "" : DOT_VAR[activeDot.mark]}
        />
      </div>
      <div data-canvas-controls className="absolute bottom-3 left-3 flex flex-col gap-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<PlusIcon />}
          label={pageWords.zoomIn}
          onClick={() => setView((now) => zoomAround(now, 1.25, centre()))}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<MinusIcon />}
          label={pageWords.zoomOut}
          onClick={() => setView((now) => zoomAround(now, 0.8, centre()))}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<MaximiseIcon />}
          label={pageWords.fit}
          onClick={fitAll}
        />
      </div>
    </div>
  );
}

/** What the canvas's toolbar asks of the page. */
export interface CanvasEdit {
  /** Adds a step of the kind at the place; resolves to its id, or `undefined` when it wasn't added. */
  readonly addStep: (
    type: "task" | "wait",
    at: { readonly x: number; readonly y: number },
  ) => Promise<string | undefined>;
  /** Forgets the steps' places, so each takes the automatic one; resolves to whether it did. */
  readonly autoLayout: () => Promise<boolean>;
  /**
   * Adds an arrow on done from one step to another, after its other arrows; resolves to whether it
   * did. Absent where the host can't change arrows, so the cards have no ports.
   */
  readonly connect?: ((from: string, to: string) => Promise<boolean>) | undefined;
}

/** How far the pointer may move between press and release for a click, in px; further is a pan. */
const CLICK_SLOP = 4;

/** Whether a press and its release were a click, not a drag. */
function isClick(from: { x: number; y: number }, to: { clientX: number; clientY: number }) {
  return Math.hypot(to.clientX - from.x, to.clientY - from.y) <= CLICK_SLOP;
}
