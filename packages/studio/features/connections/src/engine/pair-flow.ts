import { pairingAlphabet } from "@halonicjs/ports";
import type { ServerEngine, ServerPairStart, ServerPairState } from "@halonicjs/studio-services";
import { useCallback, useEffect, useRef, useState } from "react";

/** How often a waiting pairing asks the host where it stands. */
export const pairPollMs = 2000;

/** Why P1 shows a problem: under the address, under the code, or in the dialog's alert. */
export type EnterProblem =
  | { readonly field: "address"; readonly kind: "https" | "unreachable" | "not-halonic" }
  | { readonly field: "code"; readonly kind: "format" | "refused" }
  /** Continue stays off until `until` (ms on the clock). */
  | {
      readonly field: "code";
      readonly kind: "too-many";
      readonly minutes: number | undefined;
      readonly until: number;
    }
  | { readonly field: "dialog"; readonly kind: "failed" };

/** How a pairing ended without pairing: E1–E5 of Sofia's flow (HAL-18622). */
export type PairEnding =
  | "expired"
  | "refused"
  | "taken-over"
  | "not-saved"
  | "not-saved-still-on"
  | "lost";

/** What the dialog shows, one step at a time. */
export type PairView =
  | { readonly stage: "enter"; readonly problem?: EnterProblem }
  | { readonly stage: "starting" }
  | {
      readonly stage: "waiting";
      readonly pairingId: string;
      readonly checkCode: string;
      readonly expiresAt: string;
      /** `false` while the host can't reach the server; the pairing goes on. */
      readonly reachable: boolean;
    }
  | { readonly stage: "ended"; readonly ending: PairEnding }
  | { readonly stage: "paired"; readonly sessionEndsAt: string };

/** What {@link usePairing} gives the dialog. */
export interface Pairing {
  readonly view: PairView;
  /** Starts a pairing; the view says how starting went. */
  readonly start: (address: string, code: string, name: string) => void;
  /** Back to P1 after an ending. */
  readonly again: () => void;
  /** Cancels a waiting pairing: `false`, or a rejection, when the server wasn't told. */
  readonly cancel: () => Promise<boolean>;
  /** Ends a waiting pairing whose 10 minutes ran out on this clock, cancelling it as a best effort. */
  readonly expire: () => void;
}

const separators = /[ \t\n\f\r.\-·]/g;
/** The server's pairing codes are 8 symbols (`server.device-pairing`). */
const serverCodeLength = 8;

/**
 * A server's pairing code as a person typed it, in its plain form, or `undefined` when it isn't 8
 * symbols of the pairing alphabet. Case, spaces, dots and dashes don't matter, as for a phone's.
 */
export function readServerCode(typed: string): string | undefined {
  const code = typed.replace(separators, "").toUpperCase();
  if (code.length !== serverCodeLength) return undefined;
  return [...code].every((symbol) => pairingAlphabet.includes(symbol)) ? code : undefined;
}

/** A start that isn't waiting: the host or the server refused it. */
type StartRefused = Exclude<ServerPairStart, { readonly state: "waiting" }>;

/** P1's problem for a start the host or the server refused. */
function startProblem(answer: StartRefused, now: number): EnterProblem {
  switch (answer.state) {
    case "address_not_allowed":
      return { field: "address", kind: "https" };
    case "unreachable":
      return { field: "address", kind: "unreachable" };
    case "not_halonic":
      return { field: "address", kind: "not-halonic" };
    case "code_refused":
      return { field: "code", kind: "refused" };
    case "too_many": {
      // Without a time, Continue comes back after a minute and the server says again if need be.
      const until = now + (answer.minutes ?? 1) * 60_000;
      return { field: "code", kind: "too-many", minutes: answer.minutes, until };
    }
    case "lost":
      return { field: "dialog", kind: "failed" };
  }
}

/** Where a status answer other than `paired` leads: still waiting (reachable or not), or an ending. */
function stepOf(
  answer: Exclude<ServerPairState, { readonly state: "paired" }>,
): PairEnding | "waiting" | "unreachable" {
  switch (answer.state) {
    case "waiting":
      return "waiting";
    case "unreachable":
    case "too_many":
      // The host keeps the pairing for both: ask again on the next round.
      return "unreachable";
    case "expired":
    case "refused":
    case "taken-over":
      return answer.state;
    case "key_not_saved":
      return answer.signedOut ? "not-saved" : "not-saved-still-on";
    case "cancelled":
    case "lost":
    case "not_halonic":
    case "code_refused":
      return "lost";
  }
}

/** Where any status answer leads. */
function stepOrPaired(answer: ServerPairState): ReturnType<typeof stepOf> | "paired" {
  return answer.state === "paired" ? "paired" : stepOf(answer);
}

/**
 * Asks where the pairing `pairingId` stands every {@link pairPollMs}, one question at a time, and
 * hands each answer to `follow` while the generation it started in is still current: `undefined`
 * when the host didn't answer, which goes to the console.
 */
function usePoll(
  engine: ServerEngine,
  pairingId: string | undefined,
  generation: { readonly current: number },
  follow: (answer: ServerPairState | undefined) => void,
): void {
  useEffect(() => {
    if (pairingId === undefined) return;
    const mine = generation.current;
    let asking = false;
    const ask = () => {
      if (asking) return;
      asking = true;
      engine.status(pairingId).then(
        (answer) => {
          asking = false;
          if (mine === generation.current) follow(answer);
        },
        (error: unknown) => {
          asking = false;
          console.error("Pair with a server couldn't read the pairing", error);
          if (mine === generation.current) follow(undefined);
        },
      );
    };
    const timer = setInterval(ask, pairPollMs);
    return () => clearInterval(timer);
  }, [engine, pairingId, generation, follow]);
}

/**
 * Follows one pairing at a time while the dialog is open (`connections.server-pair-dialog`).
 * Unmounting cancels a waiting pairing, so a dialog that goes away never leaves one the owner
 * could still allow. Each start and cancel bumps a generation, so a late answer is dropped.
 */
export function usePairing(engine: ServerEngine, now: () => number = Date.now): Pairing {
  const [view, setView] = useState<PairView>({ stage: "enter" });
  const waiting = useRef<string | undefined>(undefined);
  const generation = useRef(0);

  const cancel = useCallback(async () => {
    generation.current++;
    const pairingId = waiting.current;
    waiting.current = undefined;
    return pairingId === undefined ? true : engine.cancel(pairingId);
  }, [engine]);

  // Unmounted without the dialog's own close, nobody is left to tell: it ends within 10 minutes.
  useEffect(() => () => void cancel().catch(() => undefined), [cancel]);

  const start = useCallback(
    (address: string, code: string, name: string) => {
      const mine = ++generation.current;
      setView({ stage: "starting" });
      engine.pair(address, code, name).then(
        (answer) => {
          if (mine !== generation.current) {
            if (answer.state === "waiting") void engine.cancel(answer.pairingId).catch(() => false);
            return;
          }
          if (answer.state !== "waiting") {
            setView({ stage: "enter", problem: startProblem(answer, now()) });
            return;
          }
          waiting.current = answer.pairingId;
          setView({ stage: "waiting", ...withoutState(answer), reachable: true });
        },
        (error: unknown) => {
          console.error("Pair with a server couldn't start the pairing", error);
          if (mine === generation.current) {
            setView({ stage: "enter", problem: { field: "dialog", kind: "failed" } });
          }
        },
      );
    },
    [engine, now],
  );

  // Undefined when the host itself didn't answer: shown as the server not answering.
  const follow = useCallback((answer: ServerPairState | undefined) => {
    const step = answer === undefined ? "unreachable" : stepOrPaired(answer);
    if (step === "waiting" || step === "unreachable") {
      setView((shown) =>
        shown.stage === "waiting" ? { ...shown, reachable: step === "waiting" } : shown,
      );
      return;
    }
    generation.current++;
    waiting.current = undefined;
    if (answer?.state === "paired") {
      setView({ stage: "paired", sessionEndsAt: answer.sessionEndsAt });
    } else if (step !== "paired") {
      setView({ stage: "ended", ending: step });
    }
  }, []);
  usePoll(engine, view.stage === "waiting" ? view.pairingId : undefined, generation, follow);

  const again = useCallback(() => {
    generation.current++;
    setView({ stage: "enter" });
  }, []);

  const expire = useCallback(() => {
    generation.current++;
    const pairingId = waiting.current;
    waiting.current = undefined;
    if (pairingId === undefined) return;
    setView({ stage: "ended", ending: "expired" });
    void engine.cancel(pairingId).catch(() => false);
  }, [engine]);

  return { view, start, again, cancel, expire };
}

/** The waiting answer's fields for the view. */
function withoutState(answer: Extract<ServerPairStart, { state: "waiting" }>) {
  return { pairingId: answer.pairingId, checkCode: answer.checkCode, expiresAt: answer.expiresAt };
}
