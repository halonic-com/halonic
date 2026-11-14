// Runs inside workerd: what the R2 definition source does with a real R2 bucket, beyond the
// DefinitionSource contract: which version it serves, and what it refuses.

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DefinitionSnapshotError, snapshotKeys } from "./definition-snapshot.ts";
import { writeDefinitionSnapshot } from "./definition-snapshot-writer.ts";
import { R2DefinitionSource, type R2DefinitionSourceOptions } from "./r2-definition-source.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's R2 bucket, bound by the test file that starts workerd. */
      DEFINITIONS: R2Bucket;
    }
  }
}

const files = { "workspace.yaml": "id: acme\n", "hubs/a/hub.yaml": "id: a\n" };

/** A prefix of its own in the bucket, so a case never finds what another left there. */
function snapshotArea(): {
  keyPrefix: string;
  keys: ReturnType<typeof snapshotKeys>;
  reads: { count: number };
  write(files: Readonly<Record<string, string>>): Promise<string>;
  source(options?: R2DefinitionSourceOptions): R2DefinitionSource;
} {
  const keyPrefix = `case-${crypto.randomUUID()}/`;
  const reads = { count: 0 };
  const counting = {
    get: (key: string) => {
      reads.count += 1;
      return env.DEFINITIONS.get(key);
    },
  };
  return {
    keyPrefix,
    keys: snapshotKeys(keyPrefix),
    reads,
    write: (written) => writeDefinitionSnapshot(env.DEFINITIONS, written, keyPrefix),
    source: (options) => new R2DefinitionSource(counting, { keyPrefix, ...options }),
  };
}

describe("R2DefinitionSource", () => {
  it("serves the version current names, and leaves private files out of the bucket", async () => {
    const area = snapshotArea();
    const version = await area.write({ ...files, ".env": "KEY=1" });
    const source = area.source();
    expect(await source.version()).toBe(version);
    expect(await source.list()).toEqual(["hubs/a/hub.yaml", "workspace.yaml"]);
    const stored = await env.DEFINITIONS.list({ prefix: area.keyPrefix });
    expect(stored.objects.some((object) => object.key.includes(".env"))).toBe(false);
  });

  it("keeps serving the version it started with after a deploy", async () => {
    const area = snapshotArea();
    const first = await area.write(files);
    const source = area.source();
    expect(await source.version()).toBe(first);
    await area.write({ "workspace.yaml": "id: other\n" });
    expect(await source.read("workspace.yaml")).toBe("id: acme\n");
  });

  it("serves a fixed version without looking at current", async () => {
    const area = snapshotArea();
    const version = await area.write(files);
    await env.DEFINITIONS.delete(area.keys.current);
    expect(await area.source({ version }).read("workspace.yaml")).toBe("id: acme\n");
  });

  it("answers a path outside the manifest without asking R2", async () => {
    const area = snapshotArea();
    await area.write(files);
    const source = area.source();
    await source.version();
    const before = area.reads.count;
    expect(await source.read("other.yaml")).toBeNull();
    expect(area.reads.count).toBe(before);
  });

  it("refuses a file whose bytes differ from the manifest", async () => {
    const area = snapshotArea();
    const version = await area.write(files);
    await env.DEFINITIONS.put(area.keys.file(version, "workspace.yaml"), "id: evil\n");
    await expect(area.source().read("workspace.yaml")).rejects.toThrow(DefinitionSnapshotError);
  });

  it("fails when nothing was deployed, a file is missing or the format is newer", async () => {
    const area = snapshotArea();
    await expect(area.source().list()).rejects.toThrow("No workspace snapshot");
    const version = await area.write(files);
    await env.DEFINITIONS.delete(area.keys.file(version, "workspace.yaml"));
    await expect(area.source().read("workspace.yaml")).rejects.toThrow("lacks");
    const stored = await env.DEFINITIONS.get(area.keys.manifest(version));
    const manifest = JSON.parse((await stored?.text()) ?? "{}");
    await env.DEFINITIONS.put(
      area.keys.manifest(version),
      JSON.stringify({ ...manifest, formatVersion: 2 }),
    );
    await expect(area.source().list()).rejects.toThrow("Update Halonic");
  });

  it("gives two workspaces that differ only by a newline in a path two versions", async () => {
    const area = snapshotArea();
    const a = await area.write({ "a\nb": "x" });
    const b = await area.write({ a: "b", b: "x" });
    expect(a).not.toBe(b);
  });

  it("refuses to upload a path the port forbids", async () => {
    for (const path of ["../x", "a//b", "/abs"]) {
      await expect(snapshotArea().write({ [path]: "x" })).rejects.toThrow(RangeError);
    }
  });

  it("refuses a manifest that can't be trusted", async () => {
    const hash = "a".repeat(64);
    const entry = { path: "a.yaml", bytes: 1, sha256: hash };
    const bad: unknown[][] = [
      [{ ...entry, path: "../a.yaml" }],
      [entry, entry],
      [{ ...entry, path: "b.yaml" }, entry],
      [{ ...entry, sha256: "xyz" }],
      [{ ...entry, bytes: -1 }],
    ];
    for (const entries of bad) {
      const area = snapshotArea();
      const version = `sha256:${hash}`;
      await env.DEFINITIONS.put(area.keys.current, version);
      await env.DEFINITIONS.put(
        area.keys.manifest(version),
        JSON.stringify({ formatVersion: 1, version, files: entries }),
      );
      await expect(area.source().list()).rejects.toThrow(DefinitionSnapshotError);
    }
  });

  it("refuses broken JSON, a bad current and a bad version option", async () => {
    const area = snapshotArea();
    const version = await area.write(files);
    await env.DEFINITIONS.put(area.keys.manifest(version), "{");
    await expect(area.source().list()).rejects.toThrow(DefinitionSnapshotError);
    await env.DEFINITIONS.put(area.keys.current, "../evil");
    await expect(area.source().list()).rejects.toThrow(DefinitionSnapshotError);
    expect(() => area.source({ version: "../evil" })).toThrow(DefinitionSnapshotError);
  });

  it("tries again after a failed load", async () => {
    const area = snapshotArea();
    const source = area.source();
    await expect(source.list()).rejects.toThrow("No workspace snapshot");
    await area.write(files);
    expect(await source.list()).toHaveLength(2);
  });

  it("has no way to write", () => {
    const source = snapshotArea().source();
    expect("write" in source).toBe(false);
    expect("remove" in source).toBe(false);
  });
});
