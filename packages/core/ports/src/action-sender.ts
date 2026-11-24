/** Version of the {@link ActionSender} port. A breaking change bumps it and comes with an ADR. */
export const actionSenderVersion = 1;

/** A service a stepper talks to, as the catalog names it, such as `github` or `cloudflare`. */
export type ActionService = string;

/** The HTTP methods a reviewed step may use. */
export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A value a sender hands back from an answer: only plain values, never an object or a list. */
export type ActionValue = string | number | boolean | null;

/** A JSON value, for a step's body. */
export type ActionJson =
  | ActionValue
  | readonly ActionJson[]
  | { readonly [key: string]: ActionJson };

/**
 * One reviewed step, as the sender's allow-list holds it. The list is
 * generated from the action catalog at build time; nothing at run time adds
 * to it. The sender reads the method, the path and the fields to keep from
 * here, never from whoever asks it to send.
 */
export interface ActionCatalogStep {
  /** The definition's id, such as `github.approve-deployment`. */
  definition: string;
  /** The definition's major version. */
  version: number;
  /** The step's number in the definition, from 1. */
  step: number;
  service: ActionService;
  method: ActionMethod;
  /**
   * The path on the service's fixed origin, with `{name}` placeholders, such
   * as `/repos/{owner}/{repo}/actions/runs/{runId}/approve`.
   */
  path: string;
  /** The top-level fields the step's body may have; empty for a step that sends no body. */
  bodyFields: readonly string[];
  /** The top-level fields of a successful answer the sender hands back, named one by one. */
  keep: readonly string[];
}

/** Which reviewed step to send: never an address, a method or a header. */
export interface ActionStepRef {
  definition: string;
  version: number;
  step: number;
}

/** A request to send one reviewed step. */
export interface ActionSendRequest {
  step: ActionStepRef;
  /** A value for each of the step's placeholders, and nothing else. Each fills exactly one path segment. */
  values: Readonly<Record<string, string>>;
  /** The body the catalog's code built for the step, if the step has one. */
  body?: ActionJson;
}

/**
 * Why a send was refused before anything left the computer.
 * `not-in-catalog`: no reviewed step matches the reference.
 * `bad-value`: a placeholder's value is missing, extra, empty, `.`, `..`, or holds `/`, `\`, `?` or `#`;
 * or the body isn't an object of the step's body fields.
 * `signed-out`: the user isn't signed in to the step's service.
 */
export type ActionRefusal = "not-in-catalog" | "bad-value" | "signed-out";

/** What sending a step did. */
export type ActionSendResult =
  | {
      outcome: "answered";
      status: number;
      /** Only the step's `keep` fields that the answer had; empty for a failed status. */
      kept: Readonly<Record<string, ActionValue>>;
      /** For a failed status, the service's own error message, capped: untrusted text, shown quoted. */
      error?: string;
    }
  | { outcome: "refused"; reason: ActionRefusal }
  | { outcome: "unreachable" };

/** The account the user is signed in to a service with. Its name only: never a token. */
export interface ActionAccount {
  service: ActionService;
  /** What the service calls the account, such as a GitHub login. */
  name: string;
}

/** What a sign-in did. */
export type ActionSignInResult =
  | { outcome: "signed-in"; account: ActionAccount }
  | { outcome: "cancelled" }
  | { outcome: "not-available" };

/**
 * How Studio sends the steps of a stepper the user runs, with the user's own
 * sign-in to the service (requirement `ports.action-sender`, ADR
 * 2026-11-24, action sender). Only the user runs steps: an agent, the
 * engine and the agent host never get an `ActionSender`, they can only file
 * a request.
 *
 * A send names a reviewed step, never an address. The sender takes the
 * method, the path and the fields to keep from its allow-list of catalog
 * steps, fills each placeholder with one percent-encoded path segment, sends
 * to the service's fixed origin with the user's token, follows no redirect,
 * and hands back only the step's kept fields. The token stays inside the
 * sender: no call takes one or gives one back.
 *
 * @example
 * const result = await sender.send({
 *   step: { definition: "github.approve-run", version: 1, step: 2 },
 *   values: { owner: "acme", repo: "app", runId: "123456" },
 * });
 */
export interface ActionSender {
  /** The account signed in to the service, or `undefined` when nobody is. */
  account(service: ActionService): Promise<ActionAccount | undefined>;
  /** Starts the service's sign-in. Called only from a user's click, never from a request. */
  signIn(service: ActionService): Promise<ActionSignInResult>;
  /** Forgets the service's token. Does nothing when nobody is signed in. */
  signOut(service: ActionService): Promise<void>;
  /** Sends one reviewed step, or refuses it before sending. */
  send(request: ActionSendRequest): Promise<ActionSendResult>;
}
