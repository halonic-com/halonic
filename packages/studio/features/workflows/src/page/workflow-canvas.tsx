import { Button } from "@halonicjs/studio-kit";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WorkflowView } from "../api.ts";
import { boxesFor } from "../canvas/auto-layout.ts";
import { boundsOf, fitView, panBy, type View, zoomAround } from "../canvas/geometry.ts";
import type { StepMark } from "../start/run-strip.ts";
import { Arrows } from "./arrows.tsx";
import { pageWords } from "./page-words.ts";
import { PointOfLight } from "./point-of-light.tsx";
import { DOT_VAR, dotCentre, StepCard } from "./step-card.tsx";

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
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const [view, setView] = useState<View>(saved ?? { zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => onView?.(view), [view, onView]);
  const [selected, setSelected] = useState<string | undefined>(selectedStep);

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
  const fitAll = () => setView(fitView(boundsOf([...boxes.values()]), size()));
  // Fit once, before the first paint, so the canvas never shows its steps in the wrong place. A
  // view the page kept stays as it was.
  useLayoutEffect(() => {
    if (saved === undefined) fitAll();
  }, []);

  const centre = () => ({ x: size().width / 2, y: size().height / 2 });
  return (
    <div
      ref={viewport}
      role="application"
      aria-label={pageWords.canvas}
      className="relative min-h-80 flex-1 touch-none overflow-hidden bg-canvas-grid"
      onPointerDown={(event) => {
        // A press on a card or a button is theirs: capturing it here would steal their click.
        if ((event.target as Element).closest("button") !== null) return;
        drag.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current === undefined) return;
        const delta = { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y };
        drag.current = { x: event.clientX, y: event.clientY };
        setView((now) => panBy(now, delta));
      }}
      onPointerUp={() => {
        drag.current = undefined;
      }}
      onPointerCancel={() => {
        drag.current = undefined;
      }}
      onWheel={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setView((now) => zoomAround(now, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
      }}
    >
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
          return box === undefined ? null : (
            <StepCard
              key={step.id}
              step={step}
              box={box}
              first={step.id === workflow.initial}
              selected={selected === step.id}
              failed={failedStep === step.id}
              mark={marks?.[step.id]}
              focusOnMount={selectedStep === step.id}
              onSelect={() => {
                setSelected(step.id);
                onSelectStep?.(step.id);
              }}
            />
          );
        })}
        <PointOfLight
          target={activeDot === undefined ? undefined : dotCentre(activeDot.box)}
          color={activeDot === undefined ? "" : DOT_VAR[activeDot.mark]}
        />
      </div>
      <div className="absolute bottom-3 left-3 flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setView((now) => zoomAround(now, 1.25, centre()))}
        >
          {pageWords.zoomIn}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setView((now) => zoomAround(now, 0.8, centre()))}
        >
          {pageWords.zoomOut}
        </Button>
        <Button variant="secondary" size="sm" onClick={fitAll}>
          {pageWords.fit}
        </Button>
      </div>
    </div>
  );
}
