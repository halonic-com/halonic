import type { SandboxStartCheck } from "@halonicjs/app";
import { type SandboxStart, useSandboxStart } from "@halonicjs/studio-feature-runs/api";
import type { ButtonUnavailable } from "@halonicjs/studio-kit";
import { type RefObject, useId, useRef } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { startsAgent } from "./agent-routine-notice.tsx";

/** What **Run now** and the can't-run Callout need (requirement `routines.page.cant-run`). */
export interface RunNowGate {
  readonly sandbox: SandboxStart;
  /** The `id` of the Callout's first line, which describes Run now while it is unavailable. */
  readonly cantRunId: string;
  /**
   * The `id` of the agent routine notice's sentence, which describes Run now and Runs on its own
   * while the routine starts an agent (`routines.page.agent-routine-notice`).
   */
  readonly agentNoticeId: string;
  /**
   * Run now's `unavailable` while the routine starts an agent, the sandbox can't start or its first
   * check hasn't answered; `undefined` while it can start.
   */
  readonly unavailable: ButtonUnavailable | undefined;
  /** Run now, which takes focus once **Check again** finds the sandbox ready. */
  readonly runNow: RefObject<HTMLButtonElement | null>;
}

/**
 * Whether the routine page's **Run now** can start a run. A routine that starts an agent can't, as
 * its notice says (HAL-17816). Otherwise it needs the sandbox only when what the routine starts
 * runs a program (`startsProgram`): a check that refuses makes it unavailable, and so does a first
 * check that hasn't answered, while the agent host starts (HAL-19614). The
 * routine stays on either way (checklist 3.4).
 */
export function useRunNowGate(
  host: RoutinesHost,
  routine: RoutineView | undefined,
  check: SandboxStartCheck | undefined,
): RunNowGate {
  const sandbox = useSandboxStart(
    check,
    host.runNow !== undefined && routine?.startsProgram === true,
  );
  const cantRunId = useId();
  const agentNoticeId = useId();
  const runNow = useRef<HTMLButtonElement>(null);
  return {
    sandbox,
    cantRunId,
    agentNoticeId,
    unavailable: unavailableFor(routine, sandbox, { cantRunId, agentNoticeId }),
    runNow,
  };
}

/** Run now's `unavailable`, pointing at the line that says why, or `undefined` when it can start. */
function unavailableFor(
  routine: RoutineView | undefined,
  sandbox: SandboxStart,
  ids: { readonly cantRunId: string; readonly agentNoticeId: string },
): ButtonUnavailable | undefined {
  if (startsAgent(routine)) return { reason: ids.agentNoticeId };
  return sandbox.blocksRun ? { reason: ids.cantRunId } : undefined;
}
