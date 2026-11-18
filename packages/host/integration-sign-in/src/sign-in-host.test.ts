import { createSignInGrants } from "@halonicjs/oauth-sign-in";
import type { HttpClient, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  exampleSheet,
  fakeAccessToken,
  fakeClientSecret,
  rotatedRefreshToken,
  signInName,
  webDigest,
} from "./fake-integration.test-helper.ts";
import type { SignInSource } from "./integration-sign-ins.ts";
import { createSignInHost, type SignInHost, type SignInIntegration } from "./sign-in-host.ts";

const port = 4711;

/** A host over fake integrations, a fake store and a fake token endpoint. The secrets are the app's picks: the sheet's name reads the workspace's. */
function exampleHost(names: readonly string[] = ["example"]) {
  const values = new Map<string, string>();
  const secretsAsked: string[] = [];
  const bodies: string[] = [];
  const current = new Map<string, SignInSource>(
    names.map((name) => [name, { sheet: exampleSheet(), settings: { clientId: "fake-client" } }]),
  );
  const outcomeAnswer = { status: 200, body: tokenAnswer() };
  const http: HttpClient = {
    async fetch(_url, init) {
      bodies.push(String(init?.body));
      return Response.json(outcomeAnswer.body, { status: outcomeAnswer.status });
    },
  };
  const secrets: Secrets = {
    get: async (name) => {
      secretsAsked.push(name);
      return name === "example-client" ? fakeClientSecret : null;
    },
  };
  let counter = 0;
  const host = createSignInHost({
    integration: (name): SignInIntegration | undefined =>
      current.has(name)
        ? { read: async () => current.get(name) as SignInSource, secrets }
        : undefined,
    grants: createSignInGrants(
      {
        get: async (name) => values.get(name) ?? null,
        set: async (name, value) => void values.set(name, value),
        remove: async (name) => void values.delete(name),
      },
      webDigest,
    ),
    http,
    clock: { now: () => new Date(Date.UTC(2026, 10, 13)) },
    digest: webDigest,
    randomBytes: (length) => new Uint8Array(length).fill(++counter % 255),
    requestSignal: () => new AbortController().signal,
  });
  return {
    host,
    bodies,
    secretsAsked,
    answerWith(status: number, body: unknown) {
      outcomeAnswer.status = status;
      outcomeAnswer.body = body as ReturnType<typeof tokenAnswer>;
    },
    change(name: string, edit: (now: SignInSource) => SignInSource) {
      current.set(name, edit(current.get(name) as SignInSource));
    },
  };
}

function tokenAnswer() {
  return {
    access_token: fakeAccessToken,
    token_type: "Bearer",
    refresh_token: rotatedRefreshToken,
  };
}

/** Starts the sign-in of `name` and answers its callback with a code. */
async function signIn(host: SignInHost, name = "example"): Promise<Response> {
  const parts = host.integration(name);
  const started = await parts?.flow.start(signInName, port);
  if (started?.kind !== "started") throw new Error(`didn't start: ${started?.kind}`);
  const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
  return await host.handleCallback(callback(started.callbackPath, state));
}

function callback(path: string, state: string): Request {
  return new Request(`http://127.0.0.1:${port}${path}?state=${state}&code=fake-code`);
}

verifies("integration-sign-in.sign-in-host", () => {
  describe("the one source", () => {
    it("reads the client secret through the integration's own secrets, by the sheet's name", async () => {
      const test = exampleHost();

      await signIn(test.host);

      expect(test.bodies.at(-1)).toContain(`client_secret=${fakeClientSecret}`);
      expect(test.secretsAsked).toEqual(expect.arrayContaining(["example-client"]));
    });

    it("reads the settings from the source each time, so a change counts at once", async () => {
      const test = exampleHost();
      await signIn(test.host);
      test.change("example", (now) => ({ ...now, settings: { clientId: "another-fake-client" } }));

      const states = (await test.host.integration("example")?.status())?.map((each) => each.state);

      expect(states).toEqual(["approvalChanged"]);
    });
  });

  describe("the callback", () => {
    it("is answered by the flow whose path it is", async () => {
      const test = exampleHost(["first", "second"]);
      const first = test.host.integration("first")?.flow;
      const second = test.host.integration("second")?.flow;
      await first?.start(signInName, port);
      const started = await second?.start(signInName, port);
      if (started?.kind !== "started") throw new Error("didn't start");
      const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

      const page = await test.host.handleCallback(callback(started.callbackPath, state));

      expect(page.status).toBe(200);
      expect(test.host.integration("first")?.flow.handlesPath(started.callbackPath)).toBe(false);
      expect(await test.host.integration("second")?.status()).toMatchObject([
        { state: "signedIn" },
      ]);
      expect(await test.host.integration("first")?.status()).toMatchObject([
        { state: "signedOut" },
      ]);
    });

    it("gets a plain 400 at a path no flow is waiting on, and nothing is exchanged", async () => {
      const test = exampleHost();
      test.host.integration("example");

      const page = await test.host.handleCallback(callback("/sign-in/not-pending", "x"));

      expect(page.status).toBe(400);
      expect(await page.text()).not.toContain("not-pending");
      expect(test.bodies).toEqual([]);
    });
  });

  it("has no parts for an integration the app doesn't name, and the same parts for one it does", () => {
    const test = exampleHost();

    expect(test.host.integration("unknown")).toBeUndefined();
    expect(test.host.integration("example")).toBe(test.host.integration("example"));
  });

  describe("status", () => {
    it("follows a sign-in from signed out to signed in and a changed setting", async () => {
      const test = exampleHost();
      const states = async () =>
        (await test.host.integration("example")?.status())?.map((status) => status.state);

      expect(await states()).toEqual(["signedOut"]);
      await signIn(test.host);
      expect(await states()).toEqual(["signedIn"]);
      test.change("example", (now) => ({ ...now, settings: { clientId: "another-fake-client" } }));
      expect(await states()).toEqual(["approvalChanged"]);
      test.change("example", (now) => ({ ...now, settings: {} }));
      expect(await states()).toEqual(["cannotSignIn"]);
    });

    it("carries how the last sign-in ended", async () => {
      const test = exampleHost();
      test.answerWith(400, { error: "invalid_grant" });

      await signIn(test.host);

      const [status] = (await test.host.integration("example")?.status()) ?? [];
      expect(status?.lastOutcome).toEqual({ kind: "codeRefused", signIn: signInName });
    });
  });
});
