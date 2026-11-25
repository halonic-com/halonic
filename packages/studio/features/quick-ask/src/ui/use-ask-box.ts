import { useEffect, useRef, useState } from "react";
import type { AnswerState } from "../ask-answer.ts";
import type { AskAgent, AskSession } from "../ask-session.ts";

/** One question asked from the box, and where its answer stands. */
export interface Exchange {
  readonly id: number;
  readonly agent: AskAgent;
  readonly question: string;
  /** `sending` until Messenger says, then `sent`, or `not-sent` with the question kept here. */
  readonly status: "sending" | "sent" | "not-sent";
  /** Where the answer stands once the question is sent. */
  readonly answer: AnswerState | undefined;
}

/** What the box shows: nothing while it reads, no agents, or the agents and the questions asked. */
export type BoxState =
  | { readonly kind: "opening" }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "no-agents" }
  | {
      readonly kind: "ready";
      readonly agents: readonly AskAgent[];
      readonly agent: AskAgent;
      readonly text: string;
      readonly exchanges: readonly Exchange[];
    };

/** The box's state and what the person can do in it. */
export interface AskBoxModel {
  readonly state: BoxState;
  type(text: string): void;
  pick(agent: AskAgent): void;
  /** Sends the box's text to the picked agent; blank text sends nothing. */
  send(): void;
  /** Sends a question that wasn't sent again. */
  retry(exchange: Exchange): void;
}

/**
 * The box's work while it shows (requirement `quick-ask.box`): it opens the session, keeps what
 * is typed, sends, and watches the newest question's answer on Messenger's changes. Unmounting,
 * which is the box closing, stops the watch.
 */
export function useAskBox(session: AskSession): AskBoxModel {
  const [state, setState] = useState<BoxState>({ kind: "opening" });
  const watch = useOpening(session, setState);
  const nextId = useRef(0);

  const update = (exchange: Exchange) =>
    setState((now) =>
      now.kind === "ready"
        ? {
            ...now,
            exchanges: now.exchanges.map((each) => (each.id === exchange.id ? exchange : each)),
          }
        : now,
    );
  const deliver = (exchange: Exchange) => void deliverQuestion(session, exchange, update, watch);

  return {
    state,
    type(text) {
      setState((now) => (now.kind === "ready" ? { ...now, text } : now));
      session.type(text);
    },
    pick(agent) {
      setState((now) => (now.kind === "ready" ? { ...now, agent } : now));
      session.pick(agent);
    },
    send() {
      if (state.kind !== "ready" || state.text.trim() === "") return;
      nextId.current += 1;
      const exchange: Exchange = {
        id: nextId.current,
        agent: state.agent,
        question: state.text,
        status: "sending",
        answer: undefined,
      };
      // The box clears and keeps the focus; the question waits once, in its bubble (motion 4).
      setState({ ...state, text: "", exchanges: [...state.exchanges, exchange] });
      deliver(exchange);
    },
    retry(exchange) {
      const sending: Exchange = { ...exchange, status: "sending" };
      update(sending);
      deliver(sending);
    },
  };
}

/** The one answer the box watches: a new watch replaces the last, and none starts once it closed. */
interface AnswerWatch {
  /** Starts watching with `start`, unless the box has closed; stops the watch before it. */
  replace(start: () => () => void): void;
}

/**
 * Opens the session as the box shows and puts what it says in the state. Closing the box stops
 * the answer's watch, and a send that lands after that starts none.
 */
function useOpening(session: AskSession, setState: (state: BoxState) => void): AnswerWatch {
  const stopWatching = useRef<(() => void) | undefined>(undefined);
  const showing = useRef(true);

  useEffect(() => {
    let current = true;
    showing.current = true;
    session.open().then(
      (opening) => {
        if (!current) return;
        if (opening.kind === "no-agents") setState({ kind: "no-agents" });
        else setState({ ...opening, kind: "ready", exchanges: [] });
      },
      (error: unknown) => {
        console.error("Quick ask couldn't read the agents to ask:", error);
        if (current) setState({ kind: "failed", error });
      },
    );
    return () => {
      current = false;
      showing.current = false;
      stopWatching.current?.();
      stopWatching.current = undefined;
    };
  }, [session, setState]);

  return {
    replace(start) {
      if (!showing.current) return;
      stopWatching.current?.();
      stopWatching.current = start();
    },
  };
}

/**
 * Sends `exchange`'s question and tells `update` how it went: not sent, or sent and then each
 * new state of its answer. A send that throws counts as not sent, and is logged.
 */
async function deliverQuestion(
  session: AskSession,
  exchange: Exchange,
  update: (exchange: Exchange) => void,
  watch: AnswerWatch,
): Promise<void> {
  try {
    const outcome = await session.ask(exchange.agent, exchange.question);
    if (outcome.kind === "not-sent") {
      update({ ...exchange, status: "not-sent" });
      return;
    }
    const sent: Exchange = { ...exchange, status: "sent" };
    update(sent);
    watch.replace(() =>
      session.watch(exchange.agent, outcome.question, (answer) => update({ ...sent, answer })),
    );
  } catch (error: unknown) {
    console.error("Quick ask couldn't send the question:", error);
    update({ ...exchange, status: "not-sent" });
  }
}
