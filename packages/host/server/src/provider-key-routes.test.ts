import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKeyStore, RequestLogEntry, Server } from "./api.ts";
import { ProviderKeysReadOnlyError, providerKeysOf } from "./provider-key-routes.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const canaryValue = "sk-canary-value-1234";
const canaryName = "canary-key-name";
const lanHost = "lan.example:8080";

/** A store in a map. `calls` lists what the routes asked of it. */
class FakeKeys implements ProviderKeyStore {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  async has(name: string): Promise<boolean> {
    this.calls.push("has");
    return this.values.has(name);
  }
  async set(name: string, value: string): Promise<void> {
    this.calls.push("set");
    this.values.set(name, value);
  }
  async remove(name: string): Promise<void> {
    this.calls.push("remove");
    this.values.delete(name);
  }
}

/** With `password`, a session is needed, and the server also answers to a LAN name over plain http. */
function setup(options: { keys?: ProviderKeyStore | null; password?: boolean } = {}) {
  const keys = options.keys === undefined ? new FakeKeys() : options.keys;
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const clock = new TestClock();
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    ...(keys === null ? {} : { providerKeys: keys }),
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost", lanHost] },
  });
  return { server, keys, requestLog, errors };
}

/** Signs in over the LAN name and returns the headers that make a request come from that session. */
async function lanSession(
  server: Server,
  context?: { secure?: boolean },
): Promise<Record<string, string>> {
  const response = await server.handle(
    new Request(`http://${lanHost}/api/login`, {
      method: "POST",
      headers: { host: lanHost, "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
    context,
  );
  return { host: lanHost, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

function send(
  server: Server,
  method: string,
  path: string,
  options: { body?: string; headers?: Record<string, string>; context?: { secure?: boolean } } = {},
): Promise<Response> {
  const host = options.headers?.["host"] ?? "localhost";
  return server.handle(
    new Request(`http://${host}${path}`, {
      method,
      headers: { host, ...options.headers },
      ...(options.body === undefined ? {} : { body: options.body }),
    }),
    options.context,
  );
}

const jsonHeaders = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

function put(
  server: Server,
  name: string,
  body: string,
  headers: Record<string, string> = jsonHeaders,
  context?: { secure?: boolean },
): Promise<Response> {
  return send(server, "PUT", `/api/secrets/${name}`, {
    body,
    headers,
    ...(context === undefined ? {} : { context }),
  });
}

const valueBody = (value: string): string => JSON.stringify({ value });

describe("provider key read", () => {
  verifies("server.secrets-read", () => {
    it("says whether a key is stored, and never the value", async () => {
      const { server, keys } = setup();
      await put(server, "openai-key", valueBody(canaryValue));

      const stored = await send(server, "GET", "/api/secrets/openai-key");
      const missing = await send(server, "GET", "/api/secrets/other-key");

      expect(await stored.json()).toEqual({ stored: true });
      expect(await missing.json()).toEqual({ stored: false });
      expect(keys instanceof FakeKeys && keys.calls.filter((call) => call === "has")).toHaveLength(
        2,
      );
    });

    it("answers 404 keys_not_supported for every verb when the host has no store", async () => {
      const { server } = setup({ keys: null });
      for (const method of ["GET", "PUT", "DELETE"]) {
        const response = await send(server, method, "/api/secrets/openai-key");
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: "keys_not_supported" });
      }
    });

    it("lets GET and DELETE through over plain http to a LAN name", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server);
      const headers = lan;
      const read = await send(server, "GET", "/api/secrets/openai-key", { headers });
      expect(read.status).toBe(200);
    });

    it("makes a store that says yes from a SecretStore's get, without listing names", async () => {
      const keys = providerKeysOf({
        get: async (name) => (name === "k" ? "v" : null),
        set: async () => {},
        remove: async () => {},
        names: async () => {
          throw new Error("names was called");
        },
      });
      expect(await keys.has("k")).toBe(true);
      expect(await keys.has("other")).toBe(false);
    });
  });
});

describe("provider key write", () => {
  verifies("server.secrets-write", () => {
    it("stores the value exactly as sent and answers saved", async () => {
      const { server, keys } = setup();

      const response = await put(server, "openai-key", valueBody(`  ${canaryValue}  `));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true });
      expect((keys as FakeKeys).values.get("openai-key")).toBe(`  ${canaryValue}  `);
    });

    it("replaces the key under the same name", async () => {
      const { server, keys } = setup();
      await put(server, "openai-key", valueBody("first"));
      await put(server, "openai-key", valueBody("second"));
      expect((keys as FakeKeys).values.get("openai-key")).toBe("second");
    });

    it("refuses a body without a usable value and stores nothing", async () => {
      const { server, keys } = setup();
      const bodies = [
        valueBody(""),
        valueBody("   "),
        JSON.stringify({ value: 5 }),
        JSON.stringify([canaryValue]),
        JSON.stringify({ other: canaryValue }),
        `not json ${canaryValue}`,
      ];
      for (const body of bodies) {
        const response = await put(server, "openai-key", body);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "secret_not_accepted" });
      }
      expect((keys as FakeKeys).values.size).toBe(0);
    });

    it("ignores unknown fields, and never reads a confirm flag", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server);
      const body = JSON.stringify({ value: canaryValue, confirmedPlainHttp: true, extra: 1 });
      const response = await put(server, "openai-key", body, {
        ...jsonHeaders,
        ...lan,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "secure_connection_required" });
      expect(
        (await put(server, "openai-key", body, { ...jsonHeaders, cookie: lan["cookie"] ?? "" }))
          .status,
      ).toBe(200);
    });

    it("answers 400, not 413, for a value over the limit even when fully escaped", async () => {
      const { server } = setup({});
      const escaped = "\\u0041".repeat(64 * 1024 + 1);
      const wide = testServer({
        passwordHash: null,
        providerKeys: new FakeKeys(),
        config: { maxBodyBytes: 1024 * 1024 },
      });
      const tooLong = await put(wide, "openai-key", `{"value":"${escaped}"}`);
      expect(tooLong.status).toBe(400);
      expect(await tooLong.json()).toMatchObject({ code: "secret_not_accepted" });
      const atLimit = "\\u0041".repeat(64 * 1024);
      expect((await put(wide, "openai-key", `{"value":"${atLimit}"}`)).status).toBe(200);
      expect(server).toBeDefined();
    });
  });
});

describe("provider key remove", () => {
  verifies("server.secrets-remove", () => {
    it("removes a key, and succeeds when none was stored", async () => {
      const { server } = setup();
      await put(server, "openai-key", valueBody(canaryValue));

      const first = await send(server, "DELETE", "/api/secrets/openai-key", {
        headers: jsonHeaders,
      });
      const again = await send(server, "DELETE", "/api/secrets/openai-key", {
        headers: jsonHeaders,
      });
      const read = await send(server, "GET", "/api/secrets/openai-key");

      expect(await first.json()).toEqual({ removed: true });
      expect(await again.json()).toEqual({ removed: true });
      expect(await read.json()).toEqual({ stored: false });
    });

    it("works over plain http to a LAN name, since it sends no secret", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server);
      const response = await send(server, "DELETE", "/api/secrets/openai-key", {
        headers: lan,
      });
      expect(response.status).toBe(200);
    });
  });
});

describe("provider key refusals", () => {
  verifies("server.secrets-refusals", () => {
    describe("a store whose keys can't change", () => {
      const readOnly: ProviderKeyStore = {
        has: async () => true,
        set: async () => {
          throw new ProviderKeysReadOnlyError();
        },
        remove: async () => {
          throw new ProviderKeysReadOnlyError();
        },
      };

      it("answers 409 keys_read_only to a PUT and a DELETE, and logs nothing", async () => {
        const { server, errors } = setup({ keys: readOnly });
        const saved = await put(server, canaryName, valueBody(canaryValue));
        const removed = await send(server, "DELETE", `/api/secrets/${canaryName}`, {
          headers: jsonHeaders,
        });
        for (const response of [saved, removed]) {
          expect(response.status).toBe(409);
          expect(response.headers.get("cache-control")).toBe("no-store");
          const text = await response.text();
          expect(JSON.parse(text)).toMatchObject({ code: "keys_read_only" });
          expect(text).not.toContain(canaryName);
          expect(text).not.toContain(canaryValue);
        }
        expect(errors).toEqual([]);
      });

      it("still runs the connection check first", async () => {
        const { server } = setup({ keys: readOnly, password: true });
        const lan = await lanSession(server);
        const response = await put(server, "openai-key", valueBody(canaryValue), {
          ...jsonHeaders,
          ...lan,
          host: lanHost,
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "secure_connection_required" });
      });
    });

    it("refuses a request from another site on every verb", async () => {
      const { server } = setup();
      for (const method of ["GET", "PUT", "DELETE"]) {
        const response = await send(server, method, "/api/secrets/openai-key", {
          headers: { ...jsonHeaders, "sec-fetch-site": "cross-site" },
          body: method === "PUT" ? valueBody(canaryValue) : undefined,
        } as never);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "secret_from_other_site" });
      }
    });

    it("lets a request with no Sec-Fetch-Site header through", async () => {
      const { server, keys } = setup();
      const response = await put(server, "openai-key", valueBody("v"), {
        "content-type": "application/json",
      });
      expect(response.status).toBe(200);
      expect((keys as FakeKeys).values.size).toBe(1);
    });

    it("refuses a name that breaks the rule or belongs to Halonic or a plugin, on every verb", async () => {
      const { server, keys } = setup();
      const names = [
        "serve-password",
        "Serve_Password",
        "token-key",
        "halonic_token_abc",
        "plugin__weather__key",
        "1bad",
        "a%2Fb",
        "a/b",
        "%E0%A4%A",
        "",
      ];
      for (const name of names) {
        for (const method of ["GET", "PUT", "DELETE"]) {
          const response = await send(server, method, `/api/secrets/${name}`, {
            headers: jsonHeaders,
            ...(method === "PUT" ? { body: valueBody(canaryValue) } : {}),
          });
          expect(response.status, `${method} ${name}`).toBe(400);
          expect(await response.json()).toMatchObject({ code: "secret_name_refused" });
        }
      }
      expect((keys as FakeKeys).calls).toEqual([]);
    });

    it("refuses a PUT that is not JSON, and one over plain http to a LAN name", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server);
      const notJson = await put(server, "openai-key", valueBody("v"), {
        "content-type": "text/plain",
        "sec-fetch-site": "same-origin",
        cookie: lan["cookie"] ?? "",
      });
      expect(notJson.status).toBe(415);
      expect(await notJson.json()).toMatchObject({ code: "json_required" });

      const plain = await put(server, "openai-key", valueBody("v"), {
        ...jsonHeaders,
        ...lan,
      });
      expect(plain.status).toBe(403);
      expect(await plain.json()).toMatchObject({ code: "secure_connection_required" });
    });

    it("accepts a PUT to a LAN name when the host vouches for HTTPS", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server, { secure: true });
      const response = await put(
        server,
        "openai-key",
        valueBody("v"),
        { ...jsonHeaders, ...lan },
        { secure: true },
      );
      expect(response.status).toBe(200);
    });

    it("answers the first refusal in the fixed order, and never parses a refused body", async () => {
      const { server } = setup({ password: true });
      const lan = await lanSession(server);
      const bad = "{ not json";
      const otherSite = await put(server, "serve-password", bad, {
        "content-type": "text/plain",
        "sec-fetch-site": "cross-site",
        ...lan,
      });
      expect(await otherSite.json()).toMatchObject({ code: "secret_from_other_site" });

      const name = await put(server, "serve-password", bad, {
        "content-type": "text/plain",
        "sec-fetch-site": "same-origin",
        ...lan,
      });
      expect(await name.json()).toMatchObject({ code: "secret_name_refused" });

      const type = await put(server, "openai-key", bad, {
        "content-type": "text/plain",
        "sec-fetch-site": "same-origin",
        ...lan,
      });
      expect(await type.json()).toMatchObject({ code: "json_required" });

      const connection = await put(server, "openai-key", bad, { ...jsonHeaders, ...lan });
      expect(await connection.json()).toMatchObject({ code: "secure_connection_required" });

      const body = await put(server, "openai-key", bad, {
        ...jsonHeaders,
        cookie: lan["cookie"] ?? "",
      });
      expect(await body.json()).toMatchObject({ code: "secret_not_accepted" });
    });

    it("answers an unknown verb 404, and sends no-store on every answer", async () => {
      const { server } = setup();
      const patch = await send(server, "PATCH", "/api/secrets/openai-key", {
        headers: jsonHeaders,
      });
      expect(patch.status).toBe(404);
      const answers = [
        patch,
        await send(server, "GET", "/api/secrets/openai-key"),
        await send(server, "GET", "/api/secrets/serve-password"),
        await put(server, "openai-key", valueBody("v")),
        await put(server, "openai-key", "{}"),
        await send(server, "DELETE", "/api/secrets/openai-key"),
      ];
      for (const response of answers) {
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    });
  });
});

describe("provider key no echo", () => {
  verifies("server.secrets-no-echo", () => {
    it("leaves a canary value and name out of every answer and log, even when the store throws", async () => {
      const failing: ProviderKeyStore = {
        has: async () => {
          throw new Error("store failed");
        },
        set: async () => {
          throw new Error("store failed");
        },
        remove: async () => {
          throw new Error("store failed");
        },
      };
      const { server, requestLog, errors } = setup({ keys: failing });
      const responses = [
        await put(server, canaryName, valueBody(canaryValue)),
        await send(server, "DELETE", `/api/secrets/${canaryName}`, { headers: jsonHeaders }),
        await send(server, "GET", `/api/secrets/${canaryName}`),
        await put(server, canaryName, `{ ${canaryValue}`),
      ];

      expect(responses.map((response) => response.status)).toEqual([500, 500, 500, 400]);
      const codes = await Promise.all(responses.map((response) => response.clone().json()));
      expect(codes[0]).toMatchObject({ code: "internal_error" });
      const said = [
        ...(await Promise.all(responses.map((response) => response.text()))),
        JSON.stringify(requestLog),
        ...errors.map((error) => `${String(error)} ${JSON.stringify(error)}`),
      ].join("\n");
      expect(said).not.toContain(canaryValue);
      expect(said).not.toContain(canaryName);
      expect(requestLog).toEqual([]);
      expect(errors).toHaveLength(3);
    });

    it("calls only has, set and remove on the store", async () => {
      const keys = new FakeKeys();
      const { server } = setup({ keys });
      await put(server, "openai-key", valueBody("v"));
      await send(server, "GET", "/api/secrets/openai-key");
      await send(server, "DELETE", "/api/secrets/openai-key");
      expect(keys.calls).toEqual(["set", "has", "remove"]);
    });
  });
});
