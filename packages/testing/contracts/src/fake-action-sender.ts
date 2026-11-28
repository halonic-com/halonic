import { maxActionErrorLength } from "@halonicjs/events";
import type {
  ActionAccount,
  ActionCallRoute,
  ActionMethod,
  ActionOpenResult,
  ActionRefusal,
  ActionRoute,
  ActionSender,
  ActionSendRequest,
  ActionSendResult,
  ActionService,
  ActionSignInResult,
  ActionStepRef,
  ActionValue,
} from "@halonicjs/ports";
import {
  filledBySender,
  fillTemplate,
  isPageBody,
  keptFields,
  routeFor,
  type SentActionBody,
} from "./action-route-check.ts";

/** One call as it reached the service: the filled path on the service's own origin, and the whole body. */
export interface SentActionCall {
  service: ActionService;
  method: ActionMethod;
  path: string;
  body?: SentActionBody;
}

/**
 * How a stand-in service answers a call. `fields`: the answer's fields, from
 * which the sender keeps only the route's, walking a dotted name one object
 * key at a time (`keptFields`). `error`: the service's own message for a
 * failed status.
 */
export type StandInAnswer =
  | { status: number; fields?: Readonly<Record<string, unknown>>; error?: string }
  | "unreachable";

/** How the stand-in user answers the sender's native dialog. */
export interface StandInUser {
  /** Whether they confirm an `admin` or `irreversible` step. */
  confirms: boolean;
  /** What they type for a `secret-input` field; `undefined` closes the dialog. */
  secret: (field: string) => string | undefined;
}

/** What a {@link FakeActionSender} sends to, signs in as and asks. */
export interface FakeActionSenderOptions {
  /** The route list, as the catalog's generated file would give it. */
  routes: readonly ActionRoute[];
  /** The stand-in service. Defaults to `200` with no fields. */
  answer?: (call: SentActionCall) => StandInAnswer;
  /** Who a sign-in signs in as, by service. A service without one says `cancelled`. */
  signInAs?: Readonly<Record<ActionService, string>>;
  /** The stand-in user at the native dialog. Defaults to one who confirms and types no secret. */
  user?: StandInUser;
}

/**
 * An {@link ActionSender} that runs in the process against a stand-in
 * service, so the stepper and its screen can be built and tested before the
 * shell's sender exists (requirement `contracts.action-sender`). It holds no
 * token: being signed in is only an account name.
 *
 * It does what every sender must: it runs only steps on its route list,
 * takes the method, the path, the body's fields and the kept fields from
 * there, fills each placeholder with one percent-encoded segment, asks the
 * stand-in user to confirm risky steps and to type secret inputs, and hands
 * back only kept fields that hold plain values. `sent` and `opened` list
 * everything that left it, so a test can see that a refused step sent nothing.
 *
 * @example
 * const sender = new FakeActionSender({ routes, signInAs: { github: "acme-dev" } });
 * await sender.signIn("github");
 */
export class FakeActionSender implements ActionSender {
  /** Every call that reached the stand-in service, oldest first. */
  readonly sent: SentActionCall[] = [];
  /** Every guided page opened in the browser, oldest first. */
  readonly opened: string[] = [];
  private readonly routes: readonly ActionRoute[];
  private readonly answer: (call: SentActionCall) => StandInAnswer;
  private readonly signInAs: Readonly<Record<ActionService, string>>;
  private readonly user: StandInUser;
  private readonly accounts = new Map<ActionService, ActionAccount>();

  constructor(options: FakeActionSenderOptions) {
    this.routes = options.routes;
    this.answer = options.answer ?? (() => ({ status: 200 }));
    this.signInAs = options.signInAs ?? {};
    this.user = options.user ?? { confirms: true, secret: () => undefined };
  }

  account(service: ActionService): Promise<ActionAccount | undefined> {
    return Promise.resolve(this.accounts.get(service));
  }

  signIn(service: ActionService): Promise<ActionSignInResult> {
    if (!this.routes.some((route) => route.service === service)) {
      return Promise.resolve({ outcome: "not-available" });
    }
    const name = Object.hasOwn(this.signInAs, service) ? this.signInAs[service] : undefined;
    if (name === undefined) return Promise.resolve({ outcome: "cancelled" });
    const account = { service, name };
    this.accounts.set(service, account);
    return Promise.resolve({ outcome: "signed-in", account });
  }

  signOut(service: ActionService): Promise<void> {
    this.accounts.delete(service);
    return Promise.resolve();
  }

  send(request: ActionSendRequest): Promise<ActionSendResult> {
    const route = routeFor(this.routes, request, "call");
    if (route === undefined) return refused("not-in-catalog");
    const path = fillTemplate(route.path, route.placeholders, request.placeholders);
    if (path === undefined || !isPageBody(route, request.body)) return refused("bad-value");
    if (!this.accounts.has(route.service)) return refused("signed-out");
    if (route.risk !== "routine" && !this.user.confirms) return cancelled();
    const body = this.fullBody(route, request.body);
    if (body === undefined) return cancelled();
    const call: SentActionCall = { service: route.service, method: route.method, path };
    if (route.body.length > 0) call.body = body;
    this.sent.push(call);
    return Promise.resolve(resultOf(route, this.answer(call)));
  }

  openGuided(request: ActionStepRef): Promise<ActionOpenResult> {
    const route = routeFor(this.routes, request, "guided");
    if (route === undefined)
      return Promise.resolve({ outcome: "refused", reason: "not-in-catalog" });
    const address = fillTemplate(route.address, route.placeholders, request.placeholders);
    if (address === undefined) return Promise.resolve({ outcome: "refused", reason: "bad-value" });
    this.opened.push(address);
    return Promise.resolve({ outcome: "opened" });
  }

  /** The page's fields plus the route's constants and the secrets the user typed; `undefined` if they closed the dialog. */
  private fullBody(route: ActionCallRoute, pageBody: ActionSendRequest["body"]) {
    const body: Record<string, ActionValue | readonly number[]> = { ...pageBody };
    for (const field of route.body.filter(filledBySender)) {
      const value = field.kind === "constant" ? field.value : this.user.secret(field.name);
      if (value === undefined) return undefined;
      body[field.name] = value;
    }
    return body;
  }
}

const refused = (reason: ActionRefusal) =>
  Promise.resolve<ActionSendResult>({ outcome: "refused", reason });

const cancelled = () => Promise.resolve<ActionSendResult>({ outcome: "cancelled" });

function resultOf(route: ActionCallRoute, answer: StandInAnswer): ActionSendResult {
  if (answer === "unreachable") return { outcome: "unreachable" };
  const succeeded = answer.status >= 200 && answer.status < 300;
  if (succeeded) {
    return { outcome: "answered", status: answer.status, kept: keptFields(route, answer.fields) };
  }
  const result: ActionSendResult = { outcome: "answered", status: answer.status, kept: {} };
  if (answer.error !== undefined) result.error = answer.error.slice(0, maxActionErrorLength);
  return result;
}
