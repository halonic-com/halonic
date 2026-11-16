import type { HarnessStartCause } from "@halonicjs/events";
import type { Harness, Sandbox, SandboxSession } from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import { unlessStopped } from "./unless-stopped.ts";

// What the engine can tell about why a sandbox or harness program didn't
// start, asked after the start failed (requirement `engine.run-harness-failures`).

/**
 * The answer of `ask`, or `undefined` when it throws. The engine has no
 * timers, so a question that never answers ends only with `stop`.
 *
 * @throws `stop.reason` when `stop` is told to stop first
 */
async function bestEffort<T>(stop: StopSignal, ask: () => Promise<T>): Promise<T | undefined> {
  try {
    return await unlessStopped(stop, ask());
  } catch {
    stop.throwIfStopped();
    return undefined;
  }
}

/**
 * Why a sandbox that passed its check didn't open: the check's reason code,
 * when asking again now says it can't start. When it still passes, or
 * doesn't answer, the engine doesn't know, and says nothing.
 */
export async function sandboxWhyOf(
  stop: StopSignal,
  sandbox: Sandbox,
): Promise<{ sandboxReason?: string }> {
  const check = await bestEffort(stop, () => sandbox.check());
  return check !== undefined && !check.ok ? { sandboxReason: check.reason } : {};
}

/**
 * Why a harness program didn't start, when `detect()` says so for the
 * agent's own settings folder: `not-installed` for a program that isn't
 * found, `signed-out` for one no one is signed in to. Anything else, or no
 * answer, is unknown: the cause is left out.
 */
export async function harnessCauseOf(
  stop: StopSignal,
  harness: Harness,
  session: SandboxSession,
): Promise<{ harnessCause?: HarnessStartCause }> {
  const { settingsFolder } = session.profile;
  const found = await bestEffort(stop, () =>
    harness.detect(settingsFolder === null ? undefined : { settingsFolder }),
  );
  if (found?.status === "missing") return { harnessCause: "not-installed" };
  if (found?.status === "signed-out") return { harnessCause: "signed-out" };
  return {};
}
