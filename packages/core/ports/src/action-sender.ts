/** Version of the {@link ActionSender} port. A breaking change bumps it and comes with an ADR. */
export const actionSenderVersion = 1;

/** A service a stepper talks to, as the catalog names it, such as `github` or `cloudflare`. */
export type ActionService = string;

/** The HTTP methods a reviewed step may use. */
export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A plain value: what a body field holds and what a sender hands back from an answer. */
export type ActionValue = string | number | boolean | null;

/**
 * How risky a step is. `admin` and `irreversible` steps are confirmed in the
 * sender's own native dialog, which the page can't draw or click.
 */
export type ActionRisk = "routine" | "admin" | "irreversible";

/**
 * What a body field holds. `constant`: the route's own value, such as a
 * GraphQL query's text, which the sender adds itself. `secret-input`: a value
 * the user types into the sender's native dialog during the send, so it never
 * passes through the page. The page sends neither.
 */
export type ActionBodyFieldKind =
  | "string"
  | "integer"
  | "boolean"
  | "integer-list"
  | "constant"
  | "secret-input";

/** One top-level field of a step's body, as the route list declares it. */
export interface ActionBodyField {
  name: string;
  kind: ActionBodyFieldKind;
  /** For `string`: the pattern the whole value must match. */
  pattern?: string;
  /** For `constant`: the value the sender sends. */
  value?: ActionValue;
}

/** What every route in the list has: the step it belongs to and its placeholders. */
interface ActionRouteBase {
  /** The definition's id, such as `github.approve-run`. */
  definition: string;
  /** The definition's major version. */
  version: number;
  /** The step's number in the definition, from 1. */
  step: number;
  service: ActionService;
  risk: ActionRisk;
  /** Each placeholder's name and the pattern its whole value must match. */
  placeholders: Readonly<Record<string, string>>;
}

/** A step that calls the service's API on its fixed origin. */
export interface ActionCallRoute extends ActionRouteBase {
  kind: "call";
  method: ActionMethod;
  /** The path with `{name}` placeholders, such as `/repos/{owner}/{repo}/actions/runs/{runId}/approve`. */
  path: string;
  body: readonly ActionBodyField[];
  /** The fields of a successful answer the sender hands back, named one by one; a dotted name (at most 3 keys) reads inside objects. */
  keep: readonly string[];
}

/** A guided step: a page on the service's own web origin that the sender opens in the user's browser. */
export interface ActionGuidedRoute extends ActionRouteBase {
  kind: "guided";
  /** The address with `{name}` placeholders, such as `https://github.com/{owner}/{repo}/settings/secrets/actions/new`. */
  address: string;
}

/**
 * One reviewed step, as the sender's route list holds it. The list is
 * generated from the action catalog at build time and compiled into the
 * sender; nothing at run time adds to it, and no call of the port reads it.
 */
export type ActionRoute = ActionCallRoute | ActionGuidedRoute;

/** Which reviewed step: never an address, a method or a header. */
export interface ActionStepRef {
  definition: string;
  version: number;
  step: number;
  /** A value for each of the step's placeholders, and nothing else. Each fills exactly one path segment. */
  placeholders: Readonly<Record<string, string>>;
}

/** A request to send one reviewed call step. */
export interface ActionSendRequest extends ActionStepRef {
  /** The step's body fields, except its `constant` and `secret-input` fields, which the sender fills. */
  body?: Readonly<Record<string, ActionValue | readonly number[]>>;
}

/**
 * Why a send or an open was refused before anything left the computer.
 * `not-in-catalog`: no route of that kind matches the step.
 * `bad-value`: a placeholder or body field is missing, extra, of the wrong kind or doesn't match its pattern, or a
 * placeholder is `.` or `..` or holds `/`, `\`, `?`, `#` or `%`.
 * `signed-out`: the user isn't signed in to the step's service.
 * `too-often`: the sender opens a guided page once per step per click.
 */
export type ActionRefusal = "not-in-catalog" | "bad-value" | "signed-out" | "too-often";

/** What sending a step did. `cancelled`: the user closed the sender's native dialog, and nothing was sent. */
export type ActionSendResult =
  | {
      outcome: "answered";
      status: number;
      /** Only the route's `keep` fields that the answer had as plain values; empty for a failed status. */
      kept: Readonly<Record<string, ActionValue>>;
      /**
       * For a failed status, the service's own message, cut to `maxActionErrorLength` of `@halonicjs/events` and with
       * anything that looks like a token dropped: untrusted text, shown quoted.
       */
      error?: string;
    }
  | { outcome: "refused"; reason: ActionRefusal }
  | { outcome: "cancelled" }
  | { outcome: "unreachable" };

/** What opening a guided step's page did. */
export type ActionOpenResult =
  | { outcome: "opened" }
  | { outcome: "refused"; reason: ActionRefusal };

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
 * How Studio runs the steps of a stepper the user runs, with the user's own
 * sign-in to the service (requirement `ports.action-sender`, ADR
 * 2026-11-24, action sender). Only the user runs steps: agents, the engine,
 * the agent host and the harness bridge never get an `ActionSender`; an
 * agent can only file a request.
 *
 * A call names a reviewed step, never an address. The sender takes the
 * method, the path, the body's fields and the fields to keep from its route
 * list, checks every placeholder and body field against it, fills each
 * placeholder with one percent-encoded path segment, sends to the service's
 * own origin with the user's token, follows no redirect, and hands back only
 * the route's kept fields. It asks for confirmation of `admin` and
 * `irreversible` steps, and for `secret-input` values, in its own native
 * dialog. The token and secret values stay inside the sender: no call takes
 * or gives one.
 *
 * @example
 * const result = await sender.send({
 *   definition: "github.approve-run",
 *   version: 1,
 *   step: 2,
 *   placeholders: { owner: "acme", repo: "app", runId: "123456" },
 * });
 */
export interface ActionSender {
  /** The account signed in to the service, or `undefined` when nobody is. */
  account(service: ActionService): Promise<ActionAccount | undefined>;
  /** Starts the service's sign-in. Called only from a user's click, never from a request. */
  signIn(service: ActionService): Promise<ActionSignInResult>;
  /** Forgets the service's token. Does nothing when nobody is signed in. */
  signOut(service: ActionService): Promise<void>;
  /** Sends one reviewed call step, or refuses it before sending. */
  send(request: ActionSendRequest): Promise<ActionSendResult>;
  /** Opens one reviewed guided step's page in the user's browser, or refuses it. */
  openGuided(request: ActionStepRef): Promise<ActionOpenResult>;
}
