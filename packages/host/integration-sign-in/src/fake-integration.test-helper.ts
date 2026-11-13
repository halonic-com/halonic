import { type IntegrationSheet, parseIntegrationSheet } from "@halonicjs/format";
import { createSignInGrants, type SignInGrants } from "@halonicjs/oauth-sign-in";
import type { Clock, Digest, HttpClient } from "@halonicjs/ports";
import {
  createIntegrationSignIns,
  type IntegrationSignIns,
  type SignInSource,
} from "./integration-sign-ins.ts";

// Fake values only; none is real.
export const fakeRefreshToken = "fake-refresh-token-0000000001";
export const fakeClientSecret = "fake-client-secret-0000000001";
export const fakeAccessToken = "fake-access-token-0000000001";
export const rotatedRefreshToken = "fake-refresh-token-0000000002";
export const signInName = "example-account";

/** A sheet with one sign-in whose client ID is a setting. */
export function exampleSheet(): IntegrationSheet {
  const parsed = parseIntegrationSheet({
    id: "example",
    version: "1.0.0",
    kit: 2,
    provides: ["connector"],
    hosts: ["api.example.com"],
    secrets: { "example-client": { purpose: "The client secret of your Example app." } },
    signIns: {
      [signInName]: {
        purpose: "Access to your Example account.",
        flow: "oauth-code",
        authorizeUrl: "https://auth.example.com/oauth/authorize",
        tokenUrl: "https://auth.example.com/oauth/token",
        revokeUrl: "https://auth.example.com/oauth/revoke",
        clientId: { fromSetting: "clientId" },
        clientSecret: "example-client",
        clientAuth: "post",
        scopes: [{ scope: "projects.read", reason: "Reads your projects." }],
        access: { hosts: ["api.example.com"], as: "bearer" },
      },
    },
  });
  if (!parsed.ok) {
    throw new Error(`the example sheet is wrong: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value;
}

/** The example sheet with its sign-in's token URL replaced, as a sheet that passed no check could have it. */
export function sheetWithTokenUrl(tokenUrl: string): IntegrationSheet {
  const sheet = exampleSheet();
  const signIn = sheet.signIns[signInName];
  return { ...sheet, signIns: { [signInName]: { ...signIn, tokenUrl } } } as IntegrationSheet;
}

export const webDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data)));
  },
};

/** One request to the fake provider; `release` lets a held answer through. */
export interface HeldRequest {
  readonly url: string;
  readonly body: string;
  release(): void;
}

/**
 * A fake provider that answers a refresh with an access token and a rotated
 * refresh token, and a revoke with 200. With `hold`, an answer waits until
 * the test releases it.
 */
export function fakeProvider(hold: boolean): HttpClient & {
  readonly requests: HeldRequest[];
} {
  const requests: HeldRequest[] = [];
  return {
    requests,
    async fetch(url, init) {
      await new Promise<void>((resolve) => {
        const request: HeldRequest = { url, body: String(init?.body), release: resolve };
        requests.push(request);
        if (!hold) {
          resolve();
        }
      });
      return url.endsWith("/revoke")
        ? new Response("", { status: 200 })
        : Response.json({
            access_token: fakeAccessToken,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: rotatedRefreshToken,
          });
    },
  };
}

/** An integration with its fake store, provider and settings. */
export function exampleIntegration(
  options: { settings?: Record<string, unknown>; hold?: boolean; tokenUrl?: string } = {},
) {
  const values = new Map<string, string>();
  const grants: SignInGrants = createSignInGrants(
    {
      get: async (name) => values.get(name) ?? null,
      set: async (name, value) => void values.set(name, value),
      remove: async (name) => void values.delete(name),
    },
    webDigest,
  );
  const provider = fakeProvider(options.hold ?? false);
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 10, 13)) };
  let source: SignInSource = {
    sheet: options.tokenUrl === undefined ? exampleSheet() : sheetWithTokenUrl(options.tokenUrl),
    settings: options.settings ?? { clientId: "fake-client" },
  };
  const signIns: IntegrationSignIns = createIntegrationSignIns({
    integration: "example",
    current: async () => source,
    grants,
    http: provider,
    secrets: { get: async (name) => (name === "example-client" ? fakeClientSecret : null) },
    clock,
    requestSignal: () => new AbortController().signal,
  });
  return {
    signIns,
    grants,
    provider,
    values,
    changeSettings(settings: Record<string, unknown>) {
      source = { ...source, settings };
    },
    /** Saves the grant of what the sheet and settings describe now, as a finished sign-in does. */
    async signedIn() {
      const found = await signIns.lookUp(signInName);
      if (found.kind !== "approvable") {
        throw new Error("the example sign-in isn't approvable");
      }
      await grants.save("example", signInName, {
        refreshToken: fakeRefreshToken,
        approved: found.signIn,
      });
    },
  };
}
