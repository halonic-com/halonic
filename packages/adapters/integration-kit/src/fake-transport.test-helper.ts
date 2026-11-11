import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import type { Secrets, TokenStore } from "@halonicjs/ports";
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
};

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
  tokens: ["refresh"],
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
) {
  const { transport, sent, options } = fakeTransport(answer);
  const log = new RequestLog();
  let clock = 0;
  const http = createLimitedHttpClient({
    policy: clientPolicy,
    transport,
    secrets: clientSecrets,
    log,
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
