import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSandboxHost } from "../api.ts";
import {
  afterResult,
  checkedAtLabel,
  type SandboxCheckFacts,
  type SandboxFacts,
  type SandboxOutcome,
  type SandboxRunning,
  SETUP_TIME_LIMIT_MS,
} from "./sandbox-state.ts";
import * as text from "./sandbox-text.ts";

/** What the section can do: each starts only when the person presses its button. */
export interface AgentSandboxControls {
  readonly facts: SandboxFacts;
  /** Set up, or repair when the check says part of it is missing. */
  readonly setUp: () => void;
  readonly remove: () => void;
  readonly checkAgain: () => void;
}

/**
 * The state of Settings › Agent sandbox over a host (`settings.agent-sandbox-section`): the host's
 * check when the section opens, a setup or removal only on a press, and the 3-minute time limit,
 * which says so and leaves the command running (SB3).
 */
export function useAgentSandbox(
  host: AgentSandboxHost | undefined,
  place: SandboxFacts["place"],
  announce: (line: string) => void,
): AgentSandboxControls {
  const [check, setCheck] = useState<SandboxCheckFacts>({
    state: "unknown",
    reason: "checking.",
  });
  const [running, setRunning] = useState<SandboxRunning | null>(null);
  const [outcome, setOutcome] = useState<SandboxOutcome | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  // The container passes a new `announce` on every render; the effects must not restart for it.
  const announceRef = useRef(announce);
  announceRef.current = announce;
  // The poll of the command that runs; a new press or leaving Settings stops following it.
  const following = useRef<AbortController | null>(null);
  // Each press gets a number, so a result that arrives after the time limit still counts, but one
  // from an earlier press doesn't overwrite a newer one.
  const press = useRef(0);

  const readCheck = useCallback(async (): Promise<SandboxCheckFacts> => {
    if (host === undefined) return { state: "unknown", reason: "no agent host is running." };
    try {
      return await host.check();
    } catch (error) {
      return { state: "unknown", reason: `${reasonOf(error)}.` };
    }
  }, [host]);

  const run = useCallback(
    async (verb: SandboxRunning["verb"], joining = false) => {
      if (host === undefined || busy.current) return;
      busy.current = true;
      const mine = ++press.current;
      following.current?.abort();
      const follow = new AbortController();
      following.current = follow;
      const current = () => alive.current && press.current === mine;
      setOutcome(null);
      setRunning({ verb, step: joining ? "running" : "elevating" });
      const timer =
        verb === "remove"
          ? undefined
          : setTimeout(() => {
              if (!current()) return;
              // The command isn't stopped: a Try again joins it in the host.
              busy.current = false;
              setRunning(null);
              setOutcome({ kind: "setup", how: "timed-out", repairing: verb === "repair" });
            }, SETUP_TIME_LIMIT_MS);
      const ended = await runCommand(host, verb, joining, follow.signal, readCheck, () => {
        clearTimeout(timer);
        if (current()) setRunning({ verb, step: "checking" });
      });
      clearTimeout(timer);
      if (!current() || ended === undefined) return;
      busy.current = false;
      setRunning(null);
      setOutcome(ended.outcome);
      setCheck((now) => ended.check ?? afterResult(ended.outcome as SandboxOutcome, now));
      if (ended.check?.state === "ready") {
        announceRef.current(text.announceReady(checkedAtLabel(ended.check.checkedAt, new Date())));
      }
    },
    [host, readCheck],
  );

  useEffect(() => {
    alive.current = true;
    void readCheck().then((facts) => alive.current && setCheck(facts));
    // A setup or removal that began before Settings opened shows as running and is followed,
    // never started: opening Settings sends no command.
    void host?.running().then(
      (verb) => {
        if (alive.current && verb !== null) void run(verb, true);
      },
      () => undefined,
    );
    return () => {
      alive.current = false;
      following.current?.abort();
      // A press that was following the command is over; the next mount starts fresh.
      press.current++;
      busy.current = false;
    };
  }, [host, readCheck, run]);

  return {
    facts: {
      available: host?.available ?? false,
      place,
      check,
      running,
      outcome,
    },
    setUp: () => void run(check.state === "needs-repair" ? "repair" : "setup"),
    remove: () => void run("remove"),
    checkAgain: () => {
      setOutcome(null);
      void readCheck().then((facts) => alive.current && setCheck(facts));
    },
  };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\.+$/, "");
}

/** What a setup, repair or removal left: the failure if there was one, else the check that followed. */
type Ended =
  | { readonly outcome: SandboxOutcome; readonly check?: undefined }
  | { readonly outcome: SandboxOutcome | null; readonly check: SandboxCheckFacts };

/**
 * Runs the host's command until it ends, or, when `joining`, follows the one that already runs
 * without starting another; then, if it worked, the check that follows it (`onChecking` says the
 * check began). A setup whose check doesn't pass failed its check. Undefined when `signal` aborted.
 */
async function runCommand(
  host: AgentSandboxHost,
  verb: SandboxRunning["verb"],
  joining: boolean,
  signal: AbortSignal,
  readCheck: () => Promise<SandboxCheckFacts>,
  onChecking: () => void,
): Promise<Ended | undefined> {
  const removing = verb === "remove";
  const start = removing ? host.remove : host.setUp;
  const command = joining
    ? host.follow(removing ? "remove" : "setup", { signal })
    : start.call(host, { signal });
  const failure = await command.catch(
    (error: unknown): SandboxOutcome => ({
      kind: removing ? "remove" : "setup",
      how: "failed",
      reason: `${reasonOf(error)}.`,
    }),
  );
  if (failure === undefined) return undefined;
  if (failure !== null) return { outcome: failure };
  onChecking();
  const check = await readCheck();
  if (removing || check.state === "ready" || check.state === "restart-needed") return { outcome: null, check };
  const outcome: SandboxOutcome = {
    kind: "setup",
    how: "check_failed",
    reason: "reason" in check ? check.reason : text.STILL_NEEDS_SETUP,
  };
  return { outcome, check: afterResult(outcome, check) };
}
