import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerAdmin } from "./admin.ts";
import { adminRoutesOf } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import { ExportSecretError, type ExportSource, refuseSecretsInBlob } from "./export-data.ts";

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

    describe("a text blob scanned in chunks", () => {
      const encode = (text: string) => new TextEncoder().encode(text);
      const scan = (bytes: Uint8Array, chunkBytes?: number) =>
        refuseSecretsInBlob("blobs/00/x", bytes, chunkBytes);

      it("finds a key that spans a chunk boundary, at every offset", () => {
        const chunkBytes = 64;
        for (let offset = 0; offset <= keyShapedValue.length; offset += 1) {
          const bytes = encode(`${" ".repeat(chunkBytes - offset)}${keyShapedValue} end`);
          expect(() => scan(bytes, chunkBytes), `offset ${offset}`).toThrow(ExportSecretError);
        }
      });

      it("scans a blob of long key-shaped runs in time that follows its size", () => {
        // base64url data has no spaces: every chunk ends inside a long run.
        const bytes = encode("a".repeat(8 * 1024 * 1024));
        const started = performance.now();
        scan(bytes);
        expect(performance.now() - started).toBeLessThan(2000);
      });

      it("finds a key that spans the default chunk boundary of a large blob", () => {
        const oneMiB = 1024 * 1024;
        const before = "a ".repeat(oneMiB / 2 - 5);
        expect(() => scan(encode(`${before}${keyShapedValue} end`))).toThrow(ExportSecretError);
      });

      it("finds a key whose body is longer than a chunk", () => {
        const body = "a".repeat(200);
        expect(() => scan(encode(`x ${keyShapedValue}${body}`), 16)).toThrow(ExportSecretError);
      });

      it("does not count a word that ends a chunk and continues a longer one", () => {
        expect(() => scan(encode(`task-${keyShapedValue} end`), 8)).not.toThrow();
      });

      it("decodes a character split by a chunk boundary", () => {
        const bytes = encode(`\u00e9\u4e16 ${keyShapedValue}`);
        for (let chunkBytes = 1; chunkBytes < 8; chunkBytes += 1) {
          expect(() => scan(bytes, chunkBytes)).toThrow(ExportSecretError);
        }
      });

      it("stops at the first chunk that isn't UTF-8, keeping what it already scanned", () => {
        const binary = new Uint8Array([0xff, 0xfe]);
        const keyFirst = new Uint8Array([...encode(keyShapedValue), ...binary]);
        expect(() => scan(keyFirst, 8)).toThrow(ExportSecretError);
        const binaryFirst = new Uint8Array([...binary, ...encode(keyShapedValue)]);
        expect(() => scan(binaryFirst, 8)).not.toThrow();
      });
    });
  });
});
