import type { PairedPhone, PairingEvent, PairingSession, RemoteControl } from "@halonicjs/ports";
import { useCallback, useEffect, useRef, useState } from "react";
import { followStream } from "../remote-state.ts";

/** A code to show: waiting for a phone to scan or type it. */
export type CodeEvent = Extract<PairingEvent, { readonly type: "code" }>;
/** A phone used the code: its check code waits for Allow. */
export type CheckEvent = Extract<PairingEvent, { readonly type: "check" }>;

/** What the Pair a phone dialog shows, one step at a time. */
export type PairingView =
  | { readonly stage: "starting" }
  | { readonly stage: "code"; readonly code: CodeEvent }
  | { readonly stage: "check"; readonly check: CheckEvent }
  | { readonly stage: "paired"; readonly phone: PairedPhone }
  /** The pairing ended without a phone, or never opened. */
  | { readonly stage: "ended" };

/** The step a pairing event leads to. */
export function viewOf(event: PairingEvent): PairingView {
  switch (event.type) {
    case "code":
      return { stage: "code", code: event };
    case "check":
      return { stage: "check", check: event };
    case "paired":
      return { stage: "paired", phone: event.phone };
    case "ended":
      return { stage: "ended" };
  }
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
 * pairing the person ended themselves (`closed`) shows nothing more.
 */
export function usePairing(remote: RemoteControl): Pairing {
  const [view, setView] = useState<PairingView>({ stage: "starting" });
  const session = useRef<PairingSession | undefined>(undefined);
  // Each start bumps it; a session that opens after a newer start, or after unmount, is closed.
  const generation = useRef(0);
  const stopFollowing = useRef<() => void>(() => undefined);

  const start = useCallback(() => {
    const mine = ++generation.current;
    setView({ stage: "starting" });
    remote.startPairing().then(
      (opened) => {
        if (mine !== generation.current) {
          void opened.close();
          return;
        }
        session.current = opened;
        stopFollowing.current = followStream(opened.events(), (event) => {
          if (event.type === "ended" && event.reason === "closed") return;
          setView(viewOf(event));
        });
      },
      () => {
        if (mine === generation.current) setView({ stage: "ended" });
      },
    );
  }, [remote]);

  const end = useCallback(async () => {
    generation.current++;
    stopFollowing.current();
    const open = session.current;
    session.current = undefined;
    await open?.close();
  }, []);

  useEffect(() => {
    start();
    return () => void end();
  }, [start, end]);

  const newCode = useCallback(async () => {
    await end();
    start();
  }, [end, start]);

  return {
    view,
    newCode,
    allow: () => session.current?.allow() ?? Promise.resolve(),
    deny: () => session.current?.deny() ?? Promise.resolve(),
    close: end,
  };
}
