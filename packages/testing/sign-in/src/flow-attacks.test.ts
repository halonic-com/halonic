import { parseIntegrationSheet } from "@halonicjs/format/integration";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { exampleSheetRecord, signInName } from "./example-sheet.ts";
import { followingRedirects } from "./following-client.ts";
import { createSignInRig, type SignInRig } from "./sign-in-rig.ts";

/** The codes the provider has handed out that the flow sent to the token endpoint. */
function exchanges(rig: SignInRig) {
  return rig.server.tokenRequests("authorization_code");
}

/** Whether the grant is saved. */
function isSignedIn(rig: SignInRig): boolean {
  return rig.store.size > 0;
}

/** The problem codes the sheet check gives for a sign-in edited by `edit`. */
function sheetProblems(edit: (signIn: Record<string, unknown>) => void): string[] {
  const sheet = exampleSheetRecord();
  edit((sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {});
  const parsed = parseIntegrationSheet(sheet);
  return parsed.ok ? [] : parsed.error.map((problem) => problem.code);
}

verifies("sign-in.flow-attacks", () => {
  describe("attack case T7: a token endpoint that redirects", () => {
    it("sends the code and the client secret nowhere else, even when the client below would follow", async () => {
      const rig = createSignInRig({ signInHttp: followingRedirects });
      rig.server.behavior.redirectTokenEndpointTo = "https://evil.example/collect";
      rig.server.handle("evil.example", () => new Response("collected"));

      const { outcome } = await rig.signIn();

      expect(outcome).toMatchObject({ kind: "unreachable" });
      expect(rig.server.requests.filter((request) => request.url.host === "evil.example")).toEqual(
        [],
      );
      expect(isSignedIn(rig)).toBe(false);
    });

    it("refuses a redirect that a client hands back instead of following", async () => {
      const rig = createSignInRig();
      rig.server.behavior.redirectTokenEndpointTo = "https://evil.example/collect";

      const { outcome } = await rig.signIn();

      expect(outcome).toMatchObject({ kind: "unexpectedAnswer", status: 307 });
      expect(isSignedIn(rig)).toBe(false);
    });

    it("sends a refresh nowhere else either, and keeps the grant", async () => {
      const rig = createSignInRig({ signInHttp: followingRedirects });
      await rig.signIn();
      const savedGrant = [...rig.store.values()];
      rig.server.behavior.redirectTokenEndpointTo = "https://evil.example/collect";
      rig.server.handle("evil.example", () => new Response("collected"));

      await expect(rig.signIns.tokens.access(signInName)).rejects.toThrow();

      expect(rig.server.requests.filter((request) => request.url.host === "evil.example")).toEqual(
        [],
      );
      expect([...rig.store.values()]).toEqual(savedGrant);
    });

    it("sends a revoke nowhere else, and still removes the grant", async () => {
      const rig = createSignInRig({ signInHttp: followingRedirects });
      await rig.signIn();
      const refreshToken = rig.server.ledger.grants[0]?.currentRefreshToken ?? "";
      rig.server.handle("auth.example.com", (request) =>
        request.url.pathname.endsWith("/revoke")
          ? new Response(null, {
              status: 307,
              headers: { location: "https://evil.example/collect" },
            })
          : undefined,
      );
      rig.server.handle("evil.example", () => new Response("collected"));

      const result = await rig.signIns.signOut(signInName);

      expect(result).toEqual({ kind: "signedOut", revoke: "notConfirmed" });
      expect(
        rig.server
          .requestsCarrying(refreshToken)
          .filter((request) => request.url.host !== "auth.example.com"),
      ).toEqual([]);
      expect(isSignedIn(rig)).toBe(false);
    });
  });

  describe("attack case T8: an authorizeUrl that sets what Halonic sets", () => {
    it.each([
      "redirect_uri=https://evil.example/cb",
      "state=fixed",
      "code_challenge=fixed",
      "code_challenge_method=plain",
      "response_type=token",
      "client_id=other",
      "scope=admin",
      "Redirect_URI=https://evil.example/cb",
      "%72edirect_uri=https://evil.example/cb",
      "hint=a&redirect%5Furi=https://evil.example/cb",
    ])("refuses the sheet for %s", (query) => {
      const problems = sheetProblems((signIn) => {
        signIn["authorizeUrl"] = `https://auth.example.com/oauth/authorize?${query}`;
      });
      expect(problems).toEqual(["sign-in-reserved-parameter"]);
    });

    it("still builds an authorize URL with Halonic's own values only, once each", async () => {
      const rig = createSignInRig();
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      const query = new URL(started.authorizeUrl).searchParams;

      for (const name of [
        "redirect_uri",
        "state",
        "code_challenge",
        "client_id",
        "response_type",
      ]) {
        expect(query.getAll(name)).toHaveLength(1);
      }
      expect(query.get("redirect_uri")).toBe(`http://127.0.0.1:4711${started.callbackPath}`);
    });
  });

  describe("attack case T9: a callback that isn't the one the sign-in waits for", () => {
    it("refuses a wrong state and sends nothing to the token endpoint", async () => {
      const rig = createSignInRig();
      const { outcome, page } = await rig.signIn({ state: "state-nobody-issued" });
      expect(outcome).toMatchObject({ kind: "linkNoLongerValid" });
      expect(page.status).toBe(400);
      expect(exchanges(rig)).toEqual([]);
      expect(isSignedIn(rig)).toBe(false);
    });

    it("refuses a callback without a state", async () => {
      const rig = createSignInRig();
      const { outcome } = await rig.signIn({ state: null });
      expect(outcome).toMatchObject({ kind: "linkNoLongerValid" });
      expect(exchanges(rig)).toEqual([]);
    });

    it("refuses a code nobody issued, and a code used twice, without a second sign-in", async () => {
      const rig = createSignInRig();
      const unknown = await rig.signIn({ code: "fake-code-nobody-issued" });
      expect(unknown.outcome).toMatchObject({ kind: "codeRefused" });
      expect(isSignedIn(rig)).toBe(false);

      const first = await rig.signIn();
      expect(first.outcome).toMatchObject({ kind: "signedIn" });
      const replay = await rig.flow.handleCallback(new Request(first.callbackUrl));
      expect(replay.status).toBe(400);
      expect(
        exchanges(rig).filter(
          (request) => request.form["code"] === first.callbackUrl.searchParams.get("code"),
        ),
      ).toHaveLength(1);
    });

    it("refuses a code from an earlier sign-in on the callback of a new one", async () => {
      const rig = createSignInRig();
      const first = await rig.signIn();
      const oldCode = first.callbackUrl.searchParams.get("code") ?? "";
      await rig.signIns.signOut(signInName);

      const second = await rig.signIn({ code: oldCode });

      expect(second.outcome).toMatchObject({ kind: "codeRefused" });
      expect(isSignedIn(rig)).toBe(false);
    });

    describe("with an issuer in the sheet", () => {
      const withIssuer = (rig: ReturnType<typeof createSignInRig>) =>
        rig.editSheet((sheet) => {
          const signIns = sheet["signIns"] as Record<string, Record<string, unknown>>;
          (signIns[signInName] as Record<string, unknown>)["issuer"] = "https://auth.example.com";
        });

      it.each([
        ["another issuer", "https://evil.example"],
        ["a look-alike issuer", "https://auth.example.com.evil.example"],
        ["the issuer with a path", "https://auth.example.com/"],
        ["no issuer", null],
      ])("refuses a callback with %s", async (_name, iss) => {
        const rig = createSignInRig();
        withIssuer(rig);
        const { outcome } = await rig.signIn({ iss });
        expect(outcome).toMatchObject({ kind: "issuerMismatch" });
        expect(exchanges(rig)).toEqual([]);
        expect(isSignedIn(rig)).toBe(false);
      });

      it("takes the declared issuer", async () => {
        const rig = createSignInRig();
        withIssuer(rig);
        const { outcome } = await rig.signIn({ iss: "https://auth.example.com" });
        expect(outcome).toMatchObject({ kind: "signedIn" });
      });
    });

    describe("without an issuer in the sheet", () => {
      it("refuses an iss that isn't the authorize URL's origin", async () => {
        const rig = createSignInRig();
        const { outcome } = await rig.signIn({ iss: "https://evil.example" });
        expect(outcome).toMatchObject({ kind: "issuerMismatch" });
        expect(exchanges(rig)).toEqual([]);
      });

      it("takes an iss that is the origin, and a callback without one", async () => {
        const rig = createSignInRig();
        expect((await rig.signIn({ iss: "https://auth.example.com" })).outcome).toMatchObject({
          kind: "signedIn",
        });
        expect((await rig.signIn()).outcome).toMatchObject({ kind: "signedIn" });
      });
    });

    it("answers a callback on a path no sign-in is waiting at with a plain 400, and a page that repeats nothing", async () => {
      const rig = createSignInRig();
      await rig.flow.start(signInName, 4711);
      const stray = await rig.flow.handleCallback(
        new Request(
          "http://127.0.0.1:4711/sign-in/guess?code=fake-code-xyz&error=denied&error_description=<script>alert(1)</script>",
        ),
      );
      expect(stray.status).toBe(400);

      const hostile = await rig.signIn({
        user: "deny",
        extra: { error_description: "<script>alert(1)</script>", code: "fake-code-xyz" },
      });
      const text = await hostile.page.text();
      expect(text).not.toMatch(/script|fake-code-xyz|access_denied/);
      expect(hostile.page.headers.get("content-security-policy")).toBe("default-src 'none'");
    });
  });

  describe("attack case T10: a token answer that isn't a bearer token", () => {
    it.each([
      ["a token_type that isn't bearer", { token_type: "mac" }],
      ["no token_type", { token_type: undefined }],
      ["an empty token_type", { token_type: "" }],
      ["a token_type that isn't text", { token_type: 1 }],
      ["no access_token", { access_token: undefined }],
      ["an access_token that isn't text", { access_token: { nested: "fake-access-token-0001" } }],
    ])("saves nothing for %s", async (_name, fields) => {
      const rig = createSignInRig();
      rig.server.behavior.answerFields = fields;
      const { outcome } = await rig.signIn();
      expect(outcome).toMatchObject({ kind: "tokenAnswerRefused" });
      expect(isSignedIn(rig)).toBe(false);
    });

    it("takes bearer in any case", async () => {
      const rig = createSignInRig();
      rig.server.behavior.answerFields = { token_type: "BEARER" };
      expect((await rig.signIn()).outcome).toMatchObject({ kind: "signedIn" });
    });

    it("saves nothing for an answer that isn't JSON, or isn't an object", async () => {
      for (const body of ["<html>Service busy</html>", "[]", "null", '"text"']) {
        const rig = createSignInRig();
        rig.server.behavior.rawTokenAnswer = { status: 200, body };
        const { outcome } = await rig.signIn();
        expect(outcome).toMatchObject({ kind: "unexpectedAnswer", status: 200 });
        expect(isSignedIn(rig)).toBe(false);
      }
    });

    // Open gap, tracked as finding 1 of the attack-test task. `it.fails` turns red when the code closes it,
    // so this test is then changed to `it`.
    it.fails("saves nothing for an answer over 64 KiB", async () => {
      const rig = createSignInRig();
      rig.server.behavior.padTokenAnswerBytes = 70 * 1024;
      const { outcome } = await rig.signIn();
      expect(outcome).not.toMatchObject({ kind: "signedIn" });
      expect(isSignedIn(rig)).toBe(false);
    });

    it.fails("saves no refresh token of a megabyte", async () => {
      const rig = createSignInRig();
      rig.server.behavior.answerFields = { refresh_token: "r".repeat(1024 * 1024) };
      const { outcome } = await rig.signIn();
      expect(outcome).not.toMatchObject({ kind: "signedIn" });
      expect(isSignedIn(rig)).toBe(false);
    });
  });

  describe("attack case T4: a token endpoint that echoes what it was sent", () => {
    it("shows no secret, code or description of a provider's error in the outcome or the page", async () => {
      const rig = createSignInRig();
      const secret = rig.server.clientSecret ?? "";
      rig.server.behavior.rawTokenAnswer = {
        status: 400,
        body: JSON.stringify({
          error: "invalid_request",
          error_description: `bad request: client_secret=${secret} code=fake-code-0001-cccccccc`,
        }),
      };

      const { outcome, page } = await rig.signIn();

      expect(outcome).toEqual({
        kind: "providerError",
        signIn: signInName,
        errorCode: "invalid_request",
      });
      const shown = JSON.stringify(rig.outcomes) + (await page.text());
      expect(shown).not.toContain(secret);
      expect(shown).not.toContain("fake-code-0001");
      expect(shown).not.toContain("bad request");
    });

    it("shows a hostile error code only as a safe one", async () => {
      const rig = createSignInRig();
      const secret = rig.server.clientSecret ?? "";
      rig.server.behavior.rawTokenAnswer = {
        status: 400,
        body: JSON.stringify({ error: `<script>${secret}</script>` }),
      };

      await rig.signIn();

      expect(JSON.stringify(rig.outcomes)).not.toMatch(/script|fake-client-secret/);
    });

    it("sends no token to the page of a signed-in callback", async () => {
      const rig = createSignInRig();
      const { page } = await rig.signIn();
      const text = await page.text();
      expect(text).not.toMatch(/fake-(access|refresh)-token|fake-code/);
    });
  });

  describe("attack case T19: a token that would make the filter remove everything", () => {
    const tokens = [
      ["one character", "a"],
      ["fifteen characters", "a".repeat(15)],
      ["only spaces", " ".repeat(40)],
      ["a space inside", "fake-token with-space-0001"],
      ["a line break inside", "fake-token\r\nx-injected: 1"],
      ["a tab inside", "fake-token\twith-tab-0001"],
      ["non-ASCII", "fake-token-with-ä-0001"],
      ["a control character", "fake-token-\u0007-0000001"],
    ] as const;

    it.each(tokens)("refuses an access token of %s", async (_name, token) => {
      const rig = createSignInRig();
      rig.server.behavior.answerFields = { access_token: token };
      const { outcome } = await rig.signIn();
      expect(outcome).toMatchObject({ kind: "tokenAnswerRefused" });
      expect(isSignedIn(rig)).toBe(false);
    });

    it.each(tokens)("refuses a refresh token of %s", async (_name, token) => {
      const rig = createSignInRig();
      rig.server.behavior.answerFields = { refresh_token: token };
      const { outcome } = await rig.signIn();
      expect(outcome).toMatchObject({ kind: "tokenAnswerRefused" });
      expect(isSignedIn(rig)).toBe(false);
    });
  });

  describe("attack case T20: a callback that comes too late or after a change", () => {
    it("refuses a callback after the sheet's token endpoint changed, and never uses the new one", async () => {
      const rig = createSignInRig();
      rig.server.handle("evil.example", () => new Response("collected"));
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      const callback = rig.server.approve(started.authorizeUrl);

      rig.editSheet((sheet) => {
        const signIn =
          (sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {};
        signIn["tokenUrl"] = "https://evil.example/token";
      });
      await rig.flow.handleCallback(new Request(callback));

      expect(rig.outcomes.at(-1)).toMatchObject({ kind: "signInChanged" });
      expect(rig.server.requests.filter((request) => request.method === "POST")).toEqual([]);
      expect(isSignedIn(rig)).toBe(false);
    });

    it("refuses a callback after a setting changed the client", async () => {
      const rig = createSignInRig();
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      const callback = rig.server.approve(started.authorizeUrl);
      rig.changeSettings({ clientId: "another-client" });

      await rig.flow.handleCallback(new Request(callback));

      expect(rig.outcomes.at(-1)).toMatchObject({ kind: "signInChanged" });
      expect(exchanges(rig)).toEqual([]);
    });

    it("refuses a callback after the pending sign-in expired", async () => {
      const rig = createSignInRig();
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      const callback = rig.server.approve(started.authorizeUrl);
      rig.advance(10 * 60 * 1000 + 1);

      const page = await rig.flow.handleCallback(new Request(callback));

      expect(page.status).toBe(400);
      expect(rig.outcomes.at(-1)).toMatchObject({ kind: "linkNoLongerValid" });
      expect(exchanges(rig)).toEqual([]);
    });

    it("refuses the callback of a sign-in that was cancelled or started again", async () => {
      const rig = createSignInRig();
      const first = await rig.flow.start(signInName, 4711);
      if (first.kind !== "started") throw new Error("the sign-in didn't start");
      const oldCallback = rig.server.approve(first.authorizeUrl);
      await rig.flow.start(signInName, 4711);

      const page = await rig.flow.handleCallback(new Request(oldCallback));

      expect(page.status).toBe(400);
      expect(exchanges(rig)).toEqual([]);
    });
  });

  describe("attack case T21: shell characters in the authorize URL", () => {
    const characters = ["a|b", 'a"b', "a^b", "%PATH%", "`calc`", "a;b", "$(calc)", "a\\b", "a<b>c"];

    it.each(characters)("gives one URL that carries %s only as an escape", async (value) => {
      const rig = createSignInRig();
      rig.editSheet((sheet) => {
        const signIn =
          (sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {};
        signIn["authorizeUrl"] = `https://auth.example.com/oauth/authorize?hint=${value}`;
      });

      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");

      // Only the `&` between parameters is left raw, and a cmd.exe `start` would take that one for a separator.
      expect(started.authorizeUrl).not.toMatch(/[\s"'<>`|^;$()\\]/);
      expect(started.authorizeUrl).not.toMatch(/%(?![0-9A-F]{2})/);
      expect(new URL(started.authorizeUrl).searchParams.get("hint")).toBe(value);
      expect(new URL(started.authorizeUrl).host).toBe("auth.example.com");
      expect(() => rig.server.approve(started.authorizeUrl)).not.toThrow();
    });

    it("keeps an encoded ampersand inside its parameter, so the provider reads what the sheet wrote", async () => {
      const rig = createSignInRig();
      rig.editSheet((sheet) => {
        const signIn =
          (sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {};
        signIn["authorizeUrl"] = "https://auth.example.com/oauth/authorize?hint=a%26calc%26b";
      });
      const started = await rig.flow.start(signInName, 4711);
      if (started.kind !== "started") throw new Error("the sign-in didn't start");
      expect(new URL(started.authorizeUrl).searchParams.get("hint")).toBe("a&calc&b");
    });
  });
});
