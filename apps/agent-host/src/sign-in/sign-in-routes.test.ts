import type { FakeOAuthServer } from "@halonicjs/testing-sign-in";
import * as rig from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { integrationSignInRoutes } from "./sign-in-routes.ts";
import { type ExampleSignInHost, exampleSignInHost } from "./sign-in-test-kit.test-helper.ts";

const token = randomLaunchToken();

let server: HostServer | undefined;
let logged: string[] = [];

afterEach(async () => {
  await server?.close();
  server = undefined;
  logged = [];
});

/** The routes over the real sign-in host, with the fake provider behind it. */
async function started(
  options: { relayPort?: number; example?: ExampleSignInHost<FakeOAuthServer> } = {},
) {
  const example = options.example ?? exampleSignInHost(rig);
  server = await startHostServer(
    token,
    integrationSignInRoutes({
      signIns: example.host,
      ...(options.relayPort === undefined ? {} : { relayPort: options.relayPort }),
      log: (text) => logged.push(text),
    }),
  );
  return { example, url: server.url };
}

function post(url: string, path: string, body: unknown, withToken = true): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      ...(withToken ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Starts the example sign-in through the route and returns the authorize URL it answered. */
async function start(url: string): Promise<string> {
  const response = await post(url, "/v1/integrations/sign-in/start", {
    integration: "example",
    signIn: rig.signInName,
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { authorizeUrl: string }).authorizeUrl;
}

async function states(url: string): Promise<unknown> {
  const response = await post(url, "/v1/integrations/sign-in/status", { integration: "example" });
  return await response.json();
}

verifies("agent-host.integration-sign-in-routes", () => {
  describe("a sign-in from start to sign-out", () => {
    it("answers the authorize URL, takes the callback without the token, and says signed in", async () => {
      const { example, url } = await started();

      const authorizeUrl = await start(url);

      const redirect = new URL(new URL(authorizeUrl).searchParams.get("redirect_uri") ?? "");
      expect(redirect.origin).toBe(url);
      expect(redirect.pathname).toMatch(/^\/sign-in\/.+/u);
      const callback = example.server.approve(authorizeUrl);
      const page = await fetch(callback);
      expect(page.status).toBe(200);
      expect(await states(url)).toEqual({
        signIns: [
          {
            signIn: rig.signInName,
            state: "signedIn",
            lastOutcome: expect.objectContaining({ kind: "signedIn" }),
          },
        ],
      });
    });

    it("signs out at the provider and says what it did", async () => {
      const { example, url } = await started();
      await fetch(example.server.approve(await start(url)));

      const response = await post(url, "/v1/integrations/sign-in/sign-out", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(await response.json()).toEqual({ result: { kind: "signedOut", revoke: "revoked" } });
      expect(example.server.revokeRequests()).toHaveLength(1);
      expect(await states(url)).toMatchObject({ signIns: [{ state: "signedOut" }] });
    });

    it("says a refusal at the provider ended it, and nothing the provider sent besides", async () => {
      const { example, url } = await started();

      const page = await fetch(example.server.approve(await start(url), { user: "deny" }));

      expect(page.status).toBe(400);
      expect(await states(url)).toMatchObject({
        signIns: [
          {
            state: "signedOut",
            lastOutcome: { kind: "cancelled", signIn: rig.signInName },
          },
        ],
      });
    });

    it("gives a cancelled sign-in's callback the 400 page", async () => {
      const { example, url } = await started();
      const callback = example.server.approve(await start(url));

      const cancelled = await post(url, "/v1/integrations/sign-in/cancel", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(cancelled.status).toBe(204);
      expect((await fetch(callback)).status).toBe(400);
      expect(await states(url)).toMatchObject({ signIns: [{ state: "signedOut" }] });
    });
  });

  describe("the callback", () => {
    it("gets a plain 400 page at a path nobody waits on, and exchanges nothing", async () => {
      const { example, url } = await started();

      const page = await fetch(`${url}/sign-in/not-pending?state=x&code=y`);

      expect(page.status).toBe(400);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await page.text()).not.toContain("not-pending");
      expect(example.server.tokenRequests("authorization_code")).toEqual([]);
    });

    it("exchanges nothing for a wrong state", async () => {
      const { example, url } = await started();

      const page = await fetch(example.server.approve(await start(url), { state: "wrong-state" }));

      expect(page.status).toBe(400);
      expect(example.server.tokenRequests("authorization_code")).toEqual([]);
    });

    it("is refused with an Origin header, as every route is", async () => {
      const { example, url } = await started();
      const callback = example.server.approve(await start(url));

      const answer = await fetch(callback, { headers: { origin: "https://example.com" } });

      expect(answer.status).toBe(403);
    });

    it("is the only path that is served without the token", async () => {
      const { url } = await started();

      expect(
        (await post(url, "/v1/integrations/sign-in/status", { integration: "example" }, false))
          .status,
      ).toBe(401);
      expect((await fetch(`${url}/sign-in`)).status).toBe(401);
    });
  });

  describe("refusals", () => {
    it("answers 404 for an integration the host runs no sign-ins for, on every route", async () => {
      const { url } = await started();
      for (const path of ["start", "status", "cancel", "sign-out"]) {
        const body =
          path === "status"
            ? { integration: "unknown" }
            : { integration: "unknown", signIn: rig.signInName };
        const response = await post(url, `/v1/integrations/sign-in/${path}`, body);
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ error: { kind: "unknown_integration" } });
      }
    });

    it("answers 404 for a sign-in the sheet doesn't have", async () => {
      const { url } = await started();

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: "other-account",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { kind: "unknown_sign_in" } });
    });

    it("answers 422 for a setting that is missing", async () => {
      const example = exampleSignInHost(rig);
      example.changeSettings({});
      const { url } = await started({ example });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { kind: "settings_invalid" } });
    });

    it("answers 422 for a client secret that isn't set", async () => {
      const example = exampleSignInHost(rig);
      example.forgetClientSecret();
      const { url } = await started({ example });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { kind: "client_secret_missing" } });
    });

    it("answers 502 with a fixed message for a pick of Halonic's own secret, and logs only an error name", async () => {
      const example = exampleSignInHost(rig);
      example.pickClientSecret("token-key");
      const { url } = await started({ example });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: { kind: "sign_in_failed" } });
      expect(logged).toEqual(["An integration sign-in request failed (RangeError).\n"]);
    });

    it("answers 501 over frames, where the callback can't arrive", async () => {
      const { url } = await started({ relayPort: 49_152 });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: rig.signInName,
      });

      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ error: { kind: "callback_unavailable" } });
    });

    it("refuses another field and a name that isn't a sheet name, before anything runs", async () => {
      const { example, url } = await started();

      const extra = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: rig.signInName,
        port: 1,
      });
      const bad = await post(url, "/v1/integrations/sign-in/start", {
        integration: "../example",
        signIn: rig.signInName,
      });

      expect(extra.status).toBe(400);
      expect(bad.status).toBe(400);
      expect(example.server.requests).toEqual([]);
    });
  });
});
