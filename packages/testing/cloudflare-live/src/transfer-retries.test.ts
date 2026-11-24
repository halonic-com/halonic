import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { roundTrip, workerChecks } from "./transfer-checks.ts";
import type { WorkerTarget } from "./worker-call.ts";

// HAL-17705: the edge's hiccups the transfer checks ask again about, and the answers they don't.
const example = fileURLToPath(
  new URL("../../../core/format/src/runtime-export/fixtures/example", import.meta.url),
);
const key = "Kq3-this-key-was-made-up-for-the-test";
const base = "https://hlt-1-1.example.workers.dev";
const neutral = () => Response.json({ code: "not_found" }, { status: 404 });
const edge500 = () => new Response("<html>Error 1101</html>", { status: 500 });

/** A Worker whose admin key is set and that holds what was imported: just enough for a round trip. */
function keyedWorker(): typeof fetch {
  const staged = new Map<string, Uint8Array>();
  let held = new Map<string, Uint8Array>();
  return async (input, init) => {
    const url = new URL(String(input));
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${key}`) {
      return Response.json({ code: "unauthorized" }, { status: 401 });
    }
    if (init?.method === "PUT") {
      staged.set(
        url.pathname.replace("/admin/import/files/", ""),
        new Uint8Array(init.body as ArrayBuffer),
      );
      return new Response(null, { status: 204 });
    }
    if (init?.method === "POST") {
      held = new Map(staged);
      return Response.json({ imported: { runs: 1, records: 1, blobs: 1 } });
    }
    if (url.pathname === "/admin/export") {
      return Response.json({
        formatVersion: 1,
        deployment: "hlt-1-1",
        exportedAt: "2026-11-24T17:00:00.000Z",
        files: [...held]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([path, bytes]) => ({
            path,
            bytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          })),
      });
    }
    const bytes = held.get(url.pathname.replace("/admin/export/files/", ""));
    return bytes ? new Response(bytes) : neutral();
  };
}

verifies("cloudflare-live.transfer", () => {
  const folders: string[] = [];
  async function fresh(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "hlt-test-"));
    folders.push(folder);
    return folder;
  }
  afterAll(async () => {
    await Promise.all(folders.map((f) => rm(f, { recursive: true, force: true })));
  });

  describe("the closed check on an edge hiccup", () => {
    it("asks again when the unknown path's answer was a 500 from the edge, then passes", async () => {
      let baselines = 0;
      const waits: number[] = [];
      const target: WorkerTarget = {
        baseUrl: base,
        // The second unknown-path call gets the edge's 500; every other call the Worker's 404.
        fetch: async (input) =>
          new URL(String(input)).pathname === "/no-such-path" && ++baselines === 2
            ? edge500()
            : neutral(),
        sleep: async (ms) => void waits.push(ms),
      };
      await expect(workerChecks.adminClosed(target, key)).resolves.toBeUndefined();
      expect(waits).toEqual([5_000]);
    });
    it("asks again when an admin route's answer was a 500, and names it when that lasts", async () => {
      let calls = 0;
      const target: WorkerTarget = {
        baseUrl: base,
        fetch: async (input) => {
          calls++;
          return new URL(String(input)).pathname === "/admin/export" ? edge500() : neutral();
        },
        sleep: async () => undefined,
      };
      await expect(workerChecks.adminClosed(target, key)).rejects.toThrow(
        /GET \/admin\/export without a key was answered 500 Cloudflare error 1101, expected 404/,
      );
      expect(calls).toBe(8);
    });
    it("fails at once when an admin route answers 401 where an unknown path answers 404", async () => {
      let calls = 0;
      const waits: number[] = [];
      const target: WorkerTarget = {
        baseUrl: base,
        fetch: async (input) => {
          calls++;
          return new URL(String(input)).pathname === "/no-such-path"
            ? neutral()
            : Response.json({ code: "unauthorized" }, { status: 401 });
        },
        sleep: async (ms) => void waits.push(ms),
      };
      await expect(workerChecks.adminClosed(target, key)).rejects.toThrow(
        /GET \/admin\/export without a key was answered 401 unauthorized, expected 404/,
      );
      expect(calls).toBe(2);
      expect(waits).toEqual([]);
    });
  });

  describe("the round trip on an older Worker version", () => {
    it("starts again after one 404 from a version without the key, then passes", async () => {
      const worker = keyedWorker();
      let posts = 0;
      const waits: number[] = [];
      const result = await roundTrip({
        baseUrl: base,
        key,
        source: example,
        work: await fresh(),
        // The first import's POST reaches an older version, which has no admin routes yet.
        fetch: async (input, init) =>
          init?.method === "POST" && ++posts === 1
            ? new Response(null, { status: 404 })
            : worker(input, init),
        sleep: async (ms) => void waits.push(ms),
      });
      expect(result).toEqual({ files: 3, runs: 1, records: 1, blobs: 1 });
      expect(waits).toEqual([5_000]);
      expect(posts).toBe(3);
    });
    it("fails at once on a 401, naming no key", async () => {
      let calls = 0;
      const waits: number[] = [];
      const error = await roundTrip({
        baseUrl: base,
        key,
        source: example,
        work: await fresh(),
        fetch: async () => {
          calls++;
          return Response.json({ code: "unauthorized" }, { status: 401 });
        },
        sleep: async (ms) => void waits.push(ms),
      }).catch((caught: unknown) => caught);
      expect(String(error)).toMatch(/The Worker answered 401, unauthorized/);
      expect(String(error)).not.toContain(key);
      expect(calls).toBe(1);
      expect(waits).toEqual([]);
    });
    it("gives up with the 404 after 4 tries", async () => {
      let posts = 0;
      const worker = keyedWorker();
      await expect(
        roundTrip({
          baseUrl: base,
          key,
          source: example,
          work: await fresh(),
          fetch: async (input, init) => {
            if (init?.method !== "POST") return worker(input, init);
            posts++;
            return neutral();
          },
          sleep: async () => undefined,
        }),
      ).rejects.toThrow(/The Worker answered 404, not_found/);
      expect(posts).toBe(4);
    });
  });
});
