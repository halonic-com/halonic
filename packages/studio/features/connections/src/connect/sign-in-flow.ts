import type { MessagingId } from "@halonicjs/ports";
import type {
  AgentConnection,
  AgentConnections,
  SignInChallenge,
  SignInRefusal,
  SignInResult,
} from "@halonicjs/studio-services";
import { useCallback, useEffect, useRef, useState } from "react";

/** Why the address step shows a problem: a refusal before the sign-in started, or no answer at all. */
export type StartProblem = SignInRefusal | "failed";

/** A sign-in that ended without connecting. */
export type EndedResult = Exclude<SignInResult, { readonly outcome: "connected" }>;

/** What the Connect dialog shows, one step at a time. */
export type SignInView =
  | { readonly stage: "address"; readonly problem?: StartProblem }
  | { readonly stage: "starting" }
  | { readonly stage: "waiting"; readonly challenge: SignInChallenge }
  /** `challenge` is the one that ended, so its words stay on screen, faded. */
  | { readonly stage: "ended"; readonly result: EndedResult; readonly challenge: SignInChallenge }
  | { readonly stage: "connected"; readonly connection: AgentConnection };

/** What {@link useSignIn} gives the dialog. */
export interface SignIn {
  readonly view: SignInView;
  /**
   * Starts a sign-in at `address`. It answers the approval page's address once the sign-in has
   * started, so the caller can open it from inside the click; it rejects when none started, and
   * the view then says why.
   */
  readonly start: (address: string) => Promise<string>;
  /** Back to the address step, after a sign-in ended. */
  readonly again: () => void;
  /** Cancels a waiting sign-in, as closing the dialog does. */
  readonly cancel: () => Promise<void>;
  /**
   * Ends a waiting sign-in whose 10 minutes ran out on this clock before the engine said so. It
   * cancels it as a best effort and says nothing if that fails: the engine ends it by itself.
   */
  readonly expire: () => void;
}

/** The step a sign-in's end leads to. */
function viewOfResult(result: SignInResult, challenge: SignInChallenge): SignInView {
  return result.outcome === "connected"
    ? { stage: "connected", connection: result.connection }
    : { stage: "ended", result, challenge };
}

/**
 * Starts one sign-in and shows how starting went. It answers the challenge, or rejects when none
 * started or when `isCurrent` says a newer start or a cancel came first; that one is cancelled
 * at once, so nobody may approve it.
 */
async function startOnce(
  connections: AgentConnections,
  request: Parameters<AgentConnections["signIn"]>[0],
  isCurrent: () => boolean,
  show: (view: SignInView) => void,
): Promise<SignInChallenge> {
  show({ stage: "starting" });
  const answer = await connections.signIn(request).catch((error: unknown) => {
    if (isCurrent()) show({ stage: "address", problem: "failed" });
    throw error;
  });
  if (answer.outcome === "refused") {
    if (isCurrent()) show({ stage: "address", problem: answer.reason });
    throw new Error(`The sign-in was refused: ${answer.reason}`);
  }
  if (!isCurrent()) {
    await answer.challenge.cancel();
    throw new Error("The sign-in was replaced before it started");
  }
  return answer.challenge;
}

/**
 * Follows one sign-in at a time while the dialog is open. Unmounting cancels a waiting sign-in,
 * so a dialog that goes away never leaves one the board could still approve (ADR 2026-11-24,
 * "Sign-in", step 2). `connection` names the signed-out connection to sign in again;
 * `newConnection` asks for another account beside the connections already there.
 */
export function useSignIn(
  connections: AgentConnections,
  connection: MessagingId | undefined,
  newConnection = false,
): SignIn {
  const [view, setView] = useState<SignInView>({ stage: "address" });
  // The waiting sign-in, until it ends.
  const open = useRef<SignInChallenge | undefined>(undefined);
  // Each start and each cancel bumps it, so an answer that comes after either is dropped.
  const generation = useRef(0);

  const cancel = useCallback(async () => {
    generation.current++;
    const waiting = open.current;
    open.current = undefined;
    await waiting?.cancel();
  }, []);

  // The dialog's own close reports a failed cancel. Unmounted without it (Settings closed under
  // the dialog), nobody is left to tell, and the server ends the sign-in within its 10 minutes.
  useEffect(() => () => void cancel().catch(() => undefined), [cancel]);

  const follow = useCallback((challenge: SignInChallenge, mine: number) => {
    open.current = challenge;
    setView({ stage: "waiting", challenge });
    void challenge.result.then((result) => {
      if (mine !== generation.current) return;
      open.current = undefined;
      setView(viewOfResult(result, challenge));
    });
  }, []);

  const start = useCallback(
    async (address: string): Promise<string> => {
      const mine = ++generation.current;
      const request = {
        address,
        ...(connection === undefined ? {} : { connection }),
        ...(newConnection ? { newConnection } : {}),
      };
      const challenge = await startOnce(
        connections,
        request,
        () => mine === generation.current,
        setView,
      );
      follow(challenge, mine);
      return challenge.approvalUrl;
    },
    [connections, connection, newConnection, follow],
  );

  const again = useCallback(() => {
    generation.current++;
    setView({ stage: "address" });
  }, []);

  const expire = useCallback(() => {
    // Cleared first, so a later Start again or Close finds nothing left to cancel.
    generation.current++;
    const waiting = open.current;
    open.current = undefined;
    if (waiting === undefined) return;
    setView({ stage: "ended", result: { outcome: "expired" }, challenge: waiting });
    void waiting.cancel().catch(() => undefined);
  }, []);

  return { view, start, again, cancel, expire };
}
