import { describe, expect, it } from "vitest";
import { canary, fakeTransport, policy, redirect, secrets } from "./fake-transport.test-helper.ts";
import { createLimitedHttpClient, type RequestLimits } from "./limited-http.ts";
import type { IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError, type RefusalCode } from "./refused.ts";
import { RequestLog } from "./request-log.ts";

function client(answer?: Parameters<typeof fakeTransport>[0], limits?: RequestLimits) {
  const { transport, sent } = fakeTransport(answer);
  const log = new RequestLog();
  let clock = 0;
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets,
    log,
    now: () => clock++,
    ...(limits ? { limits } : {}),
  });
  return { http, sent, log };
}

async function refusal(promise: Promise<unknown>): Promise<RefusalCode> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(IntegrationRefusedError);
  return (error as IntegrationRefusedError).code;
}

describe("integration-kit.declared-hosts-only", () => {
  it("sends to a declared host over https, matching the host exactly", async () => {
    const { http, sent } = client();
    const response = await http.fetch("https://API.example.com/v1/forecast?city=Ghent");
    expect(await response.text()).toBe("ok");
    expect(sent.map((r) => r.url)).toEqual(["https://api.example.com/v1/forecast?city=Ghent"]);
    expect(sent[0]?.redirect).toBe("manual");
  });

  it.each([
    ["an undeclared host", "https://evil.example/collect", "host-not-allowed"],
    ["a subdomain of a declared host", "https://x.api.example.com/", "host-not-allowed"],
    ["a declared host as a prefix", "https://api.example.com.evil.example/", "host-not-allowed"],
    ["a declared host on another port", "https://api.example.com:8443/", "host-not-allowed"],
    ["plain http", "http://api.example.com/", "scheme-not-allowed"],
    ["a file", "file:///etc/passwd", "scheme-not-allowed"],
    ["a data URL", "data:text/plain,hi", "scheme-not-allowed"],
    ["a user name in the URL", "https://user:pw@api.example.com/", "bad-url"],
    ["a relative URL", "/v1/forecast", "bad-url"],
  ])("refuses %s and sends nothing", async (_what, url, code) => {
    const { http, sent } = client();
    expect(await refusal(http.fetch(url))).toBe(code);
    expect(sent).toEqual([]);
  });

  it("allows a declared host:port", async () => {
    const { http, sent } = client();
    await http.fetch("https://local.example.com:8443/health");
    expect(sent).toHaveLength(1);
  });

  it("refuses a URL that is not a string", async () => {
    const { http } = client();
    const notAString = new URL("https://api.example.com/") as unknown as string;
    expect(await refusal(http.fetch(notAString))).toBe("bad-url");
  });
});

describe("integration-kit.local-http-hosts", () => {
  const local: IntegrationPolicy = {
    ...policy,
    localHosts: ["localhost:3000", "192.168.1.5:8080", "api.example.com", "169.254.169.254"],
    secrets: { "example-key": { hosts: ["localhost:3000", "192.168.1.5:8080"] } },
  };
  function localClient() {
    const { transport, sent } = fakeTransport();
    const log = new RequestLog();
    const http = createLimitedHttpClient({ policy: local, transport, secrets, log });
    return { http, sent };
  }

  it("sends plain http to a local host the user chose, with a key only to this machine", async () => {
    const { http, sent } = localClient();
    await http.fetch("http://localhost:3000/mcp", {
      auth: { secret: "example-key", as: "bearer" },
    });
    await http.fetch("http://192.168.1.5:8080/mcp");
    expect(sent.map((r) => r.url)).toEqual([
      "http://localhost:3000/mcp",
      "http://192.168.1.5:8080/mcp",
    ]);
    expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${canary["example-key"]}`);
  });

  it.each([
    ["a public host in the local list", "http://api.example.com/", "scheme-not-allowed"],
    ["the cloud metadata address", "http://169.254.169.254/latest", "scheme-not-allowed"],
    ["another port", "http://localhost:3001/", "scheme-not-allowed"],
    ["a local host over https that isn't declared", "https://localhost:3000/", "host-not-allowed"],
  ])("refuses %s", async (_what, url, code) => {
    const { http, sent } = localClient();
    expect(await refusal(http.fetch(url))).toBe(code);
    expect(sent).toEqual([]);
  });

  it("refuses a key over plain http to another machine on the network", async () => {
    const { http, sent } = localClient();
    const request = http.fetch("http://192.168.1.5:8080/mcp", {
      auth: { secret: "example-key", as: "bearer" },
    });
    expect(await refusal(request)).toBe("secret-over-plain-http");
    expect(sent).toEqual([]);
  });
});

describe("integration-kit.secrets-placed-by-kit", () => {
  it("puts a bearer secret in only for its declared host", async () => {
    const { http, sent } = client();
    await http.fetch("https://api.example.com/v1", {
      auth: { secret: "example-key", as: "bearer" },
    });
    expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${canary["example-key"]}`);
  });

  it("puts a secret in a named header with a prefix", async () => {
    const { http, sent } = client();
    await http.fetch("https://api.example.com/v1", {
      auth: { secret: "example-key", as: "header", header: "x-api-key", prefix: "Key " },
    });
    expect(sent[0]?.headers["x-api-key"]).toBe(`Key ${canary["example-key"]}`);
  });

  it("puts a secret in a form field and keeps the other fields", async () => {
    const { http, sent } = client();
    await http.fetch("https://oauth.example.com/token", {
      method: "POST",
      body: new URLSearchParams({ grant_type: "refresh_token" }),
      auth: { secret: "client-secret", as: "form", field: "client_secret" },
    });
    const form = new URLSearchParams(sent[0]?.body ?? "");
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("client_secret")).toBe(canary["client-secret"]);
  });

  it.each([
    ["an undeclared secret", "https://api.example.com/", "other-key", "secret-not-declared"],
    [
      "a secret sent to another declared host",
      "https://cdn.example.com/",
      "example-key",
      "secret-not-allowed-for-host",
    ],
    [
      "a declared secret with no value",
      "https://oauth.example.com/",
      "client-secret-missing",
      "secret-not-declared",
    ],
  ])("refuses %s and sends nothing", async (_what, url, secret, code) => {
    const { http, sent } = client();
    expect(await refusal(http.fetch(url, { auth: { secret, as: "bearer" } }))).toBe(code);
    expect(sent).toEqual([]);
  });

  it("refuses a declared secret that isn't configured", async () => {
    const { transport, sent } = fakeTransport();
    const http = createLimitedHttpClient({
      policy,
      transport,
      secrets: { get: async () => null },
      log: new RequestLog(),
    });
    const code = await refusal(
      http.fetch("https://api.example.com/", { auth: { secret: "example-key", as: "bearer" } }),
    );
    expect(code).toBe("secret-not-configured");
    expect(sent).toEqual([]);
  });

  it("refuses a form placement without a form body, and a streamed body", async () => {
    const { http, sent } = client();
    const placement = { secret: "client-secret", as: "form", field: "client_secret" } as const;
    expect(
      await refusal(
        http.fetch("https://oauth.example.com/token", { method: "POST", auth: placement }),
      ),
    ).toBe("secret-needs-form-body");
    const stream = new Response("x").body;
    expect(
      await refusal(http.fetch("https://api.example.com/", { method: "POST", body: stream })),
    ).toBe("body-not-supported");
    expect(sent).toEqual([]);
  });

  it("never names a secret value in an error message", async () => {
    const { http } = client();
    const error = await http
      .fetch("https://cdn.example.com/", { auth: { secret: "example-key", as: "bearer" } })
      .catch((thrown: Error) => thrown);
    expect(String(error)).not.toContain(canary["example-key"]);
  });
});

describe("integration-kit.redirects-checked", () => {
  it("follows a redirect to a declared host and drops a secret that may not go there", async () => {
    const { http, sent } = client((url) =>
      url.host === "api.example.com"
        ? redirect(302, "https://cdn.example.com/file")
        : new Response("file"),
    );
    const response = await http.fetch("https://api.example.com/download", {
      headers: { authorization: "Bearer own-token", accept: "text/plain" },
      auth: { secret: "example-key", as: "header", header: "x-api-key" },
    });
    expect(await response.text()).toBe("file");
    expect(response.url).toBe("https://cdn.example.com/file");
    expect(sent[1]?.headers).toEqual({ accept: "text/plain" });
  });

  it.each([
    ["an undeclared host", "https://evil.example/steal"],
    ["plain http", "http://api.example.com/v1"],
    ["a file", "file:///etc/passwd"],
  ])("refuses a redirect to %s", async (_what, location) => {
    const { http, sent } = client(() => redirect(307, location));
    expect(
      await refusal(
        http.fetch("https://api.example.com/", { auth: { secret: "example-key", as: "bearer" } }),
      ),
    ).not.toBe(undefined);
    expect(sent).toHaveLength(1);
  });

  it("resolves a relative Location against the current URL", async () => {
    const { http, sent } = client((url) =>
      url.pathname === "/old" ? redirect(301, "/new") : new Response("new"),
    );
    expect(await (await http.fetch("https://api.example.com/old")).text()).toBe("new");
    expect(sent.map((r) => r.url)).toEqual([
      "https://api.example.com/old",
      "https://api.example.com/new",
    ]);
  });

  it("turns a POST into a GET without body after a 303, and keeps it after a 307", async () => {
    const answer = (status: number) => (url: URL) =>
      url.pathname === "/submit" ? redirect(status, "/done") : new Response("done");
    const after303 = client(answer(303));
    await after303.http.fetch("https://api.example.com/submit", { method: "POST", body: "a=1" });
    expect(after303.sent[1]).toMatchObject({ method: "GET", body: null });
    const after307 = client(answer(307));
    await after307.http.fetch("https://api.example.com/submit", { method: "POST", body: "a=1" });
    expect(after307.sent[1]).toMatchObject({ method: "POST", body: "a=1" });
  });

  it("stops after the redirect limit", async () => {
    const { http, sent } = client(() => redirect(302, "/again"), { maxRedirects: 2 });
    expect(await refusal(http.fetch("https://api.example.com/"))).toBe("too-many-redirects");
    expect(sent).toHaveLength(3);
  });
});

describe("integration-kit.request-limits", () => {
  it("refuses a response whose declared length is over the limit", async () => {
    const { http } = client(() => new Response("12345", { headers: { "content-length": "5" } }), {
      maxResponseBytes: 4,
    });
    expect(await refusal(http.fetch("https://api.example.com/"))).toBe("response-too-large");
  });

  it("fails while reading a body that grows over the limit", async () => {
    const { http } = client(() => new Response("123456789"), { maxResponseBytes: 4 });
    const response = await http.fetch("https://api.example.com/");
    expect(await refusal(response.text())).toBe("response-too-large");
  });

  it("passes the caller's signal and its own timeout to the transport", async () => {
    const { http } = client();
    const aborted = AbortSignal.abort(new Error("stopped"));
    await expect(http.fetch("https://api.example.com/", { signal: aborted })).rejects.toThrow(
      "stopped",
    );
    const slow = createLimitedHttpClient({
      policy,
      transport: {
        fetch: (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          ),
      },
      secrets,
      log: new RequestLog(),
      limits: { timeoutMs: 10 },
    });
    await expect(slow.fetch("https://api.example.com/")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("times out waiting for headers even when the transport ignores the signal", async () => {
    const stuck = createLimitedHttpClient({
      policy,
      transport: { fetch: () => new Promise<Response>(() => {}) },
      secrets,
      log: new RequestLog(),
      limits: { headersTimeoutMs: 10 },
    });
    await expect(stuck.fetch("https://api.example.com/")).rejects.toMatchObject({
      name: "TimeoutError",
      message: expect.stringContaining("no response headers"),
    });
  });

  it("lets a steady body run past the headers timeout, and fails one that stalls", async () => {
    const limits = { headersTimeoutMs: 20, idleTimeoutMs: 30 };
    const steady = client(() => new Response(pieces(["a", "b", "c", "d", "e"], 10)), limits);
    expect(await (await steady.http.fetch("https://api.example.com/")).text()).toBe("abcde");

    const stalled = client(() => new Response(pieces(["a"], 0, { hang: true })), limits);
    const response = await stalled.http.fetch("https://api.example.com/");
    await expect(response.text()).rejects.toMatchObject({
      name: "TimeoutError",
      message: expect.stringContaining("no data"),
    });
  });

  it("doesn't count time the integration spends between reads", async () => {
    const { http } = client(() => new Response(pieces(["a", "b"], 0)), { idleTimeoutMs: 10 });
    const body = (await http.fetch("https://api.example.com/")).body;
    const reader = body?.getReader();
    await reader?.read();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect((await reader?.read())?.done).toBe(false);
  });

  it("ends the whole request at the overall limit", async () => {
    const { http } = client(() => new Response(pieces(["a", "b", "c", "d", "e", "f"], 10)), {
      idleTimeoutMs: 1_000,
      timeoutMs: 25,
    });
    const response = await http.fetch("https://api.example.com/");
    await expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

/** A body that sends each piece after a pause, and can hang after the last one. */
function pieces(
  parts: readonly string[],
  pauseMs: number,
  options: { hang?: boolean } = {},
): ReadableStream<Uint8Array> {
  const queue = [...parts];
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = queue.shift();
      if (next === undefined) {
        if (options.hang) await new Promise(() => {});
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
      controller.enqueue(new TextEncoder().encode(next));
    },
  });
}

describe("integration-kit.request-log", () => {
  it("logs method, host, path, status and time, and no query, header or secret", async () => {
    const { http, log } = client();
    await http.fetch("https://api.example.com/v1/forecast?city=Ghent&token=abc", {
      auth: { secret: "example-key", as: "bearer" },
    });
    await http.fetch("https://evil.example/collect?leak=1").catch(() => {});
    expect(log.entries()).toEqual([
      {
        method: "GET",
        host: "api.example.com",
        path: "/v1/forecast",
        status: 200,
        durationMs: 1,
        outcome: "ok",
      },
      {
        method: "GET",
        host: "evil.example",
        path: "/collect",
        durationMs: 1,
        outcome: "refused",
        refusal: "host-not-allowed",
      },
    ]);
    expect(JSON.stringify(log.entries())).not.toMatch(/Ghent|abc|leak|canary/);
  });

  it("keeps only the most recent entries", () => {
    const log = new RequestLog(2);
    for (const path of ["/a", "/b", "/c"])
      log.add({ method: "GET", host: "h", path, durationMs: 0, outcome: "ok" });
    expect(log.entries().map((e) => e.path)).toEqual(["/b", "/c"]);
  });
});
