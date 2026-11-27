import { InfoIcon } from "@halonicjs/studio-kit";
import { useCallback, useSyncExternalStore } from "react";
import { welcomeOpenWords } from "../welcome/welcome-open-words.ts";
import type { ShellEngine } from "./engine-connection.ts";
import type { EngineStarting } from "./engine-starting.ts";

/** Props for {@link EngineLine}. */
export interface EngineLineProps {
  readonly engine: ShellEngine;
  /** Whether the shown workspace's engine still starts; left out, it doesn't. */
  readonly starting?: EngineStarting | undefined;
}

/**
 * The one line that says the engine stopped answering, "The engine isn't answering. Showing what
 * it said last.", worded for where the Studio runs (microcopy 2). The frame shows it once, at
 * the top of the panel, never once per section, while `engine.stale`; pages keep what they showed. It isn't
 * a live region: the engine announces the change once (VK T2-F30, state coverage D1).
 * While the shown workspace's engine starts, as when a workspace shows before its engine
 * (HAL-19965), the line says "Starting the engine…", the Recent row's approved step (HAL-19613).
 */
export function EngineLine({ engine, starting }: EngineLineProps) {
  const stale = useEngineStale(engine);
  const startingNow = useStarting(starting);
  const line = lineOf(engine, stale, startingNow);
  if (line === undefined) {
    return null;
  }
  return (
    <p className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2 text-small text-fg-muted">
      <span aria-hidden="true" className="size-icon-sm shrink-0 *:size-full">
        <InfoIcon />
      </span>
      {line}
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

/** Whether the workspace's engine still starts, kept up to date until it has started. */
function useStarting(starting: EngineStarting | undefined): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => starting?.subscribe(onChange) ?? (() => undefined),
    [starting],
  );
  return useSyncExternalStore(subscribe, () => starting?.starting ?? false);
}

function lineOf(engine: ShellEngine, stale: boolean, starting: boolean): string | undefined {
  if (stale) return engine.words.showingLast;
  if (starting) return welcomeOpenWords.steps.engine;
  return undefined;
}
