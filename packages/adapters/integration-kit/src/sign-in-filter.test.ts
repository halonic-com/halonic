import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  canary,
  client,
  fakeSignInTokens,
  redirect,
  refusal,
  tokenCanary,
  wideSignIns,
} from "./fake-transport.test-helper.ts";
import { secretRemoved } from "./secret-filter.ts";

const bearer = { signIn: "example-account", as: "bearer" } as const;
const clientSecret = canary["account-client-secret"];

verifies("integration-kit.sign-in-filter", () => {
  describe("attack case T4: a token echoed back", () => {
    it("removes the placed token from a header, a text body and a JSON body", async () => {
      const token = tokenCanary.access;
      const { http } = client(
        () =>
          new Response(JSON.stringify({ echoed: `Bearer ${token}`, raw: token }), {
            headers: { "x-echo": token },
          }),
        undefined,
        undefined,
        undefined,
        fakeSignInTokens(),
      );
      const response = await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(response.headers.get("x-echo")).toBe(secretRemoved);
      expect(await response.text()).toBe(
        JSON.stringify({ echoed: secretRemoved, raw: secretRemoved }),
      );
    });

    it("removes the older token, the refresh token and the client secret, which no request placed", async () => {
      const echoed = [tokenCanary.older, tokenCanary.refresh, clientSecret].join(" ");
      const { http } = client(
        () => new Response(echoed),
        undefined,
        undefined,
        undefined,
        fakeSignInTokens(),
      );
      const response = await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(await response.text()).toBe(`${secretRemoved} ${secretRemoved} ${secretRemoved}`);
    });

    it("removes a token that came in only after the request started, from the answer of a later hop", async () => {
      const tokens = fakeSignInTokens();
      const refreshed = "canary-refreshed-access-token-0f1e2d3c";
      const { http } = client(
        (url) => {
          if (url.host === "api.example.com") {
            tokens.current = refreshed;
            return redirect(302, "https://cdn.example.com/f");
          }
          return new Response(`echo ${refreshed}`);
        },
        undefined,
        wideSignIns,
        undefined,
        tokens,
      );
      const response = await http.fetch("https://api.example.com/v1", {
        auth: { signIn: "wide", as: "bearer" },
      });
      expect(await response.text()).toBe(`echo ${secretRemoved}`);
    });
  });

  describe("attack case T5: a token carried in the integration's own request", () => {
    const hosts = ["api.example.com", "cdn.example.com"];
    const values = [tokenCanary.access, tokenCanary.older, tokenCanary.refresh, clientSecret];

    it.each(hosts.flatMap((host) => values.map((value) => [host, value] as const)))(
      "refuses a query to %s that holds %s",
      async (host, value) => {
        const { http, sent } = client(
          undefined,
          undefined,
          undefined,
          undefined,
          fakeSignInTokens(),
        );
        expect(await refusal(http.fetch(`https://${host}/v1?t=${encodeURIComponent(value)}`))).toBe(
          "secret-in-request",
        );
        expect(sent).toEqual([]);
      },
    );

    it("refuses a header and a body that carry a token the kit didn't place", async () => {
      const { http, sent } = client(undefined, undefined, undefined, undefined, fakeSignInTokens());
      const withHeader = http.fetch("https://api.example.com/v1", {
        headers: { "x-t": tokenCanary.older },
      });
      const withBody = http.fetch("https://api.example.com/v1", {
        method: "POST",
        body: `{"t":"${tokenCanary.refresh}"}`,
      });
      expect(await refusal(withHeader)).toBe("secret-in-request");
      expect(await refusal(withBody)).toBe("secret-in-request");
      expect(sent).toEqual([]);
    });

    it("doesn't count the token the kit places itself", async () => {
      const { http, sent } = client(undefined, undefined, undefined, undefined, fakeSignInTokens());
      await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(sent).toHaveLength(1);
    });
  });

  describe("a redirect that holds a token", () => {
    it("is not followed", async () => {
      const { http, sent } = client(
        () => redirect(302, `https://api.example.com/next?t=${tokenCanary.refresh}`),
        undefined,
        undefined,
        undefined,
        fakeSignInTokens(),
      );
      expect(await refusal(http.fetch("https://api.example.com/v1", { auth: bearer }))).toBe(
        "secret-in-redirect",
      );
      expect(sent).toHaveLength(1);
    });
  });
});
