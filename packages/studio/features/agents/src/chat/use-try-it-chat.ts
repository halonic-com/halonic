import type { ChatAnswerEnd } from "@halonicjs/app";
import { errorKindOf } from "@halonicjs/std";
import { useToastStore } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRef, AgentsHost } from "../api.ts";
import {
  emptyTranscript,
  endTurn,
  type ReplyEnd,
  startTurn,
  type Transcript,
  toolsRanInLastTurn,
  withMessage,
  withoutLastTurn,
  withToolCall,
} from "./transcript.ts";
import { tryItWords } from "./try-it-words.ts";

/** What {@link useTryItChat} needs. */
export interface TryItChatOptions {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The agent's name now, for what is announced. */
  readonly name: string;
  /** Reads a sentence out through the shell's announcer. */
  readonly announce: (text: string, politeness?: "polite" | "assertive") => void;
}

/** One Try it chat: what it shows and what the person can do in it. */
export interface TryItChat {
  readonly transcript: Transcript;
  /** A reply is being written. */
  readonly answering: boolean;
  /**
   * The engine stopped answering while the chat was open (H12): the transcript stays under "The
   * engine isn't answering. Showing what it said last.", and nothing can be sent until it answers.
   */
  readonly engineQuiet: boolean;
  /**
   * Whether a message may start now (H16). In a workspace this computer doesn't trust, it opens
   * the trust gate where there is one; on Not now, or with no gate, it shows "Not started: *Acme*
   * isn't trusted yet" and answers no, so the message stays in the box.
   */
  mayStart(): Promise<boolean>;
  /**
   * Opens the trust gate after the engine refused a message because the workspace isn't trusted,
   * or shows the toast where there is no gate. Answers whether the person trusted it there.
   */
  askTrust(): Promise<boolean>;
  /**
   * Sends `message` as the person's next message. When the engine refuses it because the
   * workspace isn't trusted (`denied`, H16), nothing was sent: the turn is taken back and
   * `refused` gets the message, so it can go back in the box. It isn't shown as a failure.
   */
  send(message: string, refused?: (message: string) => void): void;
  /** Stops the reply being written; it ends with "Stopped by you.". */
  stop(): void;
  /**
   * Takes back the last turn and sends its message again (H13, H22, H23: only when no tool ran,
   * and only once the engine answers).
   */
  tryAgain(refused?: (message: string) => void): void;
}

/**
 * Drives one Try it chat on the agents host (flow-agents 4.4). Each message is answered with the
 * agent as it's saved, outside any run (v0.1), and the reply builds step by step from what the
 * host's listener hears. A reply that ends is announced once: "Sorter replied.", "Stopped by
 * you.", and a failure assertively. Nothing is announced while it streams in (a11y A6).
 *
 * The chat lives as long as the page: closing the agent's tab ends it, and stops a reply.
 */
export function useTryItChat({ host, agent, name, announce }: TryItChatOptions): TryItChat {
  // The ref is what the next request reads at once; the state is what the page shows.
  const current = useRef<Transcript>(emptyTranscript);
  const [transcript, setShown] = useState<Transcript>(emptyTranscript);
  const [answering, setAnswering] = useState(false);
  const { quiet: engineQuiet, lost: engineLost } = useEngineQuiet(host);
  const running = useRef<AbortController | undefined>(undefined);
  const toasts = useToastStore();
  const said = useRef({ name, announce });
  said.current = { name, announce };

  const update = useCallback((change: (transcript: Transcript) => Transcript) => {
    current.current = change(current.current);
    setShown(current.current);
  }, []);

  // A page that closes stops the reply it was writing, and says nothing about it: the person
  // didn't press Stop, and there's no chat left to read.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
      running.current?.abort();
    };
  }, []);

  const send = useCallback(
    (message: string, refused?: (message: string) => void) => {
      if (running.current !== undefined) return;
      const stopper = new AbortController();
      running.current = stopper;
      setAnswering(true);
      update((transcript) => startTurn(transcript, message));
      const finish = (end: ReplyEnd) => {
        running.current = undefined;
        if (!open.current) return;
        update((transcript) => endTurn(transcript, end));
        setAnswering(false);
        announceEnd(end, said.current.name, said.current.announce);
      };
      host
        .answer(agent, {
          messages: current.current.conversation,
          signal: stopper.signal,
          listener: {
            onToolCall: (call) => update((transcript) => withToolCall(transcript, call)),
            onMessage: (added) => update((transcript) => withMessage(transcript, added)),
          },
        })
        .then((answer) => finish(replyEndOf(answer.end)))
        .catch((error: unknown) => {
          const kind = errorKindOf(error);
          if (kind === "denied") {
            running.current = undefined;
            if (!open.current) return;
            update((transcript) => withoutLastTurn(transcript).transcript);
            setAnswering(false);
            refused?.(message);
            return;
          }
          if (kind === "unavailable") engineLost();
          finish(failureOf(error, toolsRanInLastTurn(current.current)));
        });
    },
    [host, agent, update, engineLost],
  );

  const askTrust = useCallback(async () => {
    if (host.askTrust !== undefined && (await host.askTrust()) === "trusted") return true;
    toasts?.show({ tone: "warning", title: tryItWords.notTrusted(host.workspaceName?.()) });
    return false;
  }, [host, toasts]);

  const mayStart = useCallback(
    async () => host.mayStart === undefined || host.mayStart() || askTrust(),
    [host, askTrust],
  );

  const stop = useCallback(() => running.current?.abort(), []);

  const tryAgain = useCallback(
    (refused?: (message: string) => void) => {
      if (running.current !== undefined || engineQuiet) return;
      const { transcript, message } = withoutLastTurn(current.current);
      if (message === undefined) return;
      update(() => transcript);
      send(message, refused);
    },
    [send, update, engineQuiet],
  );

  return {
    transcript,
    answering,
    engineQuiet,
    mayStart,
    askTrust,
    send,
    stop,
    tryAgain,
  };
}

/** How often the chat asks whether the engine answers again while it doesn't (K1). */
export const ASK_ENGINE_EVERY_MS = 5_000;

/**
 * Whether the engine stopped answering while the chat was open (H12, K1). `lost` marks it so when
 * an answer fails as `unavailable`. While it is so, the chat asks the host every 5 s and when the
 * window comes to the front; the first answer clears it.
 */
function useEngineQuiet(host: AgentsHost): { readonly quiet: boolean; readonly lost: () => void } {
  const [quiet, setQuiet] = useState(false);
  const lost = useCallback(() => setQuiet(true), []);
  useEffect(() => {
    if (!quiet) return;
    let current = true;
    const ask = () => {
      host.list().then(
        () => {
          if (current) setQuiet(false);
        },
        // Still not answering: the line stays, and the next ask may find it back.
        () => {},
      );
    };
    const every = setInterval(ask, ASK_ENGINE_EVERY_MS);
    window.addEventListener("focus", ask);
    return () => {
      current = false;
      clearInterval(every);
      window.removeEventListener("focus", ask);
    };
  }, [host, quiet]);
  return { quiet, lost };
}

/** How the chat service's end reads in the transcript. */
function replyEndOf(end: ChatAnswerEnd): ReplyEnd {
  switch (end.reason) {
    case "answered":
      return { kind: "answered" };
    case "stopped":
      return { kind: "stopped" };
    case "turn-limit":
      return { kind: "turn-limit", turns: end.turns };
    case "failed":
      return { kind: "failed", reason: end.error.message, toolsRan: end.toolsRan };
  }
}

/**
 * An answer the host couldn't give: the engine not answering is D4's stop, anything else a
 * failure with its own words.
 */
function failureOf(error: unknown, toolsRan: boolean): ReplyEnd {
  const kind = (error as { kind?: unknown } | null)?.kind;
  if (kind === "unavailable") return { kind: "engine-stopped", toolsRan };
  const reason = error instanceof Error ? error.message : String(error);
  return { kind: "failed", reason, toolsRan };
}

/** Says once how a reply ended: politely when it's done or stopped, assertively when it failed. */
function announceEnd(
  end: ReplyEnd,
  name: string,
  announce: (text: string, politeness?: "polite" | "assertive") => void,
): void {
  switch (end.kind) {
    case "answered":
      announce(tryItWords.replied(name));
      return;
    case "stopped":
      announce(tryItWords.stoppedByYou);
      return;
    case "turn-limit":
      announce(tryItWords.turnLimit(name, end.turns));
      return;
    case "failed":
      announce(tryItWords.replyFailed(name, end.reason), "assertive");
      return;
    case "engine-stopped":
      announce(tryItWords.engineStopped, "assertive");
      return;
  }
}
