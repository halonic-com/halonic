import { CloseIcon, useTooltip } from "@halonicjs/studio-kit";
import type { PointerEvent, ReactNode } from "react";
import { currentLocation, type TabLocation, type WindowTab } from "./tab-set.ts";

/** Props for {@link WindowTabView}. */
export interface WindowTabViewProps {
  readonly tab: WindowTab;
  readonly active: boolean;
  readonly focusable: boolean;
  readonly icon: ReactNode;
  readonly needsYou: boolean;
  /** The places above the tab's place, outermost first. */
  readonly parents: readonly TabLocation[];
  readonly elementRef: (element: HTMLDivElement | null) => void;
  readonly onFocus: () => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onActivate: () => void;
  readonly onClose: () => void;
}

/**
 * An inactive tab has no fill, so the frame shows through; hovered, it takes `bg-tab-hover`. A
 * 1px line separates two inactive tabs, hidden next to the active or a hovered tab. The active
 * tab is the `surface` with a border on three sides, 1px taller so it covers the panel's top
 * border, with the 2px halo line along its top and two 8px curves at its foot where it joins the
 * panel.
 */
const tabClasses = {
  common: [
    "group relative flex w-50 min-w-24 shrink cursor-default select-none items-center gap-2 rounded-t-sm",
    "ps-3 pe-1.5 text-small outline-none focus-ring-inset",
  ].join(" "),
  inactive: [
    "h-[34px] text-fg-muted hover:bg-tab-hover hover:text-fg",
    "not-first:before:absolute not-first:before:start-0 not-first:before:h-4 not-first:before:w-px",
    "not-first:before:bg-border-strong hover:before:hidden [:hover+&]:before:hidden",
    "[[aria-selected=true]+&]:before:hidden",
  ].join(" "),
  active: [
    "z-10 -mb-px h-[35px] border border-b-0 border-border bg-surface font-medium text-fg",
    "forced-colors:border-[CanvasText]",
  ].join(" "),
} as const;

/** The two 8px inward curves at the active tab's foot, filled with `surface` outside a circle. */
const footCurve = "pointer-events-none absolute bottom-0 size-2";
const footCurves = {
  start: `${footCurve} -start-2 bg-[radial-gradient(circle_at_0_0,transparent_8px,var(--color-surface)_8px)]`,
  end: `${footCurve} -end-2 bg-[radial-gradient(circle_at_100%_0,transparent_8px,var(--color-surface)_8px)]`,
} as const;

/**
 * One window tab in the strip. Its tooltip is its full path, "Workflows / Support reply" (component
 * specs 24.5), drawn inside the tab so the strip's dividers still find their neighbours. With no
 * places above it, the path is the tab's title, which already names it, so it doesn't describe it.
 */
export function WindowTabView(props: WindowTabViewProps) {
  const { tab, active, focusable, icon, needsYou } = props;
  const location = currentLocation(tab);
  const name = [location.title, location.kind, needsYou ? "needs you" : undefined]
    .filter((part) => part !== undefined)
    .join(", ");
  const tooltip = useTooltip({
    text: [...props.parents, location].map((part) => part.title).join(" / "),
    isName: props.parents.length === 0,
  });
  const anchor = tooltip.anchor;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tablist takes the keys for every tab (Enter, Space, Delete)
    <div
      ref={(element) => {
        props.elementRef(element);
        anchor.ref(element);
      }}
      role="tab"
      aria-selected={active}
      aria-label={name}
      {...tooltip.trigger}
      tabIndex={focusable ? 0 : -1}
      data-tab-id={tab.id}
      className={`${tabClasses.common} ${active ? tabClasses.active : tabClasses.inactive}`}
      onFocus={(event) => {
        props.onFocus();
        anchor.onFocus(event);
      }}
      onBlur={anchor.onBlur}
      onKeyDown={anchor.onKeyDown}
      onPointerEnter={anchor.onPointerEnter}
      onPointerLeave={anchor.onPointerLeave}
      onPointerDown={(event) => {
        anchor.onPointerDown();
        props.onPointerDown(event);
      }}
      onClick={props.onActivate}
    >
      {active ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 -top-px h-0.5 rounded-t-sm bg-halo-line forced-colors:bg-[Highlight]"
          />
          <span aria-hidden="true" className={footCurves.start} />
          <span aria-hidden="true" className={footCurves.end} />
        </>
      ) : null}
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className={`inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${active ? "text-accent" : ""}`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{location.title}</span>
      {needsYou ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-warning forced-color-adjust-none"
        />
      ) : null}
      <CloseTabButton
        title={location.title}
        shown={active}
        onClose={(event) => {
          event.stopPropagation();
          props.onClose();
        }}
      />
      {tooltip.popover}
    </div>
  );
}

interface CloseTabButtonProps {
  readonly title: string;
  /** Always shown on the active tab; on the others only on hover and keyboard focus. */
  readonly shown: boolean;
  readonly onClose: (event: { stopPropagation(): void }) => void;
}

/**
 * The 20px ✕. It keeps its place on every tab, shown or not, so nothing moves on hover. It's not a
 * Tab stop of its own: the strip is one, and Delete closes the focused tab. A click doesn't move
 * the focus to it, so the focus doesn't fall to the page when the button goes with its tab.
 *
 * A `tab`'s children are presentational, so screen readers don't announce the button's name;
 * Delete is the way to close a tab for them.
 */
function CloseTabButton({ title, shown, onClose }: CloseTabButtonProps) {
  const visibility = shown ? "" : "invisible group-hover:visible group-focus-visible:visible";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Close ${title}`}
      className={`inline-grid size-5 shrink-0 place-items-center rounded-xs text-fg-muted hover:bg-surface-muted hover:text-fg ${visibility}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClose}
    >
      <span aria-hidden="true" className="size-icon-sm *:size-full">
        <CloseIcon />
      </span>
    </button>
  );
}
