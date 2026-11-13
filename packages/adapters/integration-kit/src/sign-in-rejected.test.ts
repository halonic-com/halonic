import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  client,
  fakeSignInTokens,
  redirect,
  tokenCanary,
  wideSignIns,
} from "./fake-transport.test-helper.ts";

const bearer = { signIn: "example-account", as: "bearer" } as const;

verifies("integration-kit.sign-in-rejected", () => {
  describe("a 401 for a token the kit placed", () => {
    it("returns the 401 unchanged, resends nothing and reports the placed value once", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(
        () => new Response("nope", { status: 401 }),
        undefined,
        undefined,
        undefined,
        tokens,
      );
      const response = await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("nope");
      expect(sent).toHaveLength(1);
      expect(tokens.rejectedCalls).toEqual([
        { signIn: "example-account", value: tokenCanary.access },
      ]);
    });

    it.each([200, 403, 500])("doesn't report a %s", async (status) => {
      const tokens = fakeSignInTokens();
      const { http } = client(
        () => new Response("x", { status }),
        undefined,
        undefined,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(tokens.rejectedCalls).toEqual([]);
    });

    it("reports the value placed by this request, not an older one", async () => {
      const tokens = fakeSignInTokens();
      const { http } = client(
        () => new Response("nope", { status: 401 }),
        undefined,
        undefined,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", { auth: bearer });
      tokens.current = "canary-refreshed-access-token-0f1e2d3c";
      await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(tokens.rejectedCalls.map((call) => call.value)).toEqual([
        tokenCanary.access,
        "canary-refreshed-access-token-0f1e2d3c",
      ]);
    });
  });

  describe("a 401 for a hop that placed no token", () => {
    it("doesn't report a 401 from a hop the token was left out of", async () => {
      const tokens = fakeSignInTokens();
      const { http } = client(
        (url) =>
          url.host === "api.example.com"
            ? redirect(302, "https://cdn.example.com/f")
            : new Response("nope", { status: 401 }),
        undefined,
        wideSignIns,
        undefined,
        tokens,
      );
      const response = await http.fetch("https://api.example.com/v1", {
        auth: { signIn: "narrow", as: "bearer" },
      });
      expect(response.status).toBe(401);
      expect(tokens.rejectedCalls).toEqual([]);
    });

    it("doesn't report a 401 for a request that places only a secret", async () => {
      const tokens = fakeSignInTokens();
      const { http } = client(
        () => new Response("nope", { status: 401 }),
        undefined,
        undefined,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", {
        auth: { secret: "example-key", as: "bearer" },
      });
      expect(tokens.rejectedCalls).toEqual([]);
    });
  });
});
