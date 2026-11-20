import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { eventually } from "./eventually.ts";
import { readAsNode, roundTrip, type WorkerTarget, workerChecks } from "./transfer-checks.ts";

const example = fileURLToPath(
  new URL("../../../core/format/src/runtime-export/fixtures/example", import.meta.url),
);
const key = "Kq3-this-key-was-made-up-for-the-test";
const base = "https://hlt-1-1.example.workers.dev";
const neutral = () => Response.json({ code: "not_found" }, { status: 404 });
/** Cloudflare's own page for a workers.dev address an edge server doesn't route yet. */
const edgeNotFound = () =>
  new Response("<html>Page not found</html>", {
    status: 404,
    headers: { "content-type": "text/html" },
  });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

interface Behavior {
  /** No admin key is set: every `/admin` path is a 404. */
  readonly closed?: boolean;
  /** Takes the key from the URL as well, which a Worker must not. */
  readonly keyInUrl?: boolean;
  /** Takes the SHA-256 of the key as the key, as a Worker that compared the stored value would. */
  readonly hashAsKey?: boolean;
  /** Corrupts one file in the export. */
  readonly corrupt?: boolean;
  /** Answers /health with this. */
  readonly health?: number;
}

type Held = { path: string; bytes: Uint8Array }[];

/** The two export routes over what the Worker holds. */
function exportAnswer(behavior: Behavior, held: Held, pathname: string): Response {
  const files = [...held].sort((a, b) => (a.path < b.path ? -1 : 1));
  if (pathname === "/admin/export") {
    return Response.json({
      formatVersion: 1,
      deployment: "hlt-1-1",
      exportedAt: "2026-11-15T10:00:00.000Z",
      files: files.map((f) => ({ path: f.path, bytes: f.bytes.byteLength, sha256: sha(f.bytes) })),
    });
  }
  const wanted = files.find((f) => `/admin/export/files/${f.path}` === pathname);
  if (!wanted) return neutral();
  const bytes =
    behavior.corrupt && wanted.path.startsWith("records/")
      ? new TextEncoder().encode("{}\n")
      : wanted.bytes;
  return new Response(bytes);
}

/** Whether the request carries the key as the Worker accepts it: a Bearer header, no Origin. */
function keyGiven(behavior: Behavior, url: URL, headers: Headers): boolean {
  const given =
    headers.get("authorization") === `Bearer ${key}` ||
    (behavior.keyInUrl === true && url.searchParams.get("key") === key);
  const hash = createHash("sha256").update(key).digest("hex");
  const hashGiven =
    behavior.hashAsKey === true && headers.get("authorization") === `Bearer ${hash}`;
  return (given || hashGiven) && !headers.has("origin");
}

/** A Worker in memory with the admin routes of the README's contract. */
function fakeWorker(behavior: Behavior = {}): {
  target: WorkerTarget;
  staged: Map<string, Uint8Array>;
} {
  const staged = new Map<string, Uint8Array>();
  let held: Held = [];
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    if (url.pathname === "/health") return new Response("ok", { status: behavior.health ?? 200 });
    if (!url.pathname.startsWith("/admin/") || behavior.closed) return neutral();
    if (headers.has("origin")) return Response.json({ code: "not_found" }, { status: 404 });
    if (!keyGiven(behavior, url, headers)) {
      return Response.json({ code: "unauthorized" }, { status: 401 });
    }
    if (method === "PUT") {
      staged.set(
        url.pathname.replace("/admin/import/files/", ""),
        new Uint8Array(init?.body as ArrayBuffer),
      );
      return new Response(null, { status: 204 });
    }
    if (method === "POST") {
      held = [...staged].map(([path, bytes]) => ({ path, bytes }));
      return Response.json({ imported: { runs: 1, records: 1, blobs: 1 } });
    }
    return exportAnswer(behavior, held, url.pathname);
  };
  return { target: { baseUrl: base, fetch: send }, staged };
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

  describe("the smoke check", () => {
    it("passes on 200 and fails with the status otherwise", async () => {
      await expect(workerChecks.smoke(fakeWorker().target)).resolves.toBeUndefined();
      await expect(workerChecks.smoke(fakeWorker({ health: 503 }).target)).rejects.toThrow(
        /answered 503, expected 200/,
      );
    });
  });

  describe("the closed check", () => {
    it("passes when /admin is the neutral 404, with or without a key", async () => {
      await expect(
        workerChecks.adminClosed(fakeWorker({ closed: true }).target, key),
      ).resolves.toBeUndefined();
    });
    it("asks again while an edge server answers the new address with its HTML not-found page", async () => {
      const inner = fakeWorker({ closed: true }).target;
      let calls = 0;
      const waits: number[] = [];
      const target: WorkerTarget = {
        baseUrl: base,
        // Every third request lands on an edge server that doesn't route the address yet.
        fetch: async (input, init) =>
          ++calls % 3 === 0 ? edgeNotFound() : (inner.fetch as typeof fetch)(input, init),
        sleep: async (ms) => void waits.push(ms),
      };
      await expect(workerChecks.adminClosed(target, key)).resolves.toBeUndefined();
      expect(waits.length).toBeGreaterThan(0);
    });
    it("gives up on the edge's not-found page after 8 tries", async () => {
      let calls = 0;
      const target: WorkerTarget = {
        baseUrl: base,
        fetch: async () => {
          calls++;
          return edgeNotFound();
        },
        sleep: async () => undefined,
      };
      await expect(workerChecks.smoke(target)).rejects.toThrow(/answered 404, expected 200/);
      expect(calls).toBe(8);
    });
    it("fails when /admin answers anything else", async () => {
      await expect(workerChecks.adminClosed(fakeWorker().target, key)).rejects.toThrow(/401/);
    });
    it("fails when only an import route is left open while no key is set", async () => {
      const inner = fakeWorker({ closed: true }).target;
      const leaky: WorkerTarget = {
        baseUrl: base,
        fetch: async (input, init) =>
          init?.method === "POST" && new URL(String(input)).pathname === "/admin/import"
            ? Response.json({ imported: {} })
            : (inner.fetch as typeof fetch)(input, init),
      };
      await expect(workerChecks.adminClosed(leaky, key)).rejects.toThrow(/POST \/admin\/import/);
    });
  });

  describe("waiting for the key to take effect", () => {
    it("retries while /admin is still the closed 404, then passes on three 401s in a row", async () => {
      const open = fakeWorker().target;
      let calls = 0;
      const slow: WorkerTarget = {
        baseUrl: base,
        fetch: async (input, init) =>
          ++calls <= 2 ? neutral() : (open.fetch?.(input, init) ?? neutral()),
      };
      const waits: number[] = [];
      await eventually(() => workerChecks.adminKeyActive(slow), {
        sleep: async (ms) => void waits.push(ms),
      });
      expect(waits).toEqual([5_000, 5_000, 5_000, 5_000]);
    });
    it("gives up with the last error after the given tries", async () => {
      let waited = 0;
      await expect(
        eventually(() => workerChecks.adminKeyActive(fakeWorker({ closed: true }).target), {
          attempts: 3,
          sleep: async () => void waited++,
        }),
      ).rejects.toThrow(/answered 404 not_found, expected 401/);
      expect(waited).toBe(2);
    });
  });

  describe("the bad-key checks", () => {
    it("pass when no key, a wrong key, a key in the URL and an Origin are refused", async () => {
      await expect(
        workerChecks.adminRefusesBadKeys(fakeWorker().target, key),
      ).resolves.toBeUndefined();
    });
    it("fail when the key in the URL is taken, naming no key", async () => {
      const error = await workerChecks
        .adminRefusesBadKeys(fakeWorker({ keyInUrl: true }).target, key)
        .catch((e: Error) => e);
      expect((error as Error).message).toMatch(/key in the URL was answered 200/);
      expect((error as Error).message).not.toContain(key);
    });
    it("fail when the stored hash is taken as the key", async () => {
      await expect(
        workerChecks.adminRefusesBadKeys(fakeWorker({ hashAsKey: true }).target, key),
      ).rejects.toThrow(/stored hash as the key was answered 200/);
    });
    it("fail when one of the four routes doesn't refuse, naming the route", async () => {
      const { target } = fakeWorker();
      const open: WorkerTarget = {
        baseUrl: base,
        fetch: async (input, init) =>
          init?.method === "POST"
            ? new Response("{}", { status: 200 })
            : (target.fetch ?? fetch)(input, init),
      };
      await expect(workerChecks.adminRefusesBadKeys(open, key)).rejects.toThrow(
        /POST \/admin\/import without a key was answered 200/,
      );
    });
    it("fail on a 200 for an Origin and accept a 403", async () => {
      const { target } = fakeWorker();
      const forbid: WorkerTarget = {
        baseUrl: base,
        fetch: async (input, init) =>
          new Headers(init?.headers).has("origin")
            ? new Response("{}", { status: 403 })
            : (target.fetch ?? fetch)(input, init),
      };
      await expect(workerChecks.adminRefusesBadKeys(forbid, key)).resolves.toBeUndefined();
    });
    it("refuse a Worker address that isn't HTTPS and never follow a redirect", async () => {
      const { target } = fakeWorker();
      await expect(
        workerChecks.adminRefusesBadKeys({ ...target, baseUrl: "http://hlt.example" }, key),
      ).rejects.toThrow(/not HTTPS/);
      let redirect: RequestInit["redirect"];
      await workerChecks.smoke({
        baseUrl: base,
        fetch: async (_input, init) => {
          redirect = init?.redirect;
          return new Response("ok");
        },
      });
      expect(redirect).toBe("error");
    });
    it("fail when a request with an Origin gets 200", async () => {
      const { target } = fakeWorker();
      const lax: WorkerTarget = {
        baseUrl: base,
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          if (headers.has("origin")) return new Response("{}", { status: 200 });
          return target.fetch?.(input, init) ?? neutral();
        },
      };
      await expect(workerChecks.adminRefusesBadKeys(lax, key)).rejects.toThrow(/Origin/);
    });
  });

  describe("the round trip", () => {
    it("puts the example in, gets it back byte for byte and reads it as Node would", async () => {
      const { target } = fakeWorker();
      const result = await roundTrip({
        baseUrl: base,
        key,
        source: example,
        work: await fresh(),
        ...(target.fetch ? { fetch: target.fetch } : {}),
      });
      expect(result).toEqual({ files: 3, runs: 1, records: 1, blobs: 1 });
    });
    it("names the file that came back different, never its content", async () => {
      const { target } = fakeWorker({ corrupt: true });
      const error = await roundTrip({
        baseUrl: base,
        key,
        source: example,
        work: await fresh(),
        ...(target.fetch ? { fetch: target.fetch } : {}),
      }).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/records\//);
    });
  });

  describe("reading as Node", () => {
    it("reads the example export", async () => {
      await expect(readAsNode(example)).resolves.toEqual({
        files: 3,
        runs: 1,
        records: 1,
        blobs: 1,
      });
    });
    it("refuses a file the manifest doesn't list and a file that was changed", async () => {
      const extra = await fresh();
      await cp(example, extra, { recursive: true });
      await writeFile(join(extra, "stray.txt"), "x");
      await expect(readAsNode(extra)).rejects.toThrow(/stray\.txt/);

      const changed = await fresh();
      await cp(example, changed, { recursive: true });
      const runs = join(changed, "runs");
      const [name = ""] = await readdir(runs);
      await writeFile(join(runs, name), `${await readFile(join(runs, name), "utf8")}\n`);
      await expect(readAsNode(changed)).rejects.toThrow(/runs\/.*not what the manifest says/);
    });
  });
});
