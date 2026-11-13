import { loadIntegration } from "@halonicjs/adapter-integration-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bearer,
  currentToken,
  redirectTo,
  refusedWith,
  requestsTo,
  second,
  signedInRig,
} from "./attack-helpers.test-helper.ts";
import { clientSecretName, exampleSheetRecord, signInName } from "./example-sheet.ts";
import { createSignInRig } from "./sign-in-rig.ts";

verifies("sign-in.kit-attacks", () => {
  describe("attack case T1: reading a token", () => {
    it("refuses a local integration whose sheet declares tokens or sign-ins", () => {
      const sheet = exampleSheetRecord();
      sheet["tokens"] = [{ name: "session", purpose: "Keeps you signed in." }];
      const integration = {
        name: "example",
        version: "1.0.0",
        tools: [],
        connect: () => ({ callTool: async () => "", close: async () => {} }),
      };
      const loaded = loadIntegration({
        source: { origin: "local", sheet, integration, approvedSheet: sheet },
        transport: createSignInRig().server.http as never,
        secrets: { get: async () => null },
        tokens: { get: async () => null, set: async () => {}, remove: async () => {} },
      });

      expect(loaded.ok).toBe(false);
      const codes = loaded.ok ? [] : loaded.error.map((problem) => problem.code);
      expect(codes).toEqual(expect.arrayContaining(["tokens-not-allowed", "sign-ins-not-allowed"]));
    });

    it("gives a built-in integration's host no way to read a sign-in token", async () => {
      const rig = await signedInRig();
      const host = rig.loaded.host as unknown as Record<string, unknown>;
      expect(Object.keys(host).sort()).not.toContain("signIns");
      expect(JSON.stringify(Object.keys(host))).not.toMatch(/signIn|accessToken/);
    });
  });

  describe("attack case T2: a token on a host the sign-in doesn't list", () => {
    it("refuses a first request to a declared host the sign-in doesn't list, and asks for no token", async () => {
      const rig = await signedInRig();
      const refreshes = rig.server.tokenRequests("refresh_token").length;
      const code = await refusedWith(rig.api("https://cdn.example.com/v1/me"));
      expect(code).toBe("token-not-allowed-for-host");
      expect(requestsTo(rig, "cdn.example.com")).toEqual([]);
      expect(rig.server.tokenRequests("refresh_token")).toHaveLength(refreshes);
    });

    it.each([
      "https://api.example.com.evil.example/v1",
      "https://evil.example/v1",
      "https://api.example.com:8443/v1",
      "http://api.example.com/v1",
    ])("refuses %s", async (url) => {
      const rig = await signedInRig();
      const sent = rig.server.requests.length;
      expect(await refusedWith(rig.api(url))).toBeDefined();
      expect(rig.server.requests).toHaveLength(sent);
    });

    it("leaves the token off a redirect to another declared host", async () => {
      const rig = await signedInRig();
      rig.server.handle("api.example.com", (request) =>
        request.url.pathname === "/start"
          ? redirectTo("https://cdn.example.com/landing")
          : undefined,
      );
      const response = await rig.api("https://api.example.com/start");
      expect(response.status).toBe(200);
      const [landing] = requestsTo(rig, "cdn.example.com");
      expect(landing?.headers["authorization"]).toBeUndefined();
      expect(
        rig.server.requestsCarrying(currentToken(rig)).map((request) => request.url.host),
      ).toEqual(["api.example.com", "api.example.com"]);
    });

    it("leaves the token off a redirect from https to plain http on a listed host", async () => {
      const rig = await signedInRig();
      rig.server.handle("api.example.com", (request) =>
        request.url.pathname === "/start" ? redirectTo("http://api.example.com/plain") : undefined,
      );
      await rig.api("https://api.example.com/start").catch(() => undefined);
      const plain = rig.server.requests.filter((request) => request.url.protocol === "http:");
      expect(plain.some((request) => request.headers["authorization"] !== undefined)).toBe(false);
      expect(
        rig.server
          .requestsCarrying(currentToken(rig))
          .every((request) => request.url.protocol === "https:"),
      ).toBe(true);
    });

    it("leaves the token off a redirect to a host the sheet doesn't declare, which the kit refuses", async () => {
      const rig = await signedInRig();
      rig.server.handle("api.example.com", (request) =>
        request.url.pathname === "/start" ? redirectTo("https://evil.example/landing") : undefined,
      );
      expect(await refusedWith(rig.api("https://api.example.com/start"))).toBe("host-not-allowed");
      expect(requestsTo(rig, "evil.example")).toEqual([]);
    });

    it("sends the token again when the redirect comes back to the listed host", async () => {
      const rig = await signedInRig();
      rig.server.handle("api.example.com", (request) => {
        if (request.url.pathname === "/start") return redirectTo("https://cdn.example.com/hop");
        return undefined;
      });
      rig.server.handle("cdn.example.com", () => redirectTo("https://api.example.com/v1/me"));
      const response = await rig.api("https://api.example.com/start");
      expect(response.status).toBe(200);
      expect(requestsTo(rig, "cdn.example.com")[0]?.headers["authorization"]).toBeUndefined();
      expect(requestsTo(rig, "api.example.com").at(-1)?.headers["authorization"]).toBe(
        `Bearer ${currentToken(rig)}`,
      );
    });
  });

  describe("attack case T3: placing the client secret", () => {
    const placements = [
      { secret: clientSecretName, as: "bearer" },
      { secret: clientSecretName, as: "header", header: "x-key" },
      { secret: clientSecretName, as: "form", field: "client_secret" },
    ] as const;

    it.each(placements)(
      "refuses a request that places the client secret as %o",
      async (placement) => {
        const rig = await signedInRig();
        const sent = rig.server.requests.length;
        const code = await refusedWith(
          rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
            method: "POST",
            body: new URLSearchParams(),
            auth: placement,
          }),
        );
        expect(code).toBe("secret-sign-in-only");
        expect(rig.server.requests).toHaveLength(sent);
      },
    );
  });

  describe("attack case T12: a built-in integration reaching a sign-in's stored name", () => {
    const sheetWithToken = (sheet: Record<string, unknown>) => {
      sheet["tokens"] = [{ name: "session", purpose: "Keeps you signed in." }];
    };

    it("refuses every name that isn't a declared token, so the s namespace can't be reached", async () => {
      const rig = await signedInRig({ editSheet: sheetWithToken });
      const stored = [...rig.store.entries()];
      const [grantName] = stored[0] ?? [""];
      expect(grantName).toMatch(/^s7_example_/);
      const names = [
        grantName,
        grantName.toUpperCase(),
        grantName.replaceAll("_", "-"),
        "s7_example_example-account",
        `${grantName}_staged`,
      ];
      for (const name of names) {
        expect(await refusedWith(rig.loaded.host.tokens.get(name))).toBe("token-not-declared");
        expect(await refusedWith(rig.loaded.host.tokens.set(name, "x"))).toBe("token-not-declared");
        expect(await refusedWith(rig.loaded.host.tokens.remove(name))).toBe("token-not-declared");
      }
      expect([...rig.store.entries()]).toEqual(stored);
    });

    it("keeps a declared token apart from the sign-in's grant", async () => {
      const rig = await signedInRig({ editSheet: sheetWithToken });
      expect(await rig.loaded.host.tokens.get("session")).toBeNull();
      await rig.loaded.host.tokens.set("session", "fake-session-value-0001");
      expect([...rig.store.keys()].sort()).toEqual([
        "i7_example_session",
        "s7_example_example-account",
      ]);
      await rig.loaded.host.tokens.remove("session");
      expect([...rig.store.keys()]).toEqual(["s7_example_example-account"]);
      expect((await rig.api()).status).toBe(200);
    });
  });

  describe("attack case T14: a token placed another way than the sheet says", () => {
    const wrong = [
      { signIn: signInName, as: "header", header: "x-api-key" },
      { signIn: signInName, as: "header", header: "authorization", prefix: "Bearer " },
      { signIn: signInName, as: "form", field: "access_token" },
    ] as const;

    it.each(wrong)("refuses %o, asks for no token and sends nothing", async (placement) => {
      const rig = await signedInRig();
      const sent = rig.server.requests.length;
      const code = await refusedWith(
        rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
          method: "POST",
          body: new URLSearchParams(),
          auth: placement as never,
        }),
      );
      expect(code).toBe("placement-not-in-sheet");
      expect(rig.server.requests).toHaveLength(sent);
    });

    it("refuses bearer where the sheet says header, and a prefix or header the sheet doesn't say", async () => {
      const rig = createSignInRig({
        signIn: {
          access: { hosts: ["api.example.com"], as: "header", header: "X-Token", prefix: "Token " },
        },
      });
      await rig.signIn();
      const fetchWith = (auth: object) =>
        rig.api("https://api.example.com/v1/me", { auth: auth as never });
      expect(await refusedWith(fetchWith(bearer))).toBe("placement-not-in-sheet");
      expect(
        await refusedWith(fetchWith({ signIn: signInName, as: "header", header: "x-token" })),
      ).toBe("placement-not-in-sheet");
      expect(
        await refusedWith(
          fetchWith({ signIn: signInName, as: "header", header: "x-other", prefix: "Token " }),
        ),
      ).toBe("placement-not-in-sheet");
      // The same header in another case is the sheet's header, and the provider doesn't take it as a bearer token.
      const response = await fetchWith({
        signIn: signInName,
        as: "header",
        header: "x-token",
        prefix: "Token ",
      });
      expect(response.status).toBe(401);
      expect(rig.server.requests.at(-1)?.headers["x-token"]).toMatch(/^Token fake-access/);
    });

    it("refuses a sign-in the sheet doesn't declare, however it is spelled", async () => {
      const rig = await signedInRig();
      for (const name of [
        "other-account",
        "toString",
        "__proto__",
        "constructor",
        "EXAMPLE-ACCOUNT",
      ]) {
        const code = await refusedWith(
          rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
            auth: { signIn: name, as: "bearer" },
          }),
        );
        expect(code, name).toBe("sign-in-not-declared");
      }
    });

    it("refuses the whole request when one of several placements is wrong", async () => {
      const rig = await signedInRig();
      const sent = rig.server.requests.length;
      const code = await refusedWith(
        rig.loaded.host.http.fetch("https://api.example.com/v1/me", {
          auth: [bearer, { signIn: signInName, as: "header", header: "x-api-key" }] as never,
        }),
      );
      expect(code).toBe("placement-not-in-sheet");
      expect(rig.server.requests).toHaveLength(sent);
    });
  });

  describe("attack case T16: a sign-in with a client secret", () => {
    it("refuses a sheet whose client secret declares its own hosts or placement", () => {
      const rig = createSignInRig;
      expect(() =>
        rig({
          editSheet(sheet) {
            sheet["secrets"] = {
              [clientSecretName]: { purpose: "x", hosts: ["cdn.example.com"], as: "bearer" },
            };
          },
        }),
      ).toThrow(/client-secret-has-hosts/);
    });

    it("sends the client secret only to the token and revoke endpoints, through a whole sign-in, refreshes and a sign-out", async () => {
      const rig = createSignInRig();
      rig.server.behavior.rotateRefreshTokens = true;
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      expect(started.authorizeUrl).not.toContain(rig.server.clientSecret);
      await rig.flow.handleCallback(new Request(rig.server.approve(started.authorizeUrl)));
      await rig.api();
      rig.advance(3600 * second);
      await rig.api();
      await rig.signIns.signOut(signInName);

      const carrying = rig.server.requestsCarrying(rig.server.clientSecret ?? "");
      expect(carrying.length).toBeGreaterThan(3);
      for (const request of carrying) {
        expect(request.url.host).toBe("auth.example.com");
        expect(request.url.pathname).toMatch(/\/oauth\/(token|revoke)$/);
        expect(request.url.search).toBe("");
        expect(request.method).toBe("POST");
      }
    });

    it("sends HTTP Basic client authentication only to the same endpoints", async () => {
      const rig = createSignInRig({ signIn: { clientAuth: "basic" } });
      await rig.signIn();
      await rig.api();
      await rig.signIns.signOut(signInName);
      const basic = rig.server.requests.filter((request) =>
        request.headers["authorization"]?.startsWith("Basic "),
      );
      expect(basic.length).toBe(3);
      expect(
        basic.every(
          (request) => request.url.host === "auth.example.com" && request.method === "POST",
        ),
      ).toBe(true);
    });
  });
});
