import { SignInNeededError, type SignInPlacement, type SignInTokens } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  canary,
  client,
  fakeSignInTokens,
  policy,
  redirect,
  refusal,
  tokenCanary,
  wideSignIns,
} from "./fake-transport.test-helper.ts";
import { IntegrationRefusedError } from "./integration/index.ts";

const bearer: SignInPlacement = { signIn: "example-account", as: "bearer" };
const inHeader: SignInPlacement = {
  signIn: "example-client-account",
  as: "header",
  header: "x-token",
  prefix: "Token ",
};

verifies("integration-kit.sign-in-placement", () => {
  describe("placing a sign-in's access token", () => {
    it("puts the token in the header the sheet says, and the integration reads no token", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(undefined, undefined, policy, undefined, tokens);
      const response = await http.fetch("https://api.example.com/v1", { auth: bearer });
      expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${tokenCanary.access}`);
      expect(tokens.asked).toEqual(["example-account"]);
      expect(await response.text()).toBe("ok");
    });

    it("places a header with its prefix, and matches the header name ignoring case", async () => {
      const { http, sent } = client(undefined, undefined, policy, undefined, fakeSignInTokens());
      await http.fetch("https://api.example.com/v1", {
        auth: { ...inHeader, header: "X-Token" },
      });
      expect(sent[0]?.headers["x-token"]).toBe(`Token ${tokenCanary.access}`);
    });

    it("places a token next to a secret", async () => {
      const { http, sent } = client(undefined, undefined, policy, undefined, fakeSignInTokens());
      await http.fetch("https://api.example.com/v1", {
        auth: [{ secret: "example-key", as: "bearer" }, inHeader],
      });
      expect(sent[0]?.headers["x-token"]).toBe(`Token ${tokenCanary.access}`);
    });
  });

  describe("attack case T14: a token placed another way than the sheet says", () => {
    it.each<[string, unknown]>([
      ["another header", { ...inHeader, header: "x-other" }],
      ["no prefix", { signIn: "example-client-account", as: "header", header: "x-token" }],
      ["another prefix", { ...inHeader, prefix: "Bearer " }],
      [
        "a bearer token when the sheet says header",
        { signIn: "example-client-account", as: "bearer" },
      ],
      [
        "a header when the sheet says bearer",
        { signIn: "example-account", as: "header", header: "authorization" },
      ],
      ["a form field", { signIn: "example-account", as: "form", field: "token" }],
      ["a name that isn't text", { signIn: { toString: () => "example-account" }, as: "bearer" }],
    ])("refuses %s and asks for no token", async (_what, auth) => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(undefined, undefined, policy, undefined, tokens);
      const request = http.fetch("https://api.example.com/v1", { auth: auth as SignInPlacement });
      expect(await refusal(request)).toBe("placement-not-in-sheet");
      expect(tokens.asked).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("refuses a sign-in the sheet doesn't declare, also one named like an inherited property", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(undefined, undefined, policy, undefined, tokens);
      for (const signIn of ["other-account", "toString", "__proto__"]) {
        const request = http.fetch("https://api.example.com/v1", {
          auth: { signIn, as: "bearer" },
        });
        expect(await refusal(request)).toBe("sign-in-not-declared");
      }
      expect(tokens.asked).toEqual([]);
      expect(sent).toEqual([]);
    });
  });

  describe("attack case T2: a token on a host the sign-in doesn't list", () => {
    it("refuses a first host the sign-in doesn't list, though the sheet declares it", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(undefined, undefined, policy, undefined, tokens);
      const request = http.fetch("https://cdn.example.com/v1", { auth: bearer });
      expect(await refusal(request)).toBe("token-not-allowed-for-host");
      expect(tokens.asked).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("leaves the token out of a hop on a redirect to a host the sign-in doesn't list", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(
        (url) =>
          url.host === "api.example.com"
            ? redirect(302, "https://cdn.example.com/f")
            : new Response("ok"),
        undefined,
        wideSignIns,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", { auth: { signIn: "narrow", as: "bearer" } });
      expect(sent.map((request) => request.headers["authorization"])).toEqual([
        `Bearer ${tokenCanary.access}`,
        undefined,
      ]);
      expect(tokens.asked).toEqual(["narrow"]);
    });

    it("places the token again on a redirect to another host the sign-in lists", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(
        (url) =>
          url.host === "api.example.com"
            ? redirect(302, "https://cdn.example.com/f")
            : new Response("ok"),
        undefined,
        wideSignIns,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", { auth: { signIn: "wide", as: "bearer" } });
      expect(sent.map((request) => request.headers["authorization"])).toEqual([
        `Bearer ${tokenCanary.access}`,
        `Bearer ${tokenCanary.access}`,
      ]);
    });

    it("never sends a token over plain http, not even to this machine", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(undefined, undefined, wideSignIns, undefined, tokens);
      const request = http.fetch("http://localhost:8080/v1", {
        auth: { signIn: "local", as: "bearer" },
      });
      expect(await refusal(request)).toBe("token-over-plain-http");
      expect(tokens.asked).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("leaves the token out of a hop that a redirect moves to plain http", async () => {
      const tokens = fakeSignInTokens();
      const { http, sent } = client(
        (url) =>
          url.protocol === "https:" ? redirect(302, "http://localhost:8080/f") : new Response("ok"),
        undefined,
        wideSignIns,
        undefined,
        tokens,
      );
      await http.fetch("https://api.example.com/v1", { auth: { signIn: "wide", as: "bearer" } });
      expect(sent.map((request) => request.headers["authorization"])).toEqual([
        `Bearer ${tokenCanary.access}`,
        undefined,
      ]);
      expect(tokens.asked).toEqual(["wide"]);
    });
  });

  describe("attack case T3: the client secret", () => {
    it("refuses a placement of a sign-in's client secret before any secret is read", async () => {
      const reads: string[] = [];
      const { http, sent } = client(
        undefined,
        undefined,
        policy,
        {
          get: async (name) => {
            reads.push(name);
            return canary["example-key"];
          },
        },
        fakeSignInTokens(),
      );
      for (const as of ["bearer", "header"] as const) {
        const secret = "account-client-secret";
        const auth = as === "bearer" ? { secret, as } : { secret, as, header: "x-secret" };
        const request = http.fetch("https://oauth.example.com/token", { auth });
        expect(await refusal(request)).toBe("secret-sign-in-only");
      }
      expect(reads).toEqual([]);
      expect(sent).toEqual([]);
    });
  });

  describe("when the user has to sign in", () => {
    it("refuses with sign-in-needed, of the kind unauthenticated, and sends nothing", async () => {
      const { http, sent } = client(
        undefined,
        undefined,
        policy,
        undefined,
        fakeSignInTokens({ needsSignIn: true }),
      );
      const error = await http
        .fetch("https://api.example.com/v1", { auth: bearer })
        .catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(IntegrationRefusedError);
      expect((error as IntegrationRefusedError).code).toBe("sign-in-needed");
      expect(errorKindOf(error)).toBe("unauthenticated");
      expect(sent).toEqual([]);
    });

    it("refuses with sign-in-needed when the host has no sign-in tokens at all", async () => {
      const { http, sent } = client();
      expect(await refusal(http.fetch("https://api.example.com/v1", { auth: bearer }))).toBe(
        "sign-in-needed",
      );
      expect(sent).toEqual([]);
    });

    it("lets any other failure of access end the request as it is", async () => {
      const failing: SignInTokens = {
        access: async () => {
          throw new Error("the network is down");
        },
        rejected: () => {},
        filterValues: () => [],
      };
      const { http } = client(undefined, undefined, policy, undefined, failing);
      const error = await http
        .fetch("https://api.example.com/v1", { auth: bearer })
        .catch((thrown: unknown) => thrown);
      expect(error).not.toBeInstanceOf(IntegrationRefusedError);
      expect(error).not.toBeInstanceOf(SignInNeededError);
      expect((error as Error).message).toBe("the network is down");
    });

    it("refuses a token too short to keep out of what the integration sees", async () => {
      const { http, sent } = client(
        undefined,
        undefined,
        policy,
        undefined,
        fakeSignInTokens({ access: "abc" }),
      );
      expect(await refusal(http.fetch("https://api.example.com/v1", { auth: bearer }))).toBe(
        "secret-too-short",
      );
      expect(sent).toEqual([]);
    });
  });
});
