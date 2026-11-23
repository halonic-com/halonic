import { loadView, type ViewRef } from "@halonicjs/studio-shell";
import { type ComponentType, useEffect, useState } from "react";
import type { RoutineRunAgentsProps } from "../run-agents-api.ts";

/** Props for {@link RunAgentsView}. */
export interface RunAgentsViewProps extends RoutineRunAgentsProps {
  /** The view `RoutineRunAgentsService` gives; without it (no Agents feature) nothing is drawn. */
  readonly view: ViewRef | undefined;
}

/**
 * The view another feature gives about the agents **Run now** starts, such as the confirm-again
 * Callout (`routines.page.confirm-again`). Nothing is drawn while it loads, if it can't load, or
 * for a routine that runs no agent in a program of its own: it only adds a note, and Run now works
 * without it.
 */
export function RunAgentsView({ view, ...props }: RunAgentsViewProps) {
  const [View, setView] = useState<ComponentType<RoutineRunAgentsProps> | null>(null);
  useEffect(() => {
    if (view === undefined) return;
    let current = true;
    loadView<ComponentType<RoutineRunAgentsProps>>(view).then(
      (loaded) => current && setView(() => loaded),
      (error: unknown) =>
        console.error("Couldn't load the note about the routine's agents.", error),
    );
    return () => {
      current = false;
    };
  }, [view]);
  if (View === null || props.agents.length === 0) return null;
  return <View {...props} />;
}
