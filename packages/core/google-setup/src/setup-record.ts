import { type Infer, parse, s } from "@halonicjs/schema-kit";
import { isReasonCode } from "./check-answer.ts";
import { enableApiUrl, isApiHost, isProjectId } from "./console-links.ts";
import type { StepId } from "./setup-step.ts";
import { isSetupRef } from "./store-names.ts";

/**
 * The record store collection that holds the setup records. Workspace
 * collection ids must start with a letter or digit, so no hub or workspace
 * collection can have this name, as with `_tokens`.
 */
export const setupCollection = "_google_setups";

/** A time as `Date.toISOString` writes it, which is how the record stamps every change. */
const time = s.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/**
 * When each step was marked done; a step that isn't done has no key. Typed
 * as a `Record` over `StepId`, so a new step id doesn't compile until it is
 * listed here.
 */
const stepTicks: Record<StepId, ReturnType<typeof time.optional>> = {
  project: time.optional(),
  apis: time.optional(),
  consent: time.optional(),
  scopes: time.optional(),
  client: time.optional(),
  credentials: time.optional(),
  "sign-in": time.optional(),
};

/** A client or account ref, checked as the token names check it (plan D2). */
const ref = s.string().refine(isSetupRef);

/**
 * A Google OAuth client ID, such as `1234-abc.apps.googleusercontent.com`.
 * Only lower-case letters, digits and the fixed ending, so a client secret
 * pasted into the wrong field (`GOCSPX-…`) can never be saved as one.
 */
const clientIdPattern = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/** A service id from an integration sheet, such as `gmail`. */
const serviceIdPattern = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * A Google scope as a sheet may list it: `https://www.googleapis.com/auth/<name>`
 * or a sign-in scope without a URL. The same rule as the sheet check
 * (`GOOGLE_SCOPE_PATTERN` in `@halonicjs/format`).
 */
const scopePattern =
  /^(?:https:\/\/www\.googleapis\.com\/auth\/[a-z][a-z0-9._-]*|openid|email|profile)$/;

/**
 * Google's name for an API, from the service's sheet, such as `Gmail API` or
 * `Cloud Pub/Sub API`. Short and plain, with no `:`, so no link with a scheme
 * fits. The same rule as the sheet check (`GOOGLE_API_NAME_PATTERN` in
 * `@halonicjs/format`), so a name the sheet check takes is never refused here.
 */
const apiNamePattern = /^[A-Za-z0-9][A-Za-z0-9 ()&'/.,-]{0,79}$/;

/** A project number, as Google's answer names the project. */
const projectNumberPattern = /^\d{1,20}$/;

/** A project ID from the setup, or else a project number from Google's answer. */
function isProject(text: string): boolean {
  return isProjectId(text) || projectNumberPattern.test(text);
}

/**
 * Whether an `apiOff` result is whole: the API, its name and the link come
 * together, and the link is the one `enableApiUrl` makes from the API and the
 * project, so the record can't hold any other URL.
 *
 * The object check runs even when a field check has already failed, so it
 * checks the API host again before it makes a link: `enableApiUrl` throws
 * for anything else, and a throw would turn a refused edit or a damaged
 * record into a crash.
 */
function isWholeApiOff(apiOff: {
  api?: string;
  apiName?: string;
  project?: string;
  enableUrl?: string;
}): boolean {
  const { api, apiName, project, enableUrl } = apiOff;
  if (api === undefined) {
    return apiName === undefined && enableUrl === undefined;
  }
  if (!isApiHost(api)) {
    return false;
  }
  return apiName !== undefined && enableUrl === enableApiUrl(api, project);
}

/**
 * B3's `ServiceCheckOutcome` as the record keeps it (plan D5 rev. 5). Every
 * text has a tight shape and every object is strict, so no token, secret or
 * free text from Google's answer can be stored here.
 */
const checkOutcome = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("works") }).strict(),
  s.object({ kind: s.literal("allowed") }).strict(),
  s
    .object({
      kind: s.literal("scopeNotGranted"),
      missingScopes: s.array(s.string().regex(scopePattern)).min(1).max(50).readonly(),
    })
    .strict(),
  s
    .object({
      kind: s.literal("apiOff"),
      api: s.string().refine(isApiHost).exactOptional(),
      apiName: s.string().regex(apiNamePattern).exactOptional(),
      project: s.string().refine(isProject).exactOptional(),
      enableUrl: s.string().exactOptional(),
    })
    .strict()
    .refine(isWholeApiOff),
  s
    .object({
      kind: s.literal("checkFailed"),
      status: s.number().int().min(100).max(599),
      reason: s.string().refine(isReasonCode).exactOptional(),
    })
    .strict(),
  s.object({ kind: s.literal("unreachable") }).strict(),
]);

/** The last check after sign-in for one service, and when it ran. */
const serviceResult = s.object({ result: checkOutcome, checkedAt: time }).strict();

/**
 * Why Google refused the last token refresh (design 5.2). The order is from
 * the least to the most a fix needs; a later refusal never moves an account
 * down it (see `strictestRefusal`).
 * - `client`: the client secret was refused; a new secret fixes it.
 * - `sign-in`: the refresh token was refused; only a new sign-in fixes it.
 * - `client-gone`: a new secret was refused too, so the client is gone; only
 *   a new client and a new sign-in fix it.
 */
export const refreshRefusalReasons = ["client", "sign-in", "client-gone"] as const;

/** One of `refreshRefusalReasons`. */
export type RefreshRefusalReason = (typeof refreshRefusalReasons)[number];

/**
 * A refused refresh, so no run refreshes again until it is fixed: no retry
 * loop. It holds a fixed word and a time, never a token, a secret or text
 * from Google. `at` is for "since when" only; no code may use it to decide
 * whether to refresh again.
 */
const refreshRefused = s
  .object({ reason: s.enum(refreshRefusalReasons), at: time })
  .strict()
  .nullable()
  // Records written before HAL-709 have no such key: they read as not refused.
  // A key that is there but malformed fails the record, so it can't refresh.
  .default(null);

/**
 * The values of a setup record as stored. Every key is always there, `null`
 * when it isn't set yet, so an update can clear a value by writing `null`.
 *
 * **The keys are the whole list of what the record may hold** (plan D5).
 * `.strict()` refuses any other key, so nothing can add the client secret,
 * a refresh, access or ID token, the authorisation code, the PKCE
 * `code_verifier` or the `state` to it. The e-mail address stays in the
 * connector settings, not here.
 */
const setupValues = s
  .object({
    route: s.object({ app: s.literal("own"), runsOn: s.literal("this-computer") }).strict(),
    accountType: s.enum(["workspace", "personal"]),
    /** When the setup was started, for "You started this on 8 Nov". */
    startedAt: time,
    projectId: s.string().refine(isProjectId).nullable(),
    stepsDone: s.object(stepTicks).strict(),
    /** When the user ticked "In production" (personal accounts, step 3). */
    inProductionTickedAt: time.nullable(),
    clientId: s.string().regex(clientIdPattern).nullable(),
    /**
     * The ref of the client secret in the `TokenStore` and when it was saved.
     * Never the secret itself. Accounts that share a client hold the same ref.
     */
    clientSecret: s.object({ clientRef: ref, savedAt: time }).strict().nullable(),
    /** When a sign-in was started and hasn't come back, for "didn't finish". */
    signInStartedAt: time.nullable(),
    /** When the last sign-in came back, for the 7-day hint. */
    lastSignInAt: time.nullable(),
    /** The last check after sign-in per ticked service, by service id. */
    services: s.record(s.string().regex(serviceIdPattern), serviceResult),
    /** The last refused token refresh, until a sign-in or an accepted secret clears it. */
    refreshRefused,
  })
  .strict();

/** The stored values of a setup record, without its account ref. */
export type SetupValues = Infer<typeof setupValues>;

/** One Google account's saved setup progress (design 3.6, plan D5). */
export interface SetupRecord extends SetupValues {
  /** The random ref the record is kept under. Never an e-mail address. */
  readonly accountRef: string;
}

/**
 * Checks stored values. The issues are dropped on purpose: a damaged or
 * edited record could hold anything, and an issue message may repeat it.
 */
export function parseSetupValues(values: unknown): SetupValues | undefined {
  const parsed = parse(setupValues, values);
  return parsed.ok ? parsed.value : undefined;
}

/** Whether a text can be a service id in the record. */
export function isServiceId(text: string): boolean {
  return serviceIdPattern.test(text);
}
