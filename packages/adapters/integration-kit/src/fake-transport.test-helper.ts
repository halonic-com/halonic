import type { HttpClient, Secrets, TokenStore } from "@halonicjs/ports";
import type { IntegrationPolicy } from "./policy.ts";

/** A request as the fake transport saw it, with the headers and body the kit actually sent. */
export interface SentRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  redirect: RequestInit["redirect"];
}

/** A transport that answers from a function and records what was sent. */
export function fakeTransport(
  answer: (url: URL, method: string) => Response = () => new Response("ok"),
) {
  const sent: SentRequest[] = [];
  const transport: HttpClient = {
    fetch: async (url, init = {}) => {
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
  };
  return { transport, sent };
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
    "example-key": { hosts: ["api.example.com"] },
    "client-secret": { hosts: ["oauth.example.com"] },
  },
  tokens: ["refresh"],
};

export function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}
