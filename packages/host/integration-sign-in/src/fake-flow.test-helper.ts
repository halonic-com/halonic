import type { IntegrationSheet } from "@halonicjs/format";
import { createSignInGrants, type SignInGrants } from "@halonicjs/oauth-sign-in";
import type { HttpClient } from "@halonicjs/ports";
import {
  exampleSheet,
  fakeAccessToken,
  fakeClientSecret,
  rotatedRefreshToken,
  sheetWithTokenUrl,
  webDigest,
} from "./fake-integration.test-helper.ts";
import {
  createIntegrationSignIns,
  type IntegrationSignIns,
  type SignInSource,
} from "./integration-sign-ins.ts";
import { createSignInFlow, type SignInFlow, type SignInOutcome } from "./sign-in-flow.ts";

export const flowPort = 4711;

/** What the fake token endpoint answers to the code exchange. */
export type ExchangeAnswer = { status: number; body: unknown } | "unreachable";

/** One request the fake token endpoint saw. */
export interface SeenRequest {
  readonly url: string;
  readonly body: string;
}

/** A sign-in flow with a fake store, token endpoint, settings and randomness. */
export function exampleFlow(
  options: { settings?: Record<string, unknown>; issuer?: string; tokenUrl?: string } = {},
) {
  const values = new Map<string, string>();
  let storeFails = false;
  const grants: SignInGrants = createSignInGrants(
    {
      get: async (name) => values.get(name) ?? null,
      set: async (name, value) => {
        if (storeFails) throw new Error("fake store failure");
        values.set(name, value);
      },
      remove: async (name) => void values.delete(name),
    },
    webDigest,
  );
  const seen: SeenRequest[] = [];
  const outcomes: SignInOutcome[] = [];
  let answer: ExchangeAnswer = {
    status: 200,
    body: {
      access_token: fakeAccessToken,
      token_type: "Bearer",
      refresh_token: rotatedRefreshToken,
    },
  };
  let source: SignInSource = {
    sheet: withIssuer(
      options.tokenUrl === undefined ? exampleSheet() : sheetWithTokenUrl(options.tokenUrl),
      options.issuer,
    ),
    settings: options.settings ?? { clientId: "fake-client" },
  };
  let revokeStatus = 200;
  let secret: string | null = fakeClientSecret;
  let counter = 0;
  const http: HttpClient = {
    async fetch(url, init) {
      seen.push({ url, body: String(init?.body) });
      if (url.endsWith("/revoke")) {
        return new Response("", { status: revokeStatus });
      }
      if (answer === "unreachable") {
        throw new Error("fake network failure");
      }
      return Response.json(answer.body, { status: answer.status });
    },
  };
  let elapsedMs = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 10, 13) + elapsedMs) };
  const signIns: IntegrationSignIns = createIntegrationSignIns({
    integration: "example",
    current: async () => source,
    grants,
    http,
    secrets: { get: async () => secret },
    clock,
    requestSignal: () => new AbortController().signal,
  });
  const flow: SignInFlow = createSignInFlow({
    integration: "example",
    signIns,
    grants,
    http,
    secrets: { get: async () => secret },
    clock,
    digest: webDigest,
    // Different bytes each call, so every state, verifier and path differs.
    randomBytes: (length) => new Uint8Array(length).fill(++counter % 255),
    requestSignal: () => new AbortController().signal,
    onOutcome: (outcome) => void outcomes.push(outcome),
  });
  return {
    flow,
    grants,
    seen,
    outcomes,
    values,
    answerWith(next: ExchangeAnswer) {
      answer = next;
    },
    answerRevokeWith(status: number) {
      revokeStatus = status;
    },
    changeSettings(settings: Record<string, unknown>) {
      source = { ...source, settings };
    },
    failStoreWrites() {
      storeFails = true;
    },
    withoutClientSecret() {
      secret = null;
    },
    wait(ms: number) {
      elapsedMs += ms;
    },
    /** Starts the example sign-in and returns what the provider would send the browser back with. */
    async started() {
      const result = await flow.start("example-account", flowPort);
      if (result.kind !== "started") {
        throw new Error(`the example sign-in didn't start: ${result.kind}`);
      }
      const url = new URL(result.authorizeUrl);
      return {
        authorizeUrl: url,
        callbackPath: result.callbackPath,
        state: url.searchParams.get("state") ?? "",
        callback(query: Record<string, string>): Request {
          const back = new URL(`http://127.0.0.1:${flowPort}${result.callbackPath}`);
          for (const [name, value] of Object.entries(query)) back.searchParams.set(name, value);
          return new Request(back);
        },
      };
    },
  };
}

/** The example sheet, with its sign-in declaring an `issuer` when one is given. */
function withIssuer(sheet: IntegrationSheet, issuer: string | undefined): IntegrationSheet {
  if (issuer === undefined) {
    return sheet;
  }
  const signIn = sheet.signIns["example-account"];
  return { ...sheet, signIns: { "example-account": { ...signIn, issuer } } } as IntegrationSheet;
}
