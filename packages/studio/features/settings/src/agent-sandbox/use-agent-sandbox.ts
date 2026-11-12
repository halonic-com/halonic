import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSandboxHost } from "../api.ts";
import {
  afterResult,
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today at 09:12", "yesterday at 09:12" or "3 Nov at 09:12", as the section says when it checked. */
export function checkedAtLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((day(now).getTime() - day(at).getTime()) / 86_400_000);
  if (daysAgo === 0) return `today at ${time}`;
  if (daysAgo === 1) return `yesterday at ${time}`;
  return `${at.getDate()} ${months[at.getMonth()]} at ${time}`;
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
  // Each press gets a number, so a result that arrives after the time limit still counts, but one
  // from an earlier press doesn't overwrite a newer one.
  const press = useRef(0);

  const readCheck = useCallback(async (): Promise<SandboxCheckFacts> => {
    if (host === undefined) return { state: "unknown", reason: "no agent host is running." };
    try {
      const facts = await host.check();
      return facts.state === "ready"
        ? { state: "ready", checkedAt: checkedAtLabel(facts.checkedAt, new Date()) }
        : facts;
    } catch (error) {
      return { state: "unknown", reason: `${reasonOf(error)}.` };
    }
  }, [host]);

  useEffect(() => {
    alive.current = true;
    void readCheck().then((facts) => alive.current && setCheck(facts));
    return () => {
      alive.current = false;
    };
  }, [readCheck]);

  const run = useCallback(
    async (verb: SandboxRunning["verb"]) => {
      if (host === undefined || busy.current) return;
      busy.current = true;
      const mine = ++press.current;
      const current = () => alive.current && press.current === mine;
      setOutcome(null);
      setRunning({ verb, step: "elevating" });
      const timer =
        verb === "remove"
          ? undefined
          : setTimeout(() => {
              if (!current()) return;
              // The command isn't stopped: a Try again joins it in the host.
              busy.current = false;
              setRunning(null);
              setOutcome({ kind: "setup", how: "timed-out" });
            }, SETUP_TIME_LIMIT_MS);
      const ended = await runCommand(host, verb, readCheck, () => {
        clearTimeout(timer);
        if (current()) setRunning({ verb, step: "checking" });
      });
      clearTimeout(timer);
      if (!current()) return;
      busy.current = false;
      setRunning(null);
      setOutcome(ended.outcome);
      setCheck((now) => ended.check ?? afterResult(ended.outcome as SandboxOutcome, now));
      if (ended.check?.state === "ready") announce(text.announceReady(ended.check.checkedAt));
    },
    [host, readCheck, announce],
  );

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
 * Runs the host's command until it ends, then, if it worked, the check that follows it
 * (`onChecking` says the check began). A setup whose check doesn't pass failed its check.
 */
async function runCommand(
  host: AgentSandboxHost,
  verb: SandboxRunning["verb"],
  readCheck: () => Promise<SandboxCheckFacts>,
  onChecking: () => void,
): Promise<Ended> {
  const removing = verb === "remove";
  const failure = await (removing ? host.remove() : host.setUp()).catch(
    (error: unknown): SandboxOutcome => ({
      kind: removing ? "remove" : "setup",
      how: "failed",
      reason: `${reasonOf(error)}.`,
    }),
  );
  if (failure !== null) return { outcome: failure };
  onChecking();
  const check = await readCheck();
  if (removing || check.state === "ready") return { outcome: null, check };
  const outcome: SandboxOutcome = {
    kind: "setup",
    how: "check_failed",
    reason: "reason" in check ? check.reason : text.STILL_NEEDS_SETUP,
  };
  return { outcome, check: afterResult(outcome, check) };
}
