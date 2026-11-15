import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerAdmin } from "./admin.ts";
import { adminRoutesOf } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import { type ExportSource, secretShapeInBlob } from "./export-data.ts";

const host = "halonic.example.com";
const key = ["one", "job", "admin", "key", "for", "export", "tests"].join("-");
// Built from parts so no file holds a key-shaped value.
const keyShapedValue = ["sk", "ABCDEFGH12345678abcdefgh"].join("-");
const blob = new TextEncoder().encode("a blob");
const blobHash = "0".repeat(2) + "a".repeat(62);

async function sha256Hex(bytes: ArrayBuffer | ArrayBufferView): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function change(collection: string, value: string) {
  return {
    at: "2026-11-05T07:00:04.000Z",
    collection,
    id: "r1",
    op: "add" as const,
    values: { value },
  };
}

function event(runId: string, text: string) {
  return { runId, seq: 1, at: "2026-11-05T07:00:00.000Z", type: "note", text };
}

function sourceWith(runText = "hello", blobBytes: Uint8Array = blob): ExportSource {
  return {
    records: {
      collections: async () => ["_tokens", "leads"],
      changes: async (collection) => [change(collection, "x")],
    },
    runs: { list: async () => [{ id: "r-invoice" }, { id: "../escape" }] },
    runStore: { events: async (runId) => [event(runId, runText)] as never },
    blobs: { hashes: async () => [blobHash], get: async () => blobBytes },
  };
}

async function envWithKey(): Promise<RuntimeEnv> {
  return {
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "main",
    HALONIC_SECRET_ADMIN_KEY_HASH: await sha256Hex(new TextEncoder().encode(key)),
  } as unknown as RuntimeEnv;
}

async function get(path: string, source: ExportSource): Promise<Response> {
  const request = new Request(`https://${host}${path}`, {
    headers: { host, authorization: `Bearer ${key}` },
  });
  const answer = await answerAdmin(
    request,
    await envWithKey(),
    adminRoutesOf(async () => source),
  );
  if (answer === undefined) throw new Error("the route didn't answer");
  return answer;
}

verifies("runtime.export-data", () => {
  describe("the manifest", () => {
    it("lists the runs, the collections and the blobs in path order, without the token collection", async () => {
      const response = await get("/admin/export", sourceWith());
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const manifest = (await response.json()) as {
        deployment: string;
        files: { path: string }[];
      };
      expect(manifest.deployment).toBe("main");
      const paths = manifest.files.map((file) => file.path);
      expect(paths).toEqual([...paths].sort());
      expect(paths).toHaveLength(3);
      expect(paths[0]).toBe(`blobs/00/${blobHash}`);
      expect(paths[1]).toMatch(/^records\/[0-9a-f]{64}\.jsonl$/);
      expect(paths[2]).toBe("runs/r-invoice.jsonl");
    });

    it("gives each file the size and SHA-256 of the bytes its route answers", async () => {
      const source = sourceWith();
      const manifest = (await (await get("/admin/export", source)).json()) as {
        files: { path: string; bytes: number; sha256: string }[];
      };
      for (const entry of manifest.files) {
        const bytes = new Uint8Array(
          await (await get(`/admin/export/files/${entry.path}`, source)).arrayBuffer(),
        );
        expect(bytes.byteLength).toBe(entry.bytes);
        expect(await sha256Hex(bytes)).toBe(entry.sha256);
      }
    });
  });

  describe("a file", () => {
    it("answers 404 for a path the manifest doesn't list, the token collection's included", async () => {
      const tokens = await sha256Hex(
        new Uint8Array(new Uint16Array([..."_tokens"].map((c) => c.charCodeAt(0))).buffer),
      );
      for (const path of ["runs/nothing.jsonl", `records/${tokens}.jsonl`, "runs/%zz"]) {
        expect((await get(`/admin/export/files/${path}`, sourceWith())).status).toBe(404);
      }
    });
  });

  describe("a secret in a log", () => {
    it("stops the export and names the file and the kind, never the text", async () => {
      const source = sourceWith(`the key is ${keyShapedValue}`);
      for (const path of ["/admin/export", "/admin/export/files/runs/r-invoice.jsonl"]) {
        const response = await get(path, source);
        const text = await response.text();
        expect(response.status).toBe(409);
        expect(JSON.parse(text)).toMatchObject({
          code: "secret_found",
          path: "runs/r-invoice.jsonl",
          shape: "ai-provider-key",
        });
        expect(text).not.toContain(keyShapedValue);
      }
    });
    it("finds a key inside the args of a tool call", async () => {
      const source: ExportSource = {
        ...sourceWith(),
        runStore: {
          events: async (runId) =>
            [
              {
                runId,
                seq: 1,
                at: "2026-11-05T07:00:00.000Z",
                type: "tool.called",
                args: { headers: { authorization: keyShapedValue } },
              },
            ] as never,
        },
      };
      const response = await get("/admin/export", source);
      const text = await response.text();
      expect(response.status).toBe(409);
      expect(JSON.parse(text)).toMatchObject({
        code: "secret_found",
        path: "runs/r-invoice.jsonl",
        shape: "ai-provider-key",
      });
      expect(text).not.toContain(keyShapedValue);
    });

    it("stops the export for a text blob with a key, and leaves a binary blob unscanned", async () => {
      const textBlob = new TextEncoder().encode(`token=${keyShapedValue}`);
      const stopped = await get("/admin/export", sourceWith("hello", textBlob));
      const text = await stopped.text();
      expect(stopped.status).toBe(409);
      expect(JSON.parse(text)).toMatchObject({
        code: "secret_found",
        path: `blobs/00/${blobHash}`,
        shape: "ai-provider-key",
      });
      expect(text).not.toContain(keyShapedValue);

      // Not valid UTF-8, so it is bytes rather than text.
      const binary = new Uint8Array([0xff, 0xfe, ...new TextEncoder().encode(keyShapedValue)]);
      expect((await get("/admin/export", sourceWith("hello", binary))).status).toBe(200);
    });

    it("finds a key that straddles the boundary between two scanned chunks of a large blob", async () => {
      const chunkBytes = 1024 * 1024;
      const key = new TextEncoder().encode(keyShapedValue);
      const blobBytes = new Uint8Array(chunkBytes * 2).fill(" ".charCodeAt(0));
      blobBytes.set(key, chunkBytes - 8);
      const stopped = await get("/admin/export", sourceWith("hello", blobBytes));
      expect(stopped.status).toBe(409);
      expect(await stopped.text()).not.toContain(keyShapedValue);
    });

    it("leaves a large blob unscanned when it turns out to be binary after a key", async () => {
      const chunkBytes = 1024 * 1024;
      const key = new TextEncoder().encode(keyShapedValue);
      const blobBytes = new Uint8Array(chunkBytes * 2).fill(" ".charCodeAt(0));
      blobBytes.set(key, 100);
      blobBytes[chunkBytes + 5] = 0xff;
      expect((await get("/admin/export", sourceWith("hello", blobBytes))).status).toBe(200);
    });

    describe("a text blob scanned in chunks", () => {
      const encode = (text: string) => new TextEncoder().encode(text);

      it("finds a key that spans a chunk boundary, at every offset", () => {
        const chunkBytes = 64;
        for (let offset = 0; offset <= keyShapedValue.length; offset += 1) {
          const bytes = encode(`${" ".repeat(chunkBytes - offset)}${keyShapedValue} end`);
          expect(secretShapeInBlob(bytes, chunkBytes), `offset ${offset}`).toBe("ai-provider-key");
        }
      });

      it("scans a blob of long key-shaped runs in time that follows its size", () => {
        // base64url data has no spaces: every chunk ends inside a long run.
        const bytes = encode("a".repeat(8 * 1024 * 1024));
        const started = performance.now();
        expect(secretShapeInBlob(bytes)).toBeUndefined();
        expect(performance.now() - started).toBeLessThan(2000);
      });

      it("finds a key whose body is longer than a chunk", () => {
        const body = "a".repeat(200);
        expect(secretShapeInBlob(encode(`x ${keyShapedValue}${body}`), 16)).toBe("ai-provider-key");
      });

      it("does not count a word that ends a chunk and continues a longer one", () => {
        expect(secretShapeInBlob(encode(`task-${keyShapedValue} end`), 8)).toBeUndefined();
      });

      it("decodes a character split by a chunk boundary", () => {
        const bytes = encode(`\u00e9\u4e16 ${keyShapedValue}`);
        for (let chunkBytes = 1; chunkBytes < 8; chunkBytes += 1) {
          expect(secretShapeInBlob(bytes, chunkBytes), `chunk ${chunkBytes}`).toBe(
            "ai-provider-key",
          );
        }
      });

      it("leaves a blob unscanned when bytes that aren't UTF-8 follow a key", () => {
        const keyFirst = new Uint8Array([...encode(keyShapedValue), 0xff, 0xfe]);
        expect(secretShapeInBlob(keyFirst, 8)).toBeUndefined();
      });
    });
  });
});
