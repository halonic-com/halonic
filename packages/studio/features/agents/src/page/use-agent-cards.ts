import {
  type CardStack,
  dropGoneCards,
  noCards,
  openCard,
  useItemCardTaker,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentListing, AgentRef, AgentStep, AgentsHost } from "../api.ts";
import { type AgentTeamMember, handOffPath } from "../team.ts";
import { agentStepCardKey, agentStepOfCard } from "./agent-step-card.tsx";
import { pageWords } from "./page-words.ts";
import { subagentCardKey, subagentOfCard } from "./subagent-card.tsx";

/** The agent page's stack of cards, and the ways to change it. */
export interface AgentCards {
  readonly stack: CardStack;
  readonly set: (stack: CardStack) => void;
  readonly openSubagent: (agent: AgentListing) => void;
  readonly openAgentStep: (step: AgentStep) => void;
  readonly close: () => void;
}

/**
 * The cards stacked on the agent page's panel (flow-agents 7): a subagent and an agent step open
 * as cards, and a card whose agent or agent step is gone drops with every card above it, saying
 * so to screen readers. The stack is the page's state, so it stays across tab switches while the
 * page stays mounted. An agent of its team that the window shows (`showItem`) opens as a subagent's
 * card too (`useTeamCardTaker`), while `showsCards` says the view the page shows draws the cards.
 */
export function useAgentCards(
  host: AgentsHost,
  agent: AgentRef,
  announce: ((text: string) => void) | undefined,
  showsCards: () => boolean = () => true,
): AgentCards {
  const [stack, setStack] = useState<CardStack>(noCards);
  const latest = useRef(stack);
  latest.current = stack;
  const set = useCallback((next: CardStack) => setStack(next), []);
  const openSubagent = useCallback(
    (sub: AgentListing) =>
      setStack((now) => openCard(now, { key: subagentCardKey(sub), title: sub.name })),
    [],
  );
  const openAgentStep = useCallback(
    (step: AgentStep) =>
      setStack((now) => openCard(now, { key: agentStepCardKey(step), title: step.id })),
    [],
  );
  const close = useCallback(() => setStack(noCards), []);
  const { hubId, id } = agent;
  useEffect(() => {
    let live = true;
    const check = async () => {
      if (latest.current.length === 0) return;
      const [team, agentSettings] = await Promise.all([
        host.team({ hubId, id }),
        host.settings({ hubId, id }),
      ]).catch(() => []);
      if (!live || team === undefined || agentSettings === undefined) return;
      const agents = new Set(team.map((member) => member.id));
      const steps = new Set(agentSettings.agentSteps.map((step) => step.id));
      const { stack: kept, removed } = dropGoneCards(latest.current, (card) => {
        const sub = subagentOfCard(card.key);
        const step = agentStepOfCard(card.key);
        return (sub === undefined || agents.has(sub)) && (step === undefined || steps.has(step));
      });
      if (removed === undefined) return;
      setStack(kept);
      announce?.(pageWords.cardRemoved(removed.title));
    };
    const stop = host.subscribe(() => void check());
    return () => {
      live = false;
      stop();
    };
  }, [host, hubId, id, announce]);
  useTeamCardTaker(host, agent, (sub) => {
    if (!showsCards()) return false;
    openSubagent(sub);
    return true;
  });
  return { stack, set, openSubagent, openAgentStep, close };
}

/**
 * Takes an agent the window shows (`showItem`) as a subagent's card when it is in the page's team
 * (an agent of the same hub this agent hands work to, itself or through others) and `openSubagent`
 * opens it. The team is read when the page is drawn and each time the host says the agents
 * changed, so the answer is ready when the window asks.
 */
function useTeamCardTaker(
  host: AgentsHost,
  { hubId, id }: AgentRef,
  openSubagent: (agent: AgentListing) => boolean,
): void {
  const team = useRef<readonly AgentTeamMember[]>([]);
  useEffect(() => {
    let live = true;
    const read = () =>
      host.team({ hubId, id }).then(
        (members) => {
          if (live) team.current = members;
        },
        // A team that can't be read takes nothing: the agent opens in its own tab instead.
        () => {
          if (live) team.current = [];
        },
      );
    void read();
    const stop = host.subscribe(() => void read());
    return () => {
      live = false;
      stop();
    };
  }, [host, hubId, id]);
  useItemCardTaker((item) => {
    if (item.kind !== "agent" || item.hub !== hubId || item.id === id) return false;
    const member = team.current.find((each) => each.id === item.id);
    if (member === undefined || handOffPath(team.current, id, item.id) === undefined) return false;
    return openSubagent(member);
  });
}
