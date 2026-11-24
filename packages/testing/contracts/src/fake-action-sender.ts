import type {
  ActionAccount,
  ActionCatalogStep,
  ActionJson,
  ActionMethod,
  ActionSender,
  ActionSendRequest,
  ActionSendResult,
  ActionService,
  ActionSignInResult,
  ActionStepRef,
  ActionValue,
} from "@halonicjs/ports";

/** The longest service error message a sender hands back. */
export const maxActionSendErrorLength = 500;

/** One call as it reached the service: the filled path on the service's fixed origin. */
export interface SentActionCall {
  service: ActionService;
  method: ActionMethod;
  path: string;
  body?: ActionJson;
}

/**
 * How a stand-in service answers a call. `fields`: the answer's top-level
 * fields, from which the sender keeps only the step's. `error`: the
 * service's own message for a failed status.
 */
export type StandInAnswer =
  | { status: number; fields?: Readonly<Record<string, unknown>>; error?: string }
  | "unreachable";

/** What a {@link FakeActionSender} sends to and signs in as. */
export interface FakeActionSenderOptions {
  /** The allow-list, as the catalog's generated file would give it. */
  steps: readonly ActionCatalogStep[];
  /** The stand-in service. Defaults to `200` with no fields. */
  answer?: (call: SentActionCall) => StandInAnswer;
  /** Who a sign-in signs in as, by service. A service without one says `cancelled`. */
  signInAs?: Readonly<Record<ActionService, string>>;
}

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const forbiddenInValue = /[/\\?#]/;

/**
 * An {@link ActionSender} that runs in the process against a stand-in
 * service, so the stepper and its screen can be built and tested before the
 * shell's sender exists (requirement `contracts.action-sender`). It holds no
 * token: being signed in is only an account name.
 *
 * It does what every sender must: it sends only steps on its allow-list,
 * takes the method, the path, the body's fields and the kept fields from
 * there, fills each
 * placeholder with one percent-encoded segment, and hands back only the
 * kept fields that hold plain values. `sent` lists every call that reached
 * the stand-in, so a test can see that a refused step sent nothing.
 *
 * @example
 * const sender = new FakeActionSender({ steps, signInAs: { github: "acme-dev" } });
 * await sender.signIn("github");
 * const result = await sender.send({ step: steps[0], values: { owner: "acme", repo: "app" } });
 */
export class FakeActionSender implements ActionSender {
  /** Every call that reached the stand-in service, oldest first. */
  readonly sent: SentActionCall[] = [];
  private readonly steps: readonly ActionCatalogStep[];
  private readonly answer: (call: SentActionCall) => StandInAnswer;
  private readonly signInAs: Readonly<Record<ActionService, string>>;
  private readonly accounts = new Map<ActionService, ActionAccount>();

  constructor(options: FakeActionSenderOptions) {
    this.steps = options.steps;
    this.answer = options.answer ?? (() => ({ status: 200 }));
    this.signInAs = options.signInAs ?? {};
  }

  account(service: ActionService): Promise<ActionAccount | undefined> {
    return Promise.resolve(this.accounts.get(service));
  }

  signIn(service: ActionService): Promise<ActionSignInResult> {
    if (!this.steps.some((step) => step.service === service)) {
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
    const step = this.steps.find((candidate) => isStep(candidate, request.step));
    if (step === undefined) return refused("not-in-catalog");
    const path = fillPath(step.path, request.values);
    if (path === undefined || !isBodyOf(step, request.body)) return refused("bad-value");
    if (!this.accounts.has(step.service)) return refused("signed-out");
    const call: SentActionCall = { service: step.service, method: step.method, path };
    if (request.body !== undefined) call.body = request.body;
    this.sent.push(call);
    return Promise.resolve(resultOf(step, this.answer(call)));
  }
}

const refused = (reason: "not-in-catalog" | "bad-value" | "signed-out") =>
  Promise.resolve<ActionSendResult>({ outcome: "refused", reason });

function isStep(step: ActionCatalogStep, ref: ActionStepRef): boolean {
  return (
    step.definition === ref.definition && step.version === ref.version && step.step === ref.step
  );
}

/**
 * Fills a path's placeholders, each with one encoded segment. `undefined`
 * when a value is missing, extra, empty, `.` or `..`, or holds `/`, `\`,
 * `?` or `#`: such a value could change which route the call reaches.
 */
function fillPath(template: string, values: Readonly<Record<string, string>>): string | undefined {
  const names = [...template.matchAll(placeholder)].map((match) => match[1] ?? "");
  const given = Object.keys(values);
  if (given.length !== names.length || !given.every((name) => names.includes(name))) {
    return undefined;
  }
  if (!names.every((name) => isSegment(values[name]))) return undefined;
  return template.replace(placeholder, (_whole, name: string) =>
    encodeURIComponent(values[name] ?? ""),
  );
}

function isSegment(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "." || value === "..") return false;
  return !forbiddenInValue.test(value);
}

/** No body, or an object whose top-level fields are all the step's body fields. */
function isBodyOf(step: ActionCatalogStep, body: ActionJson | undefined): boolean {
  if (body === undefined) return true;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  return Object.keys(body).every((field) => step.bodyFields.includes(field));
}

function resultOf(step: ActionCatalogStep, answer: StandInAnswer): ActionSendResult {
  if (answer === "unreachable") return { outcome: "unreachable" };
  const succeeded = answer.status >= 200 && answer.status < 300;
  if (!succeeded) {
    const result: ActionSendResult = { outcome: "answered", status: answer.status, kept: {} };
    if (answer.error !== undefined) result.error = answer.error.slice(0, maxActionSendErrorLength);
    return result;
  }
  return { outcome: "answered", status: answer.status, kept: keptFields(step, answer.fields) };
}

/** Only the step's kept fields, and only those holding a plain value. */
function keptFields(
  step: ActionCatalogStep,
  fields: Readonly<Record<string, unknown>> = {},
): Record<string, ActionValue> {
  const kept: Record<string, ActionValue> = {};
  for (const name of step.keep) {
    const value = Object.hasOwn(fields, name) ? fields[name] : undefined;
    if (isPlainValue(value)) kept[name] = value;
  }
  return kept;
}

function isPlainValue(value: unknown): value is ActionValue {
  if (value === null) return true;
  return ["string", "number", "boolean"].includes(typeof value);
}
