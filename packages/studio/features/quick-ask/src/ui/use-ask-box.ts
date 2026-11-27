import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AnswerState } from "../ask-answer.ts";
import type { AskAgent, AskSession, LastAnswer } from "../ask-session.ts";

/** One question asked from the box, and where its answer stands. */
export interface Exchange {
  readonly id: number;
  readonly agent: AskAgent;
  readonly question: string;
  /** `sending` until Messenger says, then `sent`, or `not-sent` with the question kept here. */
  readonly status: "sending" | "sent" | "not-sent";
  /** Sent again with Try again, so its bubble says "Sending…" until Messenger answers. */
  readonly retried?: boolean;
  /** Where the answer stands once the question is sent. */
  readonly answer: AnswerState | undefined;
  /** When Messenger sent the question, as ISO text: its bubble shows the time. */
  readonly sentAt?: string;
}

/**
 * What the box shows: the text box while it reads the agents, that they couldn't be read, no
 * agents, or the agents and the questions asked. The text typed while opening, or before the read
 * failed, is kept (design HAL-19384).
 */
export type BoxState =
  | { readonly kind: "opening"; readonly text: string }
  | { readonly kind: "failed"; readonly text: string }
  | { readonly kind: "no-agents" }
  | {
      readonly kind: "ready";
      readonly agents: readonly AskAgent[];
      readonly agent: AskAgent;
      readonly text: string;
      readonly exchanges: readonly Exchange[];
      /** An answer that came after the box closed, for **Last answer ›**. */
      readonly lastAnswer?: LastAnswer;
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
  /** Forgets the answer behind **Last answer ›**, once the person opened it. */
  forgetLastAnswer(): void;
  /** Reads the agents again, after they couldn't be read. */
  reload(): void;
}

/**
 * The box's work while it shows (requirement `quick-ask.box`): it opens the session, keeps what
 * is typed, sends, and watches the newest question's answer on Messenger's changes. Unmounting,
 * which is the box closing, stops the watch.
 */
export function useAskBox(session: AskSession): AskBoxModel {
  const [state, setState] = useState<BoxState>(() => ({ kind: "opening", text: session.unsent() }));
  const opening = useOpening(session, setState);
  const watch = opening.watch;
  const nextId = useRef(0);

  const change = (id: number, changed: (exchange: Exchange) => Exchange) =>
    setState((now) =>
      now.kind === "ready"
        ? {
            ...now,
            exchanges: now.exchanges.map((each) => (each.id === id ? changed(each) : each)),
          }
        : now,
    );
  const update = (exchange: Exchange) => change(exchange.id, () => exchange);
  // A newer question's watch replaced this one's, so nothing updates its working line any more.
  const unwatched = (exchange: Exchange) => change(exchange.id, stillWorkingToWaiting);
  const deliver = (exchange: Exchange) =>
    void deliverQuestion(session, exchange, { update, unwatched }, watch);

  return {
    state,
    type(text) {
      setState((now) => (now.kind === "ready" || now.kind === "opening" ? { ...now, text } : now));
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
      setState((now) =>
        now.kind === "ready" ? { ...now, text: "", exchanges: [...now.exchanges, exchange] } : now,
      );
      deliver(exchange);
    },
    retry(exchange) {
      const sending: Exchange = { ...exchange, status: "sending", retried: true };
      update(sending);
      deliver(sending);
    },
    forgetLastAnswer() {
      session.forgetLastAnswer();
      setState((now) => {
        if (now.kind !== "ready") return now;
        const { lastAnswer: _forgotten, ...rest } = now;
        return rest;
      });
    },
    reload: opening.reload,
  };
}

/**
 * An exchange whose answer is no longer watched: a working line would stay on for good, so it
 * goes back to waiting, which says the answer comes to the chat. Any other answer stays.
 */
function stillWorkingToWaiting(exchange: Exchange): Exchange {
  return exchange.answer?.kind === "working"
    ? { ...exchange, answer: { kind: "waiting" } }
    : exchange;
}

/** What {@link deliverQuestion} tells the box about one exchange. */
interface ExchangeChanges {
  /** The exchange as it is now. */
  update(exchange: Exchange): void;
  /** The exchange's answer is no longer watched: a newer question's watch replaced it, or the box closed. */
  unwatched(exchange: Exchange): void;
}

/** The one answer the box watches: a new watch replaces the last, and none starts once it closed. */
interface AnswerWatch {
  /** Starts watching with `start`, unless the box has closed; stops the watch before it. */
  replace(start: () => () => void): void;
}

/** What {@link useOpening} gives the box: the answer's watch, and reading the agents again. */
interface Opening {
  readonly watch: AnswerWatch;
  readonly reload: () => void;
}

/** The text in the box now, carried from opening to ready or failed, and back on Try again. */
function textOf(state: BoxState): string {
  return state.kind === "no-agents" ? "" : state.text;
}

/**
 * Opens the session as the box shows, and again on {@link Opening.reload}, and puts what it says
 * in the state; text typed meanwhile wins over the remembered text. Closing the box stops the
 * answer's watch, and a send that lands after that starts none.
 */
function useOpening(session: AskSession, setState: Dispatch<SetStateAction<BoxState>>): Opening {
  const stopWatching = useRef<(() => void) | undefined>(undefined);
  const showing = useRef(true);
  // Each read counts up; only the newest one's answer lands, and none once the box has closed.
  const reads = useRef(0);

  const read = useCallback(() => {
    reads.current += 1;
    const thisRead = reads.current;
    const current = () => showing.current && reads.current === thisRead;
    session.open().then(
      (opening) => {
        if (!current()) return;
        if (opening.kind === "no-agents") setState({ kind: "no-agents" });
        else setState((now) => ({ ...opening, kind: "ready", text: textOf(now), exchanges: [] }));
      },
      (error: unknown) => {
        console.error("Quick ask couldn't read the agents to ask:", error);
        if (current()) setState((now) => ({ kind: "failed", text: textOf(now) }));
      },
    );
  }, [session, setState]);

  useEffect(() => {
    showing.current = true;
    read();
    return () => {
      showing.current = false;
      stopWatching.current?.();
      stopWatching.current = undefined;
    };
  }, [read]);

  return {
    watch: {
      replace(start) {
        if (!showing.current) return;
        stopWatching.current?.();
        stopWatching.current = start();
      },
    },
    reload() {
      setState((now) => ({ kind: "opening", text: textOf(now) }));
      read();
    },
  };
}

/**
 * Sends `exchange`'s question and tells `changes` how it went: not sent, or sent and then each
 * new state of its answer, until a newer question's watch replaces this one. A send that throws
 * counts as not sent, and is logged.
 */
async function deliverQuestion(
  session: AskSession,
  exchange: Exchange,
  changes: ExchangeChanges,
  watch: AnswerWatch,
): Promise<void> {
  const { update } = changes;
  try {
    const outcome = await session.ask(exchange.agent, exchange.question);
    if (outcome.kind === "not-sent") {
      update({ ...exchange, status: "not-sent" });
      return;
    }
    const sent: Exchange = { ...exchange, status: "sent", sentAt: outcome.question.sentAt };
    update(sent);
    watch.replace(() => {
      const stop = session.watch(exchange.agent, outcome.question, (answer) =>
        update({ ...sent, answer }),
      );
      return () => {
        stop();
        changes.unwatched(sent);
      };
    });
  } catch (error: unknown) {
    console.error("Quick ask couldn't send the question:", error);
    update({ ...exchange, status: "not-sent" });
  }
}
