import type { ActionAccount } from "./action-sender.ts";

/** Version of the {@link ServiceSignIn} port. A breaking change bumps it and comes with an ADR. */
export const serviceSignInVersion = 1;

/**
 * The services a stepper can sign in to through this port. Only Paperclip:
 * another service is a reviewed change to the port (Liam, HAL-17545).
 */
export type SignInService = "paperclip";

/** Which connection a sign-in is for: one of the workspace's connection files, by name. */
export interface SignInConnectionRef {
  service: SignInService;
  /** The connection file's name, without `.yaml`. */
  connection: string;
  /**
   * The host the request names, such as `paperclip.acme.example`. The port refuses a connection
   * whose file has another address, so the request can't steer a sign-in to another host.
   */
  host: string;
}

/** What the connection file says, to show before anything is sent. Never a key. */
export interface SignInConnection {
  /** The connection file's address: `https://` and the host. */
  address: string;
  /** The connection file's company. */
  company: string;
}

/**
 * Why a sign-in didn't start. `no-connection`: no connection file of that name.
 * `other-host`: the connection file's address isn't `https://` and the request's host.
 * `already-signed-in`: the sign-in would write over a key: the shell keeps one for this connection
 * name, or the agent host holds one. A test refuses any such key; another sign-in refuses one that
 * Paperclip still takes.
 * `unreachable`: Paperclip didn't answer. `too-many-sign-ins`: the host has too many open.
 */
export type SignInRefusal =
  | "no-connection"
  | "other-host"
  | "already-signed-in"
  | "unreachable"
  | "too-many-sign-ins";

/** What starting a sign-in did. */
export type SignInStart =
  | {
      outcome: "started";
      signInId: string;
      /** The short code the approval page shows too, for the user to compare. */
      code: string;
      /** The approval page: `https`, on the connection file's own address, under `/cli-auth/`. */
      approvalUrl: string;
      /** When the sign-in ends as `expired`, as an ISO time: at most 10 minutes after the start. */
      expiresAt: string;
    }
  | { outcome: "refused"; reason: SignInRefusal };

/**
 * How a followed sign-in ended. `signed-in`: the key is in the keychain. `wrong-company`: the
 * approver isn't in the connection's company, and the key was revoked. `keyMayWork`: Paperclip
 * couldn't say how the sign-in ended and the key couldn't be revoked, so it may work until it
 * expires.
 */
export type SignInEnd =
  | { outcome: "signed-in"; account: ActionAccount }
  | { outcome: "expired" | "cancelled"; keyMayWork?: true }
  | { outcome: "wrong-company" };

/**
 * What revoking a test sign-in did. `revoked`: Paperclip no longer takes the key, and the keychain
 * holds none. `still-works`: Paperclip may still take it, or the keychain couldn't delete it.
 */
export type SignInRevoke =
  | { outcome: "revoked" }
  | { outcome: "not-a-test" }
  | { outcome: "still-works" }
  | { outcome: "unreachable" };

/**
 * A service's own sign-in, run by a stepper step in the foreground
 * (requirement `ports.service-sign-in`; architecture note on HAL-17491, 6.7;
 * Liam's approval on HAL-17545). It reuses the service's existing sign-in and
 * sends no request of its own. Only Studio holds one: agents, the engine and
 * the harness bridge never get a `ServiceSignIn`.
 *
 * The key goes from the sign-in straight to the OS keychain: no call takes or
 * gives one. Aborting {@link ServiceSignIn.follow} cancels the poll and
 * leaves no key behind, even when the abort comes after the keychain write.
 * A sign-in, its account check and its test revoke are not ToolScript
 * capabilities: they never run through `ctx`.
 *
 * @example
 * const started = await signIn.start(ref, { test: true });
 * if (started.outcome === "started") await signIn.follow(started.signInId, closed.signal);
 */
export interface ServiceSignIn {
  /** The connection file's address and company, or `undefined` when there is no such file. */
  connection(ref: SignInConnectionRef): Promise<SignInConnection | undefined>;
  /**
   * Starts a sign-in. Called only from a user's click, never from a request. With `test`, it
   * refuses a connection the shell keeps a key for, or whose key the agent host holds, so a test can
   * only ever revoke its own key. Without it, it refuses such a key while Paperclip still takes it,
   * so a working key is never replaced unrevoked.
   */
  start(ref: SignInConnectionRef, options: { test: boolean }): Promise<SignInStart>;
  /** Polls until the sign-in ends and writes the key to the keychain; `signal` ends it as `cancelled`. */
  follow(signInId: string, signal: AbortSignal): Promise<SignInEnd>;
  /** Ends a started sign-in that isn't being followed, such as when the stepper closes before step 3. */
  cancel(signInId: string): Promise<void>;
  /** Who the connection's key signs in as, by name only; `undefined` when the service refuses it. */
  whoAmI(ref: SignInConnectionRef): Promise<ActionAccount | undefined>;
  /**
   * Revokes the key of a test sign-in that ended `signed-in`, removes it from the keychain, and
   * checks that the service refuses it now. Any other sign-in answers `not-a-test`.
   */
  revokeTest(signInId: string): Promise<SignInRevoke>;
}
