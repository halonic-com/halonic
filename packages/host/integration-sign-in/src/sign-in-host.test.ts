import { createSignInGrants, signInsInTokenNames } from "@halonicjs/oauth-sign-in";
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
  // Like a plugin that lost its trust: neither its sheet nor its secrets can be read.
  const refused = new Set<string>();
  const refusal = () => new Error("plugin_not_trusted");
  const secrets: Secrets = {
    get: async (name) => {
      if (refused.size > 0) throw refusal();
      secretsAsked.push(name);
      return name === "example-client" ? fakeClientSecret : null;
    },
  };
  let counter = 0;
  const host = createSignInHost({
    integration: (name): SignInIntegration | undefined =>
      current.has(name)
        ? {
            read: async () => {
              if (refused.has(name)) throw refusal();
              return current.get(name) as SignInSource;
            },
            secrets,
          }
        : undefined,
    grants: createSignInGrants(
      {
        get: async (name) => values.get(name) ?? null,
        set: async (name, value) => void values.set(name, value),
        remove: async (name) => void values.delete(name),
      },
      webDigest,
    ),
    savedSignIns: async (name) => signInsInTokenNames(name, values.keys()),
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
    /** The token names saved now. */
    saved: () => [...values.keys()],
    refuse(name: string) {
      refused.add(name);
    },
    answerWith(status: number, body: unknown) {
      outcomeAnswer.status = status;
      outcomeAnswer.body = body as ReturnType<typeof tokenAnswer>;
    },
    change(name: string, edit: (now: SignInSource) => SignInSource) {
      current.set(name, edit(current.get(name) as SignInSource));
    },
    /** Like a host that can't load plugins: the app no longer names it, and the host drops its parts. */
    stopRunning(name: string) {
      current.delete(name);
      host.forget(name);
    },
  };
}

/** The example's sign-in as a public client, whose sheet names no client secret. */
function withoutClientSecret(now: SignInSource): SignInSource {
  const signIn = now.sheet.signIns[signInName];
  if (signIn === undefined) throw new Error("the example sheet has no sign-in");
  const { clientSecret: _, ...publicSignIn } = signIn;
  return { ...now, sheet: { ...now.sheet, signIns: { [signInName]: publicSignIn } } };
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

verifies("integration-sign-in.sign-out-all", () => {
  it("revokes at the approved address and removes the grant", async () => {
    const test = exampleHost();
    await signIn(test.host);
    test.bodies.length = 0;

    const signedOut = await test.host.signOutAll("example");

    expect(signedOut).toEqual([
      { signIn: signInName, result: { kind: "signedOut", revoke: "revoked" } },
    ]);
    expect(test.bodies).toHaveLength(1);
    expect(test.bodies[0]).toContain(`token=${rotatedRefreshToken}`);
    expect(test.saved()).toEqual([]);
  });

  it("removes the grant when neither the sheet nor the secret can be read, and the revoke isn't confirmed", async () => {
    const test = exampleHost();
    await signIn(test.host);
    test.bodies.length = 0;
    test.refuse("example");

    const signedOut = await test.host.signOutAll("example");

    expect(signedOut).toEqual([
      { signIn: signInName, result: { kind: "signedOut", revoke: "notConfirmed" } },
    ]);
    expect(test.bodies).toEqual([]);
    expect(test.saved()).toEqual([]);
  });

  it("finds a grant by its saved name, also for a sign-in the sheet no longer has", async () => {
    const test = exampleHost();
    await signIn(test.host);
    test.change("example", (now) => ({ ...now, sheet: { ...now.sheet, signIns: {} } }));

    const signedOut = await test.host.signOutAll("example");

    expect(signedOut.map((each) => each.signIn)).toEqual([signInName]);
    expect(test.saved()).toEqual([]);
  });

  it("forgets the parts afterwards, so a pending sign-in ends and a new one starts signed out", async () => {
    const test = exampleHost();
    const before = test.host.integration("example");
    const started = await before?.flow.start(signInName, port);
    if (started?.kind !== "started") throw new Error("didn't start");
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

    expect(await test.host.signOutAll("example")).toEqual([]);

    expect(test.host.integration("example")).not.toBe(before);
    expect((await test.host.handleCallback(callback(started.callbackPath, state))).status).toBe(
      400,
    );
    expect(await test.host.integration("example")?.status()).toMatchObject([
      { state: "signedOut" },
    ]);
  });

  describe("for an integration the host runs no sign-ins for", () => {
    it("removes the grant another host saved, and sends no revoke without the client secret", async () => {
      const test = exampleHost();
      await signIn(test.host);
      test.bodies.length = 0;
      test.secretsAsked.length = 0;
      test.stopRunning("example");

      const signedOut = await test.host.signOutAll("example");

      expect(signedOut).toEqual([
        { signIn: signInName, result: { kind: "signedOut", revoke: "notConfirmed" } },
      ]);
      expect(test.bodies).toEqual([]);
      expect(test.secretsAsked).toEqual([]);
      expect(test.saved()).toEqual([]);
    });

    it("revokes a sign-in that needs no client secret", async () => {
      const test = exampleHost();
      test.change("example", withoutClientSecret);
      await signIn(test.host);
      test.bodies.length = 0;
      test.stopRunning("example");

      const signedOut = await test.host.signOutAll("example");

      expect(signedOut).toEqual([
        { signIn: signInName, result: { kind: "signedOut", revoke: "revoked" } },
      ]);
      expect(test.bodies).toHaveLength(1);
      expect(test.bodies[0]).toContain(`token=${rotatedRefreshToken}`);
      expect(test.saved()).toEqual([]);
    });

    it("signs out nothing when it has no saved grant, and leaves the others' grants", async () => {
      const test = exampleHost();
      await signIn(test.host);
      test.bodies.length = 0;

      expect(await test.host.signOutAll("unknown")).toEqual([]);
      expect(test.bodies).toEqual([]);
      expect(test.saved()).toHaveLength(1);
    });
  });

  it("forget drops the parts and keeps the grants", async () => {
    const test = exampleHost();
    await signIn(test.host);
    const before = test.host.integration("example");

    test.host.forget("example");

    expect(test.host.integration("example")).not.toBe(before);
    expect(test.saved()).toHaveLength(1);
  });
});
