import { InfoIcon } from "@halonicjs/studio-kit";
import { useCallback, useSyncExternalStore } from "react";
import type { ShellEngine } from "./engine-connection.ts";

/** Props for {@link EngineLine}. */
export interface EngineLineProps {
  readonly engine: ShellEngine;
}

/**
 * The one line that says the engine stopped answering, "The engine isn't answering. Showing what
 * it said last.", worded for where the Studio runs (microcopy 2). The frame shows it once, under
 * the toolbar, never once per section, while `engine.stale`; pages keep what they showed. It isn't
 * a live region: the engine announces the change once (VK T2-F30, state coverage D1).
 */
export function EngineLine({ engine }: EngineLineProps) {
  const stale = useEngineStale(engine);
  if (!stale) {
    return null;
  }
  return (
    <p className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2 text-small text-fg-muted">
      <span aria-hidden="true" className="size-icon-sm shrink-0 *:size-full">
        <InfoIcon />
      </span>
      {engine.words.showingLast}
    </p>
  );
}

/** `engine.stale`, kept up to date with every `engine.connection` event. */
function useEngineStale(engine: ShellEngine): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => engine.on("engine.connection", onChange),
    [engine],
  );
  return useSyncExternalStore(subscribe, () => engine.stale);
}
