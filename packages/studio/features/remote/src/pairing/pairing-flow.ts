import type { PairedPhone, PairingEvent, PairingSession, RemoteControl } from "@halonicjs/ports";
import { useCallback, useEffect, useRef, useState } from "react";
import { followStream } from "../remote-state.ts";

/** A code to show: waiting for a phone to scan or type it. */
export type CodeEvent = Extract<PairingEvent, { readonly type: "code" }>;
/** A phone used the code: its check code waits for Allow. */
export type CheckEvent = Extract<PairingEvent, { readonly type: "check" }>;
/** The code stopped working, and the pairing waits for New code, or it ended without a phone. */
export type EndedEvent = Extract<PairingEvent, { readonly type: "code-ended" | "ended" }>;

/** What the Pair a phone dialog shows, one step at a time. */
export type PairingView =
  | { readonly stage: "starting" }
  /** `refused` after Don't allow: the new code comes with the reason it is new. */
  | { readonly stage: "code"; readonly code: CodeEvent; readonly refused: boolean }
  | { readonly stage: "check"; readonly check: CheckEvent }
  | { readonly stage: "paired"; readonly phone: PairedPhone }
  /** `lastCode`: the code that showed before it stopped working, if one did. */
  | { readonly stage: "ended"; readonly ended: EndedEvent; readonly lastCode?: CodeEvent }
  /** The host couldn't open a pairing at all. */
  | { readonly stage: "failed" };

/**
 * The step a pairing event leads to; `refused` when the code follows a Don't allow, and
 * `lastCode` the code that showed before, for an ending.
 */
export function viewOf(event: PairingEvent, refused = false, lastCode?: CodeEvent): PairingView {
  switch (event.type) {
    case "code":
      return { stage: "code", code: event, refused };
    case "check":
      return { stage: "check", check: event };
    case "paired":
      return { stage: "paired", phone: event.phone };
    case "code-ended":
    case "ended":
      return lastCode === undefined
        ? { stage: "ended", ended: event }
        : { stage: "ended", ended: event, lastCode };
  }
}

/**
 * What the dialog does with a pairing event: show a step, nothing for a pairing the person ended
 * (`closed`), or `refused` for Don't allow, which the design follows with a new code at once.
 */
function stepOf(
  event: PairingEvent,
  refused: boolean,
  lastCode: CodeEvent | undefined,
): PairingView | "refused" | undefined {
  if (event.type === "ended" && event.reason === "closed") return undefined;
  if (event.type === "code-ended" && event.reason === "denied") return "refused";
  return viewOf(event, refused, lastCode);
}

/** What {@link usePairing} gives the dialog. */
export interface Pairing {
  readonly view: PairingView;
  /** Ends this code and makes a new one. */
  readonly newCode: () => Promise<void>;
  /** Pairs the phone on Check the code; rejects when the host does. */
  readonly allow: () => Promise<void>;
  /** Refuses the phone on Check the code; rejects when the host does. */
  readonly deny: () => Promise<void>;
  /** Ends the pairing, as closing the dialog does. */
  readonly close: () => Promise<void>;
}

/**
 * Opens a pairing on `remote` while the dialog is open and follows it step by step. Unmounting
 * closes the pairing, so a dialog that goes away never leaves a code working (decision 10). A
 * pairing the person ended themselves (`closed`) shows nothing more. New code asks the open
 * pairing for a new code, so remote stays on (HAL-14060); only a pairing that has ended, or never
 * opened, is started again.
 */
export function usePairing(remote: RemoteControl): Pairing {
  const [view, setView] = useState<PairingView>({ stage: "starting" });
  // The open pairing, until it ends; a code that stops working leaves it open.
  const session = useRef<PairingSession | undefined>(undefined);
  // Each start bumps it; a session that opens after a newer start, or after unmount, is closed.
  const generation = useRef(0);
  const stopFollowing = useRef<() => void>(() => undefined);
  // Set by Don't allow: the next code comes with the reason it is new.
  const refused = useRef(false);
  // The code that showed last, which an ending keeps on screen, faded (C529-2).
  const lastCode = useRef<CodeEvent | undefined>(undefined);

  const show = useCallback((step: PairingView) => {
    if (step.stage === "code") lastCode.current = step.code;
    setView(step);
  }, []);

  const start = useCallback(() => {
    const mine = ++generation.current;
    setView({ stage: "starting" });
    lastCode.current = undefined;
    remote.startPairing().then(
      (opened) => {
        if (mine !== generation.current) {
          void opened.close();
          return;
        }
        session.current = opened;
        stopFollowing.current = followStream(opened.events(), (event) => {
          if (event.type === "paired" || event.type === "ended") session.current = undefined;
          const step = stepOf(event, refused.current, lastCode.current);
          if (step === "refused") {
            refused.current = true;
            opened.newCode().catch(() => {
              if (mine === generation.current) setView({ stage: "failed" });
            });
          } else if (step !== undefined) {
            refused.current = false;
            show(step);
          }
        });
      },
      () => {
        if (mine === generation.current) setView({ stage: "failed" });
      },
    );
  }, [remote, show]);

  const end = useCallback(async () => {
    generation.current++;
    stopFollowing.current();
    refused.current = false;
    const open = session.current;
    session.current = undefined;
    await open?.close();
  }, []);

  useEffect(() => {
    start();
    return () => void end();
  }, [start, end]);

  const newCode = useCallback(async () => {
    const open = session.current;
    refused.current = false;
    if (open === undefined) {
      await end();
      start();
      return;
    }
    // A pairing that ended meanwhile can't give a code; a new pairing can.
    await open.newCode().catch(async () => {
      await end();
      start();
    });
  }, [end, start]);

  return {
    view,
    newCode,
    allow: () => session.current?.allow() ?? Promise.resolve(),
    deny: () => session.current?.deny() ?? Promise.resolve(),
    close: end,
  };
}
