import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fakeAccountRef,
  fakeClient,
  fakeCode,
  fakeEmail,
  fakeIdToken,
  fakeRefreshToken,
  hostileError,
  htmlErrorPage,
  testStart,
  tokenSuccess,
} from "./fake-google.test-helper.ts";
import {
  gmailCheckUrl,
  knownVerifier,
  signInOnce,
  startInput,
  testServer,
  tokenEndpoint,
  tokenRequests,
} from "./sign-in.test-helper.ts";

const refreshName = `google-account-${fakeAccountRef}`;

verifies("google-sign-in.exchange", () => {
  it("exchanges the code with the client, verifier and redirect, and saves the refresh token", async () => {
    const { result, google, tokens } = await signInOnce(() => tokenSuccess());

    expect(result).toEqual({
      kind: "signedIn",
      accountRef: fakeAccountRef,
      email: fakeEmail,
      services: [{ service: "gmail", result: { kind: "works" }, checkedAt: new Date(testStart) }],
      at: new Date(testStart),
    });
    expect(google.requests.map((request) => request.url)).toEqual([tokenEndpoint, gmailCheckUrl]);
    const [request] = google.requests;
    expect(request?.url).toBe(tokenEndpoint);
    expect(request?.method).toBe("POST");
    // A 307 or 308 would send the same form, secrets and all, somewhere else.
    expect(request?.redirect).toBe("error");
    expect(Object.fromEntries(request?.form ?? [])).toEqual({
      grant_type: "authorization_code",
      code: fakeCode,
      client_id: fakeClient.clientId,
      client_secret: fakeClient.clientSecret,
      redirect_uri: "http://127.0.0.1:8787/google/callback",
      code_verifier: knownVerifier,
    });
    expect([...tokens.values]).toEqual([[refreshName, fakeRefreshToken]]);
  });

  it("starts with the account's auth URL and keeps it for Open again", async () => {
    const server = testServer(() => tokenSuccess());
    const { authUrl } = await server.start();
    const query = new URL(authUrl).searchParams;

    expect(query.get("client_id")).toBe(fakeClient.clientId);
    expect(query.get("login_hint")).toBe("account@example.com");
    expect(query.get("code_challenge_method")).toBe("S256");
    expect(server.ports.pendingSignIns.authUrlFor(fakeAccountRef)).toBe(authUrl);
  });

  it("refuses an account ref that can't name a token before it goes to Google", async () => {
    const server = testServer(() => tokenSuccess());

    await expect(
      server.start({ ...startInput, accountRef: "account@example.com" }),
    ).rejects.toThrow(RangeError);
    expect(server.ports.pendingSignIns.authUrlFor("account@example.com")).toBeUndefined();
  });

  it("refuses a client ref that can't name a secret before it goes to Google", async () => {
    const server = testServer(() => tokenSuccess());

    await expect(server.start({ ...startInput, clientRef: "not a ref" })).rejects.toThrow(
      RangeError,
    );
    expect(server.ports.pendingSignIns.authUrlFor(fakeAccountRef)).toBeUndefined();
  });

  it("maps Google's errors to results that hold its error code at most", async () => {
    const outcome = async (answer: () => Response) => (await signInOnce(answer)).result;

    expect(await outcome(() => hostileError("invalid_client", 401))).toEqual({
      kind: "wrongClientSecret",
      accountRef: fakeAccountRef,
    });
    expect(await outcome(() => hostileError("invalid_grant"))).toEqual({
      kind: "codeRefused",
      accountRef: fakeAccountRef,
    });
    expect(await outcome(() => hostileError("server_error", 500))).toEqual({
      kind: "googleError",
      accountRef: fakeAccountRef,
      errorCode: "server_error",
      status: 500,
    });
    expect(await outcome(htmlErrorPage)).toEqual({
      kind: "unexpectedAnswer",
      accountRef: fakeAccountRef,
      status: 502,
    });
    expect(await outcome(() => tokenSuccess({ refresh_token: undefined }))).toEqual({
      kind: "noRefreshToken",
      accountRef: fakeAccountRef,
    });
    expect(await outcome(() => tokenSuccess({ access_token: undefined }))).toEqual({
      kind: "unexpectedAnswer",
      accountRef: fakeAccountRef,
      status: 200,
    });
  });

  it("gives unreachable when the network fails, without the HttpClient's error", async () => {
    const { result } = await signInOnce(() => {
      throw new Error(`connection reset while sending ${fakeCode}`);
    });

    expect(result).toEqual({ kind: "unreachable", accountRef: fakeAccountRef });
  });

  it("gives unreachable when the connection drops while Google's answer is read", async () => {
    const droppedBody = new ReadableStream({
      start(controller) {
        controller.error(new Error(`connection reset while reading ${fakeRefreshToken}`));
      },
    });

    const { result, tokens } = await signInOnce(() => new Response(droppedBody, { status: 200 }));

    expect(result).toEqual({ kind: "unreachable", accountRef: fakeAccountRef });
    expect(tokens.values.size).toBe(0);
  });

  it("ends a damaged callback without sending anything to Google", async () => {
    const server = testServer(() => tokenSuccess());

    expect(await server.finish({ code: fakeCode })).toEqual({ kind: "linkNoLongerValid" });
    expect(await server.finish({ code: fakeCode, state: "" })).toEqual({
      kind: "linkNoLongerValid",
    });

    const first = await server.start();
    expect(await server.finish({ state: first.state })).toEqual({
      kind: "incompleteCallback",
      accountRef: fakeAccountRef,
    });
    // The damaged callback used up the pending sign-in, so the code can't follow it.
    expect(await server.finish({ code: fakeCode, state: first.state })).toEqual({
      kind: "linkNoLongerValid",
    });

    const second = await server.start();
    expect(await server.finish({ code: "", state: second.state })).toEqual({
      kind: "incompleteCallback",
      accountRef: fakeAccountRef,
    });
    expect(server.google.requests).toHaveLength(0);
    expect(server.tokens.values.size).toBe(0);
  });

  it("passes on each way Google refuses the sign-in, and saves nothing", async () => {
    const server = testServer(() => tokenSuccess());
    const refusal = async (error: string) => {
      const { state } = await server.start();
      return server.finish({ error, state });
    };

    expect(await refusal("admin_policy_enforced")).toEqual({
      kind: "adminBlocked",
      accountRef: fakeAccountRef,
    });
    expect(await refusal("org_internal")).toEqual({
      kind: "outsideOrganisation",
      accountRef: fakeAccountRef,
    });
    expect(await refusal("temporarily_unavailable")).toEqual({
      kind: "googleError",
      accountRef: fakeAccountRef,
      errorCode: "temporarily_unavailable",
    });
    expect(server.google.requests).toHaveLength(0);
    expect(server.tokens.values.size).toBe(0);
  });

  it("saves nothing when the ID token is refused or the client secret is missing", async () => {
    const refused = await signInOnce(() =>
      tokenSuccess({ id_token: fakeIdToken({ aud: "other-client.apps.example.com" }) }),
    );
    expect(refused.result).toEqual({ kind: "idTokenRefused", accountRef: fakeAccountRef });
    expect(refused.tokens.values.size).toBe(0);

    const server = testServer(() => tokenSuccess());
    const { state } = await server.start({ ...startInput, clientRef: "gclient_other" });
    expect(await server.finish({ code: fakeCode, state })).toEqual({
      kind: "noClientSecret",
      accountRef: fakeAccountRef,
    });
    expect(server.google.requests).toHaveLength(0);
  });

  it("overwrites the old refresh token on a second sign-in and never revokes it", async () => {
    let refreshToken = "";
    const server = testServer(() => tokenSuccess({ refresh_token: refreshToken }));
    for (const next of ["fake-refresh-token-first", "fake-refresh-token-second"]) {
      refreshToken = next;
      const { state } = await server.start();
      await server.finish({ code: fakeCode, state });
    }

    expect([...server.tokens.values]).toEqual([[refreshName, "fake-refresh-token-second"]]);
    expect(server.google.requests.map((request) => request.url)).toEqual([
      tokenEndpoint,
      gmailCheckUrl,
      tokenEndpoint,
      gmailCheckUrl,
    ]);
  });

  it("passes the callback's other results on and sends nothing to Google", async () => {
    const server = testServer(() => tokenSuccess());
    const { state } = await server.start();

    expect(await server.finish({ code: fakeCode, state: "fake-wrong-state" })).toEqual({
      kind: "linkNoLongerValid",
    });
    expect(await server.finish({ error: "access_denied", state })).toEqual({
      kind: "cancelled",
      accountRef: fakeAccountRef,
    });
    expect(await server.finish({ code: fakeCode, state })).toEqual({ kind: "linkNoLongerValid" });
    expect(server.google.requests).toHaveLength(0);
  });

  it("exchanges a code only once when the same callback comes twice at once", async () => {
    const server = testServer(() => tokenSuccess());
    const { state } = await server.start();

    const results = await Promise.all([
      server.finish({ code: fakeCode, state }),
      server.finish({ code: fakeCode, state }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["linkNoLongerValid", "signedIn"]);
    expect(tokenRequests(server.google.requests)).toHaveLength(1);
  });
});
