import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { DeployError } from "./errors.ts";
import { exportFromWorker, importToWorker } from "./worker-transfer.ts";

const key = "the-secret-job-key";
const baseUrl = "https://app.example.com";
const hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (s: string) => new TextEncoder().encode(s);

const runBytes = text('{"type":"run.started"}\n');
const runPath = "runs/r1.jsonl";
const manifest = {
  formatVersion: 1,
  deployment: "dep-1",
  exportedAt: "2026-11-15T09:00:00.000Z",
  files: [{ path: runPath, bytes: runBytes.byteLength, sha256: hex(runBytes) }],
};

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body?: Uint8Array;
}

function worker(
  handler: (call: Call) => Response | undefined,
  calls: Call[] = [],
): { fetch: typeof fetch; calls: Call[] } {
  return {
    calls,
    fetch: (async (input: URL, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const body = init.body ? new Uint8Array(init.body as Uint8Array) : undefined;
      const call: Call = {
        method: init.method ?? "GET",
        path: input.pathname,
        auth: headers.get("authorization"),
        ...(body ? { body } : {}),
      };
      calls.push(call);
      return handler(call) ?? new Response(null, { status: 500 });
    }) as typeof fetch,
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function folderWith(files: Record<string, Uint8Array>, withManifest = true): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "hlt-transfer-"));
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(join(folder, path, ".."), { recursive: true });
    await writeFile(join(folder, path), bytes);
  }
  if (withManifest) await writeFile(join(folder, "halonic-export.json"), JSON.stringify(manifest));
  return folder;
}

async function failure(work: Promise<unknown>): Promise<DeployError> {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DeployError);
  return error as DeployError;
}

let empty: string;
beforeEach(async () => {
  empty = await mkdtemp(join(tmpdir(), "hlt-transfer-empty-"));
});

verifies("deploy.worker-transfer", () => {
  it("writes the files and then the manifest, sending the key as a bearer", async () => {
    const w = worker((c) => {
      if (c.path === "/admin/export") return json(manifest);
      return c.path === "/admin/export/files/runs/r1.jsonl" ? new Response(runBytes) : undefined;
    });
    const done = await exportFromWorker({ baseUrl, key, folder: empty, fetch: w.fetch });
    expect(done.files).toHaveLength(1);
    expect(new Uint8Array(await readFile(join(empty, runPath)))).toEqual(runBytes);
    expect(JSON.parse(await readFile(join(empty, "halonic-export.json"), "utf8"))).toEqual(
      manifest,
    );
    expect(w.calls.every((c) => c.auth === `Bearer ${key}`)).toBe(true);
  });

  it("fails and writes no manifest when a file differs from the manifest", async () => {
    const w = worker((c) =>
      c.path === "/admin/export" ? json(manifest) : new Response(text("other")),
    );
    const error = await failure(exportFromWorker({ baseUrl, key, folder: empty, fetch: w.fetch }));
    expect(error.code).toBe("transfer-failed");
    await expect(readFile(join(empty, "halonic-export.json"))).rejects.toThrow();
  });

  it("refuses a folder that isn't empty", async () => {
    const folder = await folderWith({ "x.txt": text("x") }, false);
    const w = worker(() => json(manifest));
    const error = await failure(exportFromWorker({ baseUrl, key, folder, fetch: w.fetch }));
    expect(error.code).toBe("transfer-failed");
    expect(w.calls).toEqual([]);
  });

  it("names the file and shape when the Worker finds a secret", async () => {
    const w = worker(() =>
      json({ code: "secret_found", path: "runs/r1.jsonl", shape: "api-key", message: "m" }, 409),
    );
    const error = await failure(exportFromWorker({ baseUrl, key, folder: empty, fetch: w.fetch }));
    expect(error.code).toBe("export-refused");
    expect(error.message).toContain("runs/r1.jsonl");
    expect(error.message).toContain("api-key");
  });

  it("stages every file, posts the manifest and returns the counts", async () => {
    const folder = await folderWith({ [runPath]: runBytes });
    const w = worker((c) =>
      c.method === "PUT"
        ? new Response(null, { status: 204 })
        : json({ imported: { runs: 1, records: 0, blobs: 0 } }),
    );
    const counts = await importToWorker({ baseUrl, key, folder, fetch: w.fetch });
    expect(counts).toEqual({ runs: 1, records: 0, blobs: 0 });
    expect(w.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /admin/import/files/runs/r1.jsonl",
      "POST /admin/import",
    ]);
    expect(w.calls[0]?.body).toEqual(runBytes);
  });

  it("sends nothing when a file of the folder was changed", async () => {
    const folder = await folderWith({ [runPath]: text("changed") });
    const w = worker(() => undefined);
    const error = await failure(importToWorker({ baseUrl, key, folder, fetch: w.fetch }));
    expect(error.code).toBe("transfer-failed");
    expect(w.calls).toEqual([]);
  });

  it("stages the missing files again once and posts again", async () => {
    const folder = await folderWith({ [runPath]: runBytes });
    let posts = 0;
    const w = worker((c) => {
      if (c.method === "PUT") return new Response(null, { status: 204 });
      posts++;
      return posts === 1
        ? json({ code: "files_missing", paths: [runPath] }, 409)
        : json({ imported: { runs: 1, records: 0, blobs: 0 } });
    });
    const counts = await importToWorker({ baseUrl, key, folder, fetch: w.fetch });
    expect(counts.runs).toBe(1);
    expect(w.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("gives up after one more try", async () => {
    const folder = await folderWith({ [runPath]: runBytes });
    const w = worker((c) =>
      c.method === "PUT"
        ? new Response(null, { status: 204 })
        : json({ code: "files_differ", paths: [runPath] }, 409),
    );
    const error = await failure(importToWorker({ baseUrl, key, folder, fetch: w.fetch }));
    expect(error.code).toBe("import-refused");
    expect(w.calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("doesn't retry a conflict", async () => {
    const folder = await folderWith({ [runPath]: runBytes });
    const w = worker((c) =>
      c.method === "PUT"
        ? new Response(null, { status: 204 })
        : json({ code: "conflict", paths: ["records/x"] }, 409),
    );
    const error = await failure(importToWorker({ baseUrl, key, folder, fetch: w.fetch }));
    expect(error.code).toBe("import-refused");
    expect(w.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("sends nothing over http", async () => {
    const w = worker(() => undefined);
    const error = await failure(
      exportFromWorker({ baseUrl: "http://app.example.com", key, folder: empty, fetch: w.fetch }),
    );
    expect(error.code).toBe("transfer-failed");
    expect(w.calls).toEqual([]);
  });

  it("keeps the key out of an error that echoes it", async () => {
    const w = worker(() => {
      throw new Error(`socket closed after Bearer ${key}`);
    });
    const error = await failure(exportFromWorker({ baseUrl, key, folder: empty, fetch: w.fetch }));
    expect(error.code).toBe("transfer-failed");
    expect(error.message).not.toContain(key);
  });
});
