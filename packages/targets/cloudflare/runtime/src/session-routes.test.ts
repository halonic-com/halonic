import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerAdmin } from "./admin.ts";
import { adminRoutesOf } from "./admin-routes.ts";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import type { OpenSessions } from "./session-routes.ts";

const host = "halonic.example.com";
const key = ["one", "job", "admin", "key", "for", "this", "test"].join("-");
const path = "/admin/sessions/revoke";

async function envWithKey(): Promise<RuntimeEnv> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return {
    HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
    HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "main",
    HALONIC_SECRET_ADMIN_KEY_HASH: bytesToHex(new Uint8Array(digest)),
  } as unknown as RuntimeEnv;
}

function call(headers: Record<string, string>, method = "POST") {
  return new Request(`https://${host}${path}`, { method, headers: { host, ...headers } });
}

/** Admin routes whose sign-in only counts its revokes. */
function counting(open?: OpenSessions) {
  const revokes = { count: 0 };
  const opened: OpenSessions =
    open ??
    (async () => ({
      revokeAllSessions: async () => {
        revokes.count += 1;
      },
    }));
  const unused = async () => {
    throw new Error("only the session route may run");
  };
  return { revokes, routes: adminRoutesOf(unused, unused, opened) };
}

verifies("runtime.session-revoke", () => {
  describe("POST /admin/sessions/revoke", () => {
    it("ends every session with the right key and answers 204 with no body", async () => {
      const { revokes, routes } = counting();
      const response = await answerAdmin(
        call({ authorization: `Bearer ${key}` }),
        await envWithKey(),
        routes,
      );
      expect(response?.status).toBe(204);
      expect(response?.headers.get("cache-control")).toBe("no-store");
      expect(await response?.text()).toBe("");
      expect(revokes.count).toBe(1);
    });

    it.each([
      ["no key", {}],
      ["a wrong key", { authorization: "Bearer not-the-key" }],
    ])("refuses %s with 401 and ends no session", async (_name, headers) => {
      const { revokes, routes } = counting();
      const response = await answerAdmin(call(headers), await envWithKey(), routes);
      expect(response?.status).toBe(401);
      expect(revokes.count).toBe(0);
    });

    it("answers another method with the admin routes' 404", async () => {
      const { revokes, routes } = counting();
      const response = await answerAdmin(
        call({ authorization: `Bearer ${key}` }, "GET"),
        await envWithKey(),
        routes,
      );
      expect(response?.status).toBe(404);
      expect(revokes.count).toBe(0);
    });

    it("answers 503 on a deployment that isn't fully configured", async () => {
      const { routes } = counting(async () => {
        throw new ConfigurationError(["COORDINATION"]);
      });
      const response = await answerAdmin(
        call({ authorization: `Bearer ${key}` }),
        await envWithKey(),
        routes,
      );
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({
        code: "unavailable",
        message: "The server isn't ready.",
      });
    });
  });
});
