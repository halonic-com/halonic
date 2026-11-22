// The plugin page when the agent host stopped a plugin because the sandbox didn't work when it
// started: the computer passed the sandbox check, but the fence failed at the runner's start, so
// nothing of the plugin ran (A23; the "Runs" line design on HAL-1873 section 10, `rl-page-stopped`;
// microcopy 24.1 R15). The host keeps that in memory only to say it here: the next start goes
// through the sandbox as every start does, and never runs it without the sandbox.

import { Button, Callout, useToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { stoppedAtStart, triesAgainInSandbox, triesSandboxAgain } from "./page-text.ts";
import { CHECK_AGAIN } from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** Whether the agent host stopped a plugin because the sandbox didn't work when it started. */
export type PluginRunState = { readonly stopped: boolean };

/** The agent host's run state of a plugin, by its id (`AgentHostPluginRunStates` on the desktop). */
export interface PluginRunStates {
  /** Whether the host stopped `plugin`. It throws when the host can't say. */
  readonly runState: (plugin: string) => Promise<PluginRunState>;
  /** R15's **Check again**: the host forgets the stop, so the next use tries the sandbox again. */
  readonly checkAgain: (plugin: string) => Promise<PluginRunState>;
}

/** The props of {@link StoppedStatus}. */
export interface StoppedStatusProps {
  readonly id: string;
  readonly boxRef: RefObject<HTMLDivElement | null>;
  readonly plugin: InstalledPlugin;
  readonly runStates: PluginRunStates | undefined;
  /** View only (a phone, a served browser): R15 without **Check again**. */
  readonly viewOnly: boolean;
  /** Says that **Check again** failed, in the page's toast. */
  readonly onCheckAgainFailed: (error: unknown) => void;
  /** What the page shows when the plugin wasn't stopped, or the host can't say: R13 or the status box. */
  readonly children: ReactNode;
}

/**
 * R15 in place of the status box (and of R13), for a trusted plugin with a backend the agent host
 * stopped because the sandbox didn't work when it started (`plugins.plugin-page-stopped`). For any other plugin the
 * host isn't asked, and while it answers, or when it can't, the page shows `children`. **Check
 * again** asks the host to forget the stop, then shows `children`, moves focus to them and says in
 * a polite toast that the next run tries the sandbox again, since nothing was tried yet.
 */
export function StoppedStatus({
  id,
  boxRef,
  plugin,
  runStates,
  viewOnly,
  onCheckAgainFailed,
  children,
}: StoppedStatusProps) {
  const asks = plugin.status === "on" && plugin.manifest?.backend !== undefined;
  const { stopped, checkAgain } = useStopped(asks ? runStates : undefined, plugin.plugin);
  const [checked, setChecked] = useState(false);
  const toasts = useToastStore();
  useEffect(() => {
    if (checked && !stopped) boxRef.current?.focus();
  }, [checked, stopped, boxRef]);
  if (!stopped) return children;
  const onCheckAgain = () => {
    checkAgain().then((state) => {
      setChecked(true);
      if (state?.stopped === false) {
        toasts?.show({ tone: "info", title: triesSandboxAgain(plugin.name) });
      }
    }, onCheckAgainFailed);
  };
  return (
    <div id={id} ref={boxRef} tabIndex={-1} className="focus-ring rounded-sm">
      <Callout tone="danger" title={stoppedAtStart(plugin.name)}>
        <p>{triesAgainInSandbox(plugin.name)}</p>
        {viewOnly ? null : (
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onCheckAgain}>
              {CHECK_AGAIN}
            </Button>
          </div>
        )}
      </Callout>
    </div>
  );
}

/**
 * Reads the host's run state of `plugin` once, and drops the stop after **Check again**. An answer
 * that comes after the page went away, or after the plugin changed, is dropped; a host that can't
 * say shows no stop. Without `runStates` (the plugin was turned off or lost its trust) there is no
 * stop to show.
 */
function useStopped(runStates: PluginRunStates | undefined, plugin: string) {
  const [stopped, setStopped] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    if (runStates === undefined) {
      setStopped(false);
      return;
    }
    // Each read has its own flag: a late answer for the plugin as it was must not bring R15 back.
    let current = true;
    runStates.runState(plugin).then(
      (state) => {
        if (current && live.current) setStopped(state.stopped);
      },
      () => {
        // The host can't say: the page shows its status as it would without R15.
      },
    );
    return () => {
      current = false;
      live.current = false;
    };
  }, [runStates, plugin]);
  const checkAgain = useCallback(async () => {
    if (runStates === undefined) return undefined;
    const state = await runStates.checkAgain(plugin);
    if (!live.current) return undefined;
    setStopped(state.stopped);
    return state;
  }, [runStates, plugin]);
  return { stopped, checkAgain };
}
