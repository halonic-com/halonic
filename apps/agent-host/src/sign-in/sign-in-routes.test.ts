import { createSignInRig, type SignInRig } from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { integrationSignInRoutes } from "./sign-in-routes.ts";

const token = randomLaunchToken();
const signInName = "example-account";

let server: HostServer | undefined;
let logged: string[] = [];

afterEach(async () => {
  await server?.close();
  server = undefined;
  logged = [];
});

/** The routes over the sign-in rig's real host, with the fake provider behind it. */
async function started(options: { relayPort?: number; rig?: SignInRig } = {}) {
  const rig = options.rig ?? createSignInRig();
  server = await startHostServer(
    token,
    integrationSignInRoutes({
      signIns: rig.host,
      ...(options.relayPort === undefined ? {} : { relayPort: options.relayPort }),
      log: (text) => logged.push(text),
    }),
  );
  return { rig, url: server.url };
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
    signIn: signInName,
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
      const { rig, url } = await started();

      const authorizeUrl = await start(url);

      const redirect = new URL(new URL(authorizeUrl).searchParams.get("redirect_uri") ?? "");
      expect(redirect.origin).toBe(url);
      expect(redirect.pathname).toMatch(/^\/sign-in\/.+/u);
      const callback = rig.server.approve(authorizeUrl);
      const page = await fetch(callback);
      expect(page.status).toBe(200);
      expect(await states(url)).toEqual({
        signIns: [
          {
            signIn: signInName,
            state: "signedIn",
            lastOutcome: expect.objectContaining({ kind: "signedIn" }),
          },
        ],
      });
      expect((await rig.api()).status).toBe(200);
    });

    it("signs out at the provider and says what it did", async () => {
      const { rig, url } = await started();
      await fetch(rig.server.approve(await start(url)));

      const response = await post(url, "/v1/integrations/sign-in/sign-out", {
        integration: "example",
        signIn: signInName,
      });

      expect(await response.json()).toEqual({ result: { kind: "signedOut", revoke: "revoked" } });
      expect(rig.server.revokeRequests()).toHaveLength(1);
      expect(await states(url)).toMatchObject({ signIns: [{ state: "signedOut" }] });
    });

    it("says a refusal at the provider ended it, and nothing the provider sent besides", async () => {
      const { rig, url } = await started();

      const page = await fetch(rig.server.approve(await start(url), { user: "deny" }));

      expect(page.status).toBe(400);
      expect(await states(url)).toMatchObject({
        signIns: [
          {
            state: "signedOut",
            lastOutcome: { kind: "cancelled", signIn: signInName },
          },
        ],
      });
    });

    it("gives a cancelled sign-in's callback the 400 page", async () => {
      const { rig, url } = await started();
      const callback = rig.server.approve(await start(url));

      const cancelled = await post(url, "/v1/integrations/sign-in/cancel", {
        integration: "example",
        signIn: signInName,
      });

      expect(cancelled.status).toBe(204);
      expect((await fetch(callback)).status).toBe(400);
      expect(await states(url)).toMatchObject({ signIns: [{ state: "signedOut" }] });
    });
  });

  describe("the callback", () => {
    it("gets a plain 400 page at a path nobody waits on, and exchanges nothing", async () => {
      const { rig, url } = await started();

      const page = await fetch(`${url}/sign-in/not-pending?state=x&code=y`);

      expect(page.status).toBe(400);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await page.text()).not.toContain("not-pending");
      expect(rig.server.tokenRequests("authorization_code")).toEqual([]);
    });

    it("exchanges nothing for a wrong state", async () => {
      const { rig, url } = await started();

      const page = await fetch(rig.server.approve(await start(url), { state: "wrong-state" }));

      expect(page.status).toBe(400);
      expect(rig.server.tokenRequests("authorization_code")).toEqual([]);
    });

    it("is refused with an Origin header, as every route is", async () => {
      const { rig, url } = await started();
      const callback = rig.server.approve(await start(url));

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
            : { integration: "unknown", signIn: signInName };
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
      const rig = createSignInRig();
      rig.changeSettings({});
      const { url } = await started({ rig });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: signInName,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { kind: "settings_invalid" } });
    });

    it("answers 422 for a client secret that isn't set", async () => {
      const rig = createSignInRig();
      rig.secrets.clear();
      const { url } = await started({ rig });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: signInName,
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { kind: "client_secret_missing" } });
    });

    it("answers 501 over frames, where the callback can't arrive", async () => {
      const { url } = await started({ relayPort: 49_152 });

      const response = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: signInName,
      });

      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ error: { kind: "callback_unavailable" } });
    });

    it("refuses another field and a name that isn't a sheet name, before anything runs", async () => {
      const { rig, url } = await started();

      const extra = await post(url, "/v1/integrations/sign-in/start", {
        integration: "example",
        signIn: signInName,
        port: 1,
      });
      const bad = await post(url, "/v1/integrations/sign-in/start", {
        integration: "../example",
        signIn: signInName,
      });

      expect(extra.status).toBe(400);
      expect(bad.status).toBe(400);
      expect(rig.server.requests).toEqual([]);
    });
  });
});
