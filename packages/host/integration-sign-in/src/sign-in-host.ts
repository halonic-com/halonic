import type { SignInGrants } from "@halonicjs/oauth-sign-in";
import type { Clock, Digest, HttpClient, Secrets } from "@halonicjs/ports";
import type { RandomBytes } from "@halonicjs/std";
import {
  createIntegrationSignIns,
  type IntegrationSignIns,
  type SignInSource,
} from "./integration-sign-ins.ts";
import { createSignInFlow, type SignInFlow, type SignInOutcome } from "./sign-in-flow.ts";

/**
 * One integration the host runs sign-ins for. `read` is the one source of its
 * sheet and settings: the kit loader's `choices` and the host's sign-ins both
 * come from the same place, so a changed setting or an updated sheet counts
 * for both at once.
 */
export interface SignInIntegration {
  /** The sheet and settings now. Read each time it is needed, never kept. */
  read(): Promise<SignInSource>;
  /**
   * The secrets as the person picked them for this integration, by the sheet's
   * name (the kit's `chosenSecrets`), so the client secret is read the way the
   * loader reads the integration's own secrets. It must read the picks each
   * time, so a changed pick counts at once.
   */
  readonly secrets: Secrets;
}

/** What {@link createSignInHost} needs. */
export interface SignInHostSettings {
  /** The integration called `name`, or `undefined` when the host runs no sign-ins for it. */
  integration(name: string): SignInIntegration | undefined;
  readonly grants: SignInGrants;
  /** The server's `HttpClient`: no redirects, a limited answer. The flows make it https only. */
  readonly http: HttpClient;
  readonly clock: Clock;
  readonly digest: Digest;
  readonly randomBytes: RandomBytes;
  /** A new signal that aborts after the token request's time limit. */
  requestSignal(): AbortSignal;
  /** Told how each sign-in ended, on top of the host keeping the last one for the status. It never holds a code or a token. It must not throw. */
  onOutcome?(integration: string, outcome: SignInOutcome): void;
}

/**
 * Where one sign-in stands.
 * - `signedIn`: a grant is saved and it belongs to the sign-in the sheet and the settings describe now.
 * - `signedOut`: no grant is saved.
 * - `approvalChanged`: a grant is saved for another sign-in than the one described now. It isn't used; signing in again replaces it.
 * - `cannotSignIn`: a setting the sign-in reads is missing or wrong, so no grant can be compared.
 */
export type SignInState = "signedIn" | "signedOut" | "approvalChanged" | "cannotSignIn";

/** One sign-in of an integration's sheet, as the app shows it. */
export interface SignInStatus {
  readonly signIn: string;
  readonly state: SignInState;
  /** How the last sign-in of this one ended since the host started, if one did. */
  readonly lastOutcome?: SignInOutcome;
}

/** One integration's parts of the host. */
export interface IntegrationSignInParts {
  /** `tokens` is what the loader takes as `signInTokens`. */
  readonly signIns: IntegrationSignIns;
  readonly flow: SignInFlow;
  /** Every sign-in of the sheet and where it stands. */
  status(): Promise<readonly SignInStatus[]>;
}

/** The sign-ins of every integration the app runs. */
export interface SignInHost {
  /** The integration's parts, or `undefined` when the host runs no sign-ins for it. The same parts each time. */
  integration(name: string): IntegrationSignInParts | undefined;
  /**
   * Answers a callback with the flow that owns its path. A path that no flow
   * is waiting on gets the flow's own plain 400, so the answer doesn't tell
   * which paths exist.
   */
  handleCallback(request: Request): Promise<Response>;
}

/** What a callback gets when no integration has started a sign-in at its path. */
const noFlowPage = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><title>Halonic</title><p>This sign-in link is no longer valid.</p>',
    {
      status: 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'",
      },
    },
  );

/**
 * Builds the host's sign-ins for every integration the app runs: each one's
 * tokens for the kit, its flow, and a place to ask where each sign-in stands.
 * An integration's sheet and settings come from its one
 * {@link SignInIntegration.read}, and its client secret is read through the
 * picks the app gives, as the loader reads the integration's own secrets.
 *
 * @example
 * const host = createSignInHost({ integration: (name) => integrations.get(name), grants, http, secrets, clock, digest, randomBytes, requestSignal });
 * const started = await host.integration("gitlab")?.flow.start("work-account", server.port);
 */
export function createSignInHost(settings: SignInHostSettings): SignInHost {
  const built = new Map<string, IntegrationSignInParts>();

  function integration(name: string): IntegrationSignInParts | undefined {
    const known = built.get(name);
    if (known !== undefined) return known;
    const registered = settings.integration(name);
    if (registered === undefined) return undefined;
    const parts = buildParts(name, registered, settings);
    built.set(name, parts);
    return parts;
  }

  async function handleCallback(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    for (const parts of built.values()) {
      if (parts.flow.handlesPath(pathname)) return await parts.flow.handleCallback(request);
    }
    return noFlowPage();
  }

  return { integration, handleCallback };
}

function buildParts(
  name: string,
  registered: SignInIntegration,
  settings: SignInHostSettings,
): IntegrationSignInParts {
  const { secrets } = registered;
  const lastOutcomes = new Map<string, SignInOutcome>();
  const signIns = createIntegrationSignIns({
    integration: name,
    current: async () => await registered.read(),
    grants: settings.grants,
    http: settings.http,
    secrets,
    clock: settings.clock,
    requestSignal: settings.requestSignal,
  });
  const flow = createSignInFlow({
    integration: name,
    signIns,
    grants: settings.grants,
    http: settings.http,
    secrets,
    clock: settings.clock,
    digest: settings.digest,
    randomBytes: settings.randomBytes,
    requestSignal: settings.requestSignal,
    onOutcome: (outcome) => {
      lastOutcomes.set(outcome.signIn, outcome);
      settings.onOutcome?.(name, outcome);
    },
  });
  return {
    signIns,
    flow,
    status: async () => await statusOf(name, registered, signIns, settings.grants, lastOutcomes),
  };
}

async function statusOf(
  name: string,
  registered: SignInIntegration,
  signIns: IntegrationSignIns,
  grants: SignInGrants,
  lastOutcomes: ReadonlyMap<string, SignInOutcome>,
): Promise<SignInStatus[]> {
  const { sheet } = await registered.read();
  return await Promise.all(
    Object.keys(sheet.signIns).map(async (signIn) => {
      const lastOutcome = lastOutcomes.get(signIn);
      return {
        signIn,
        state: await stateOf(name, signIn, signIns, grants),
        ...(lastOutcome === undefined ? {} : { lastOutcome }),
      };
    }),
  );
}

async function stateOf(
  integration: string,
  signIn: string,
  signIns: IntegrationSignIns,
  grants: SignInGrants,
): Promise<SignInState> {
  const found = await signIns.lookUp(signIn);
  if (found.kind !== "approvable") return "cannotSignIn";
  const saved = await grants.load(integration, signIn, found.signIn);
  switch (saved.kind) {
    case "none":
      return "signedOut";
    case "current":
      return "signedIn";
    case "stale":
      return "approvalChanged";
  }
}
