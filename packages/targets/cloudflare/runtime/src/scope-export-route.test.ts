import { type Scope, scopeName } from "@halonicjs/host-server";
import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerAdmin } from "./admin.ts";
import { adminRoutesOf } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import type { ExportSource } from "./export-data.ts";

const host = "halonic.example.com";
const key = ["one", "job", "admin", "key", "for", "scope", "tests"].join("-");
const personal = "u/eu_acme0123456789abcdef";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

/** A source with one run, named after the scope it was opened for, and the scopes asked for. */
function opener() {
  const opened: (string | undefined)[] = [];
  const open = async (_env: RuntimeEnv, scope?: Scope): Promise<ExportSource> => {
    const name = scope === undefined ? undefined : scopeName(scope);
    opened.push(name);
    const runId = name === undefined ? "r-deployment" : "r-scope";
    return {
      records: { collections: async () => [], changes: async () => [] },
      runs: { list: async () => [{ id: runId }] },
      runStore: { events: async () => [] },
      blobs: { hashes: async () => [], get: async () => null },
    };
  };
  return { opened, open };
}

async function get(path: string, open: ReturnType<typeof opener>["open"]): Promise<Response> {
  const env = {
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "main",
    HALONIC_SECRET_ADMIN_KEY_HASH: await sha256Hex(key),
  } as unknown as RuntimeEnv;
  const request = new Request(`https://${host}${path}`, {
    headers: { host, authorization: `Bearer ${key}` },
  });
  const answer = await answerAdmin(request, env, adminRoutesOf(open));
  if (answer === undefined) throw new Error("the route didn't answer");
  return answer;
}

verifies("runtime.scope-export", () => {
  describe("the admin export's scope", () => {
    it("exports the named scope's stores, and the deployment's without a scope", async () => {
      const { opened, open } = opener();
      const scoped = (await (await get(`/admin/export?scope=${personal}`, open)).json()) as {
        files: { path: string }[];
      };
      expect(scoped.files.map((file) => file.path)).toEqual(["runs/r-scope.jsonl"]);
      const file = await get(`/admin/export/files/runs/r-scope.jsonl?scope=${personal}`, open);
      expect(file.status).toBe(200);
      expect(file.headers.get("cache-control")).toBe("no-store");
      expect((await get("/admin/export", open)).status).toBe(200);
      expect(opened).toEqual([personal, personal, undefined]);
    });

    it("answers 400 for a scope that isn't u/<id> or o/<id>, and opens nothing", async () => {
      const { opened, open } = opener();
      const refused = [`${personal}/`, "x/eu_acme0123456789abcdef", "", "u/%2E%2E"];
      for (const scope of refused) {
        const query = `?scope=${encodeURIComponent(scope)}`;
        for (const path of ["/admin/export", "/admin/export/files/runs/r-scope.jsonl"]) {
          const response = await get(`${path}${query}`, open);
          expect(response.status).toBe(400);
          expect(await response.json()).toMatchObject({ code: "bad_scope" });
        }
      }
      expect(opened).toEqual([]);
    });
  });
});
