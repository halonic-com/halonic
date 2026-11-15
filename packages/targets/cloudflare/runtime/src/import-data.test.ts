import type { RecordChange, RunStore } from "@halonicjs/ports";
import { formatLogLines, formatRecordLines } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerAdmin } from "./admin.ts";
import type { ImportDeps } from "./admin-routes.ts";
import { adminRoutesOf } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import { recordFileName, sha256Hex } from "./export-data.ts";

const host = "halonic.example.com";
const key = ["one", "job", "admin", "key", "for", "import", "tests"].join("-");
const encoder = new TextEncoder();

type RunEvent = Awaited<ReturnType<RunStore["events"]>>[number];

const blobBytes = encoder.encode("a blob");

function change(collection: string, id = "r1"): RecordChange {
  return { at: "2026-11-05T07:00:04.000Z", collection, id, op: "add", values: { value: "x" } };
}

function event(runId: string): RunEvent {
  return { runId, seq: 1, at: "2026-11-05T07:00:00.000Z", type: "note", text: "hi" } as never;
}

/** Stores that keep what they are given, as the adapters do. */
function memoryDeps() {
  const records = new Map<string, RecordChange[]>();
  const runs = new Map<string, RunEvent[]>();
  const blobs = new Map<string, Uint8Array>();
  const staged = new Map<string, Uint8Array>();
  const deps: ImportDeps = {
    target: {
      records: {
        changes: async (collection) => records.get(collection) ?? [],
        append: async (changes) => {
          for (const one of changes) {
            records.set(one.collection, [...(records.get(one.collection) ?? []), one]);
          }
        },
      },
      runStore: {
        events: async (runId) => runs.get(runId) ?? [],
        append: async (runId, expectedSeq, events) => {
          const had = runs.get(runId) ?? [];
          if (had.length !== expectedSeq)
            return { ok: false, reason: "conflict", lastSeq: had.length };
          runs.set(runId, [...had, ...events]);
          return { ok: true, lastSeq: had.length + events.length };
        },
      },
      blobs: {
        get: async (hash) => blobs.get(hash) ?? null,
        put: async (data, mediaType) => {
          const hash = await sha256Hex(data);
          blobs.set(hash, data);
          return { hash, size: data.byteLength, mediaType };
        },
      },
    },
    staging: {
      put: async (path, bytes) => void staged.set(path, bytes),
      get: async (path) => staged.get(path) ?? null,
      delete: async (path) => void staged.delete(path),
    },
  };
  return { deps, records, runs, blobs, staged };
}

async function envWithKey(): Promise<RuntimeEnv> {
  return {
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "main",
    HALONIC_SECRET_ADMIN_KEY_HASH: await sha256Hex(encoder.encode(key)),
  } as unknown as RuntimeEnv;
}

async function send(
  method: "PUT" | "POST",
  path: string,
  body: BodyInit,
  deps: ImportDeps,
): Promise<Response> {
  const request = new Request(`https://${host}${path}`, {
    method,
    body,
    headers: { host, authorization: `Bearer ${key}` },
  });
  const answer = await answerAdmin(
    request,
    await envWithKey(),
    adminRoutesOf(undefined, async () => deps),
  );
  if (answer === undefined) throw new Error("the route didn't answer");
  return answer;
}

interface Entry {
  path: string;
  bytes: Uint8Array;
}

async function manifestOf(entries: Entry[], tweak?: (path: string) => number) {
  const files = await Promise.all(
    entries.map(async ({ path, bytes }) => ({
      path,
      bytes: bytes.byteLength + (tweak?.(path) ?? 0),
      sha256: await sha256Hex(bytes),
    })),
  );
  return {
    formatVersion: 1,
    deployment: "main",
    exportedAt: "2026-11-15T01:00:00.000Z",
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}

async function entries(collection = "leads"): Promise<Entry[]> {
  const blobHash = await sha256Hex(blobBytes);
  return [
    { path: "runs/r-invoice.jsonl", bytes: encoder.encode(formatLogLines([event("r-invoice")])) },
    {
      path: await recordFileName(collection),
      bytes: encoder.encode(formatRecordLines([change(collection)])),
    },
    { path: `blobs/${blobHash.slice(0, 2)}/${blobHash}`, bytes: blobBytes },
  ];
}

async function stageAll(files: Entry[], deps: ImportDeps): Promise<void> {
  for (const { path, bytes } of files) {
    const answer = await send("PUT", `/admin/import/files/${path}`, bytes, deps);
    expect(answer.status).toBe(204);
  }
}

async function apply(files: Entry[], deps: ImportDeps, tweak?: (path: string) => number) {
  const response = await send(
    "POST",
    "/admin/import",
    JSON.stringify(await manifestOf(files, tweak)),
    deps,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

verifies("runtime.import-data", () => {
  describe("staging a file", () => {
    it("answers 204 for a path of the layout and keeps the bytes", async () => {
      const { deps, staged } = memoryDeps();
      const [run] = await entries();
      await stageAll([run as Entry], deps);
      expect(staged.get("runs/r-invoice.jsonl")).toEqual((run as Entry).bytes);
    });

    it("answers 400 for a path outside the layout and 413 for a body over the limit", async () => {
      const { deps, staged } = memoryDeps();
      for (const path of ["runs/../escape.jsonl", "other/file", "blobs/ab/short", "runs/%zz"]) {
        const response = await send("PUT", `/admin/import/files/${path}`, "x", deps);
        expect(response.status, path).toBe(400);
      }
      const big = new Request(`https://${host}/admin/import/files/runs/r1.jsonl`, {
        method: "PUT",
        body: "x",
        headers: {
          host,
          authorization: `Bearer ${key}`,
          "content-length": String(60 * 1024 * 1024),
        },
      });
      const answer = await answerAdmin(
        big,
        await envWithKey(),
        adminRoutesOf(undefined, async () => deps),
      );
      expect(answer?.status).toBe(413);
      expect(staged.size).toBe(0);
    });
  });

  describe("applying the staged files", () => {
    it("stores the run, the collection and the blob and answers the counts", async () => {
      const { deps, records, runs, blobs, staged } = memoryDeps();
      const files = await entries();
      await stageAll(files, deps);
      const { status, body } = await apply(files, deps);
      expect(status).toBe(200);
      expect(body).toEqual({ imported: { runs: 1, records: 1, blobs: 1 } });
      expect(runs.get("r-invoice")).toHaveLength(1);
      expect(records.get("leads")).toHaveLength(1);
      expect(blobs.size).toBe(1);
      expect(staged.size).toBe(0);
    });

    it("can be sent again after a full success without writing twice", async () => {
      const { deps, records, runs } = memoryDeps();
      const files = await entries();
      await stageAll(files, deps);
      await apply(files, deps);
      await stageAll(files, deps);
      const again = await apply(files, deps);
      expect(again.status).toBe(200);
      expect(runs.get("r-invoice")).toHaveLength(1);
      expect(records.get("leads")).toHaveLength(1);
    });

    it("answers 409 files_missing and applies nothing when a listed file isn't staged", async () => {
      const { deps, runs, records, blobs } = memoryDeps();
      const files = await entries();
      await stageAll(files.slice(0, 2), deps);
      const { status, body } = await apply(files, deps);
      expect(status).toBe(409);
      expect(body).toMatchObject({ code: "files_missing", paths: [files[2]?.path] });
      expect([runs.size, records.size, blobs.size]).toEqual([0, 0, 0]);
    });

    it("answers 409 files_differ and applies nothing when a size or hash isn't the manifest's", async () => {
      const { deps, runs, records, blobs } = memoryDeps();
      const files = await entries();
      await stageAll(files, deps);
      const sizeOff = await apply(files, deps, (path) => (path.startsWith("blobs/") ? 1 : 0));
      expect(sizeOff.status).toBe(409);
      expect(sizeOff.body).toMatchObject({ code: "files_differ", paths: [files[2]?.path] });
      const run = files[0] as Entry;
      await send("PUT", `/admin/import/files/${run.path}`, encoder.encode("{}\n"), deps);
      const hashOff = await apply(files, deps);
      expect(hashOff.body).toMatchObject({ code: "files_differ", paths: [run.path] });
      expect([runs.size, records.size, blobs.size]).toEqual([0, 0, 0]);
    });

    it("answers 400 for a body that isn't a manifest", async () => {
      const { deps } = memoryDeps();
      for (const body of ["not json", JSON.stringify({ files: [] })]) {
        expect((await send("POST", "/admin/import", body, deps)).status).toBe(400);
      }
    });
  });

  describe("a file the deployment can't take", () => {
    it("refuses the sign-in tokens' collection and a record log under another collection's name", async () => {
      for (const [name, collection] of [
        ["tokens", "_tokens"],
        ["renamed", "leads"],
      ] as const) {
        const { deps, records } = memoryDeps();
        const files = (await entries(collection)).filter((file) =>
          file.path.startsWith("records/"),
        );
        const [file] = files as [Entry];
        const staged: Entry = {
          path: name === "renamed" ? await recordFileName("other") : file.path,
          bytes: file.bytes,
        };
        await stageAll([staged], deps);
        const { status, body } = await apply([staged], deps);
        expect(status, name).toBe(409);
        expect(body, name).toMatchObject({ code: "files_refused", paths: [staged.path] });
        expect(records.size).toBe(0);
      }
    });

    it("refuses a log that can't be read, without quoting it", async () => {
      const { deps, runs } = memoryDeps();
      const broken: Entry = { path: "runs/r1.jsonl", bytes: encoder.encode("not json at all\n") };
      await stageAll([broken], deps);
      const { status, body } = await apply([broken], deps);
      expect(status).toBe(409);
      expect(body["code"]).toBe("files_refused");
      expect(JSON.stringify(body)).not.toContain("not json at all");
      expect(runs.size).toBe(0);
    });

    it("answers 409 conflict when the deployment holds other data under the same name, and writes nothing", async () => {
      const { deps, runs, records, blobs } = memoryDeps();
      const files = await entries();
      runs.set("r-invoice", [{ ...event("r-invoice"), text: "other" } as never]);
      await stageAll(files, deps);
      const { status, body } = await apply(files, deps);
      expect(status).toBe(409);
      expect(body).toMatchObject({ code: "conflict", paths: ["runs/r-invoice.jsonl"] });
      expect([records.size, blobs.size]).toEqual([0, 0]);
    });
  });
});
