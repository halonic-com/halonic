import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentHarnessId, type AgentsHost, agentHarnessIds } from "../api.ts";
import type { HarnessCheck } from "./harness-strip.ts";

/** What the checks found of each program; a program not checked yet is absent. */
export type HarnessChecks = Partial<Record<AgentHarnessId, HarnessCheck>>;

/** What {@link useHarnessCheck} hands the Harness page. */
export interface HarnessCheckState {
  readonly found: HarnessChecks;
  readonly checking: boolean;
  /** Asks the host again; resolves when the answers are in, and never rejects. */
  readonly check: () => Promise<void>;
}

/**
 * The last answers for each host and agent, kept while Studio is open, so the next visit to a
 * Harness page shows them at once while it checks again (flow-agents 5.3 rule 5). By agent, as
 * each agent has its own sign-in (HAL-6351). Weak, so a host that is gone takes its answers with it.
 */
const lastFound = new WeakMap<AgentsHost, Map<string, KeptChecks>>();

/** Answers kept for an agent, with the number of the check that got them. */
interface KeptChecks {
  readonly started: number;
  readonly found: HarnessChecks;
}

/** Numbers every check in this Studio, so an older answer never replaces a newer kept one. */
let checksStarted = 0;

/** The answers kept for the agent (`hubId/id`), or none. */
function keptFor(host: AgentsHost, agent: string): HarnessChecks {
  return lastFound.get(host)?.get(agent)?.found ?? {};
}

/** Keeps `found` for the agent, unless a check that started later already kept its answers. */
function keep(host: AgentsHost, agent: string, kept: KeptChecks): void {
  const byAgent = lastFound.get(host) ?? new Map<string, KeptChecks>();
  const before = byAgent.get(agent);
  if (before !== undefined && before.started > kept.started) return;
  byAgent.set(agent, kept);
  lastFound.set(host, byAgent);
}

/** The programs the host checks; Halonic is built in and needs no check. */
const checkedIds = agentHarnessIds.filter((each) => each !== "halonic");

/** The words of a throw, for the "Couldn't check" line. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Checks Claude Code and Codex on this computer when the page opens and on `check`, starting
 * from the last answers this Studio got for the agent. A program whose check throws is
 * `unreachable`, with the reason, and the others keep their answers.
 */
export function useHarnessCheck(host: AgentsHost, hubId: string, id: string): HarnessCheckState {
  const agent = `${hubId}/${id}`;
  const [found, setFound] = useState<HarnessChecks>(() => keptFor(host, agent));
  const [checking, setChecking] = useState(false);
  // Counts the checks, so only the newest one's answer is used: a slow answer for another agent,
  // or one that arrives after the page is left, is dropped.
  const newestCheck = useRef(0);
  const check = useCallback(async () => {
    const mine = ++newestCheck.current;
    const started = ++checksStarted;
    setChecking(true);
    const answers = await Promise.all(
      checkedIds.map((each) =>
        // A host that throws at once is caught the same as one that rejects.
        Promise.resolve()
          .then(() => host.harnessReadiness({ hubId, id }, each))
          .catch(
            (error: unknown): HarnessCheck => ({ status: "unreachable", error: reasonOf(error) }),
          ),
      ),
    );
    const next: HarnessChecks = Object.fromEntries(
      checkedIds.map((each, index) => [each, answers[index]]),
    );
    keep(host, agent, { started, found: next });
    if (mine === newestCheck.current) {
      setFound(next);
      setChecking(false);
    }
  }, [host, hubId, id, agent]);
  useEffect(() => {
    setFound(keptFor(host, agent));
    void check();
    return () => {
      newestCheck.current += 1;
    };
  }, [check, host, agent]);
  return { found, checking, check };
}
