import { type FocusEvent, type RefObject, useLayoutEffect, useRef } from "react";
import { EmptyState, type EmptyStateProps } from "../empty-state/empty-state.tsx";

/** The Empty state's props, without the title's ref: the List holds it, to move focus there. */
export type ListEmpty = EmptyStateProps extends infer Props
  ? Props extends EmptyStateProps
    ? Omit<Props, "titleRef">
    : never
  : never;

/** The level under the List's own heading, so the Empty state's title doesn't skip one. */
const levelBelow = { 2: 3, 3: 4, 4: 4 } as const;

/** What the List passes to its Empty state. */
export interface EmptyListProps {
  readonly empty: ListEmpty;
  /** The List's heading level, or none when the List is named by a label. */
  readonly listHeadingLevel: 2 | 3 | 4 | undefined;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
}

/** The List's `empty` prop, drawn in place of the box. */
export function EmptyList({ empty, listHeadingLevel, titleRef }: EmptyListProps) {
  const headingLevel =
    empty.headingLevel ?? (listHeadingLevel === undefined ? 2 : levelBelow[listHeadingLevel]);
  return <EmptyState {...empty} headingLevel={headingLevel} titleRef={titleRef} />;
}

/**
 * When the last row goes while focus is in the grid, focus moves to the Empty state's title
 * (component specs 23 A2), never to `body`. Focus somewhere else stays where it is.
 */
export function useFocusOnEmpty(isEmpty: boolean) {
  const focusInside = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (!isEmpty || !focusInside.current) {
      return;
    }
    focusInside.current = false;
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      titleRef.current?.focus();
    }
  }, [isEmpty]);

  return {
    titleRef,
    onFocus: () => {
      focusInside.current = true;
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      // No `relatedTarget` is also what some browsers report while they remove the focused row,
      // so only a move to a known element counts as leaving.
      const to = event.relatedTarget;
      if (to !== null) {
        focusInside.current = event.currentTarget.contains(to);
      }
    },
  };
}
