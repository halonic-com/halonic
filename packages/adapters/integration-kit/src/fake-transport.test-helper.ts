import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import type { Secrets, SignInTokens, TokenStore } from "@halonicjs/ports";
import { SignInNeededError } from "@halonicjs/ports";
import { IntegrationRefusedError, type RefusalCode } from "./integration/index.ts";
import { createLimitedHttpClient, type RequestLimits } from "./limited-http.ts";
import type { DeclaredPlacement, IntegrationPolicy } from "./policy.ts";
import { RequestLog } from "./request-log.ts";

/** A request as the fake transport saw it, with the headers and body the kit actually sent. */
export interface SentRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  redirect: RequestInit["redirect"];
}

/**
 * A transport that answers from a function and records what was sent, and
 * the options object itself, to check what else reached the transport.
 */
export function fakeTransport(
  answer: (url: URL, method: string) => Response = () => new Response("ok"),
) {
  const sent: SentRequest[] = [];
  const options: RequestInit[] = [];
  // Answers without a network, so there is no address to check.
  const transport = {
    fetch: async (url: string, init: RequestInit = {}) => {
      options.push(init);
      init.signal?.throwIfAborted();
      const body =
        init.body === undefined || init.body === null ? null : await new Response(init.body).text();
      sent.push({
        url,
        method: init.method ?? "GET",
        headers: Object.fromEntries(new Headers(init.headers)),
        body,
        redirect: init.redirect,
      });
      return answer(new URL(url), init.method ?? "GET");
    },
  } as AddressCheckingHttpClient;
  return { transport, sent, options };
}

/** Canary values: tests fail if one shows up anywhere but where the kit put it. */
export const canary = {
  "example-key": "canary-example-key-7f3a",
  "client-secret": "canary-client-secret-91c2",
  "account-client-secret": "canary-account-client-secret-5d1e",
};

/** Canary values for a sign-in's tokens, which only Halonic's side may hold. */
export const tokenCanary = {
  access: "canary-access-token-a1b2c3d4",
  older: "canary-older-access-token-e5f6a7b8",
  refresh: "canary-refresh-token-c9d0e1f2",
};

/**
 * A stand-in for Halonic's sign-in code: it gives `access` as the current
 * token, lists the older token, the refresh token and the client secret for
 * the filter, and records what the kit asked and reported.
 */
export function fakeSignInTokens(
  options: { access?: string; needsSignIn?: boolean } = {},
): SignInTokens & {
  /** The token the next `access` gives; a test changes it to simulate a refresh. */
  current: string;
  readonly asked: string[];
  readonly rejectedCalls: { signIn: string; value: string }[];
} {
  const asked: string[] = [];
  const rejectedCalls: { signIn: string; value: string }[] = [];
  const tokens = {
    current: options.access ?? tokenCanary.access,
    asked,
    rejectedCalls,
    access: async (signIn: string) => {
      asked.push(signIn);
      if (options.needsSignIn) throw new SignInNeededError(signIn);
      return tokens.current;
    },
    rejected: (signIn: string, value: string) => {
      rejectedCalls.push({ signIn, value });
    },
    filterValues: () => [
      tokens.current,
      tokenCanary.older,
      tokenCanary.refresh,
      canary["account-client-secret"],
    ],
  };
  return tokens;
}

export const secrets: Secrets = {
  get: async (name) => (Object.hasOwn(canary, name) ? canary[name as keyof typeof canary] : null),
};

export function memoryTokens(): TokenStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
  };
}

export const policy: IntegrationPolicy = {
  name: "weather",
  hosts: ["api.example.com", "oauth.example.com", "cdn.example.com", "local.example.com:8443"],
  secrets: {
    "example-key": { hosts: ["api.example.com"], placement: { as: "bearer" } },
    "client-secret": {
      hosts: ["oauth.example.com"],
      placement: { as: "form", field: "client_secret" },
    },
  },
  signIns: {
    "example-account": { hosts: ["api.example.com"], as: "bearer" },
    "example-client-account": {
      hosts: ["api.example.com"],
      as: "header",
      header: "x-token",
      prefix: "Token ",
      clientSecret: { name: "account-client-secret", hosts: ["oauth.example.com"] },
    },
  },
  tokens: ["refresh"],
};

/** A policy with a sign-in whose token may also go to the CDN, and one on a local `http` host. */
export const wideSignIns: IntegrationPolicy = {
  ...policy,
  localHosts: ["localhost:8080"],
  hosts: [...policy.hosts],
  signIns: {
    ...policy.signIns,
    wide: { hosts: ["api.example.com", "cdn.example.com", "localhost:8080"], as: "bearer" },
    narrow: { hosts: ["api.example.com"], as: "bearer" },
    local: { hosts: ["localhost:8080"], as: "bearer" },
  },
};

/** The test policy, with a sheet that puts `example-key` in another place. */
export function policyPlacing(placement: DeclaredPlacement): IntegrationPolicy {
  return {
    ...policy,
    secrets: { ...policy.secrets, "example-key": { hosts: ["api.example.com"], placement } },
  };
}

export function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

/** The limited client over a fake transport, with a clock that ticks once per reading. */
export function client(
  answer?: Parameters<typeof fakeTransport>[0],
  limits?: RequestLimits,
  clientPolicy: IntegrationPolicy = policy,
  clientSecrets: Secrets = secrets,
  signInTokens?: SignInTokens,
) {
  const { transport, sent, options } = fakeTransport(answer);
  const log = new RequestLog();
  let clock = 0;
  const http = createLimitedHttpClient({
    policy: clientPolicy,
    transport,
    secrets: clientSecrets,
    log,
    ...(signInTokens ? { signInTokens } : {}),
    now: () => clock++,
    ...(limits ? { limits } : {}),
  });
  return { http, sent, options, log };
}

/** The refusal code a promise rejects with; throws when it settles any other way. */
export async function refusal(promise: Promise<unknown>): Promise<RefusalCode> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof IntegrationRefusedError)) {
    throw new Error(`expected the kit to refuse, but it ended with ${String(error)}`);
  }
  return error.code;
}
