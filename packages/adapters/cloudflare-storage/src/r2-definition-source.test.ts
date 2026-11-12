import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DefinitionSnapshotError, snapshotKeys } from "./definition-snapshot.ts";
import { writeDefinitionSnapshot } from "./definition-snapshot-writer.ts";
import { R2DefinitionSource } from "./r2-definition-source.ts";

/**
 * A stand-in, not the proof. This file runs the source on a map-backed bucket in Node so the
 * package has coverage. The real proof is the contract suite in `r2-definition-source.workerd.test.ts`,
 * which runs the source over a real R2 binding in workerd.
 */
class MapBucket {
  readonly objects = new Map<string, Uint8Array>();
  readonly reads: string[] = [];

  async put(key: string, value: string | Uint8Array): Promise<void> {
    this.objects.set(key, typeof value === "string" ? new TextEncoder().encode(value) : value);
  }

  async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
    this.reads.push(key);
    const stored = this.objects.get(key);
    return stored === undefined ? null : { arrayBuffer: async () => new Uint8Array(stored).buffer };
  }
}

const files = { "workspace.yaml": "id: acme\n", "hubs/a/hub.yaml": "id: a\n" };
const keys = snapshotKeys("definitions/");

describe("R2DefinitionSource", () => {
  verifies("cloudflare-storage.r2-definition-source", () => {
    it("serves the version current names, and leaves private files out of the bucket", async () => {
      const bucket = new MapBucket();
      const version = await writeDefinitionSnapshot(bucket, { ...files, ".env": "KEY=1" });
      const source = new R2DefinitionSource(bucket);
      expect(await source.version()).toBe(version);
      expect(await source.list()).toEqual(["hubs/a/hub.yaml", "workspace.yaml"]);
      expect([...bucket.objects.keys()].some((key) => key.includes(".env"))).toBe(false);
    });

    it("keeps serving the version it started with after a deploy", async () => {
      const bucket = new MapBucket();
      const first = await writeDefinitionSnapshot(bucket, files);
      const source = new R2DefinitionSource(bucket);
      expect(await source.version()).toBe(first);
      await writeDefinitionSnapshot(bucket, { "workspace.yaml": "id: other\n" });
      expect(await source.read("workspace.yaml")).toBe("id: acme\n");
    });

    it("serves a fixed version without looking at current", async () => {
      const bucket = new MapBucket();
      const version = await writeDefinitionSnapshot(bucket, files);
      bucket.objects.delete(keys.current);
      const source = new R2DefinitionSource(bucket, { version });
      expect(await source.read("workspace.yaml")).toBe("id: acme\n");
    });

    it("answers a path outside the manifest without asking R2", async () => {
      const bucket = new MapBucket();
      await writeDefinitionSnapshot(bucket, files);
      const source = new R2DefinitionSource(bucket);
      await source.version();
      const before = bucket.reads.length;
      expect(await source.read("other.yaml")).toBeNull();
      expect(bucket.reads.length).toBe(before);
    });

    it("refuses a file whose bytes differ from the manifest", async () => {
      const bucket = new MapBucket();
      const version = await writeDefinitionSnapshot(bucket, files);
      await bucket.put(keys.file(version, "workspace.yaml"), "id: evil\n");
      await expect(new R2DefinitionSource(bucket).read("workspace.yaml")).rejects.toThrow(
        DefinitionSnapshotError,
      );
    });

    it("fails when nothing was deployed, a file is missing or the format is newer", async () => {
      const bucket = new MapBucket();
      await expect(new R2DefinitionSource(bucket).list()).rejects.toThrow("No workspace snapshot");
      const version = await writeDefinitionSnapshot(bucket, files);
      bucket.objects.delete(keys.file(version, "workspace.yaml"));
      await expect(new R2DefinitionSource(bucket).read("workspace.yaml")).rejects.toThrow("lacks");
      const manifest = JSON.parse(
        new TextDecoder().decode(bucket.objects.get(keys.manifest(version))),
      );
      await bucket.put(keys.manifest(version), JSON.stringify({ ...manifest, formatVersion: 2 }));
      await expect(new R2DefinitionSource(bucket).list()).rejects.toThrow("Update Halonic");
    });

    it("gives two workspaces that differ only by a newline in a path two versions", async () => {
      const bucket = new MapBucket();
      const a = await writeDefinitionSnapshot(bucket, { "a\nb": "x" });
      const b = await writeDefinitionSnapshot(bucket, { a: "b", b: "x" });
      expect(a).not.toBe(b);
    });

    it("refuses to upload a path the port forbids", async () => {
      for (const path of ["../x", "a//b", "/abs"]) {
        await expect(writeDefinitionSnapshot(new MapBucket(), { [path]: "x" })).rejects.toThrow(
          RangeError,
        );
      }
    });

    it("refuses a manifest that can't be trusted", async () => {
      const hash = "a".repeat(64);
      const entry = { path: "a.yaml", bytes: 1, sha256: hash };
      const bad: Record<string, unknown[]> = {
        "unsafe path": [{ ...entry, path: "../a.yaml" }],
        duplicate: [entry, entry],
        unsorted: [{ ...entry, path: "b.yaml" }, entry],
        "bad hash": [{ ...entry, sha256: "xyz" }],
        "bad bytes": [{ ...entry, bytes: -1 }],
      };
      for (const [name, entries] of Object.entries(bad)) {
        const bucket = new MapBucket();
        const version = `sha256:${hash}`;
        await bucket.put(keys.current, version);
        await bucket.put(
          keys.manifest(version),
          JSON.stringify({ formatVersion: 1, version, files: entries }),
        );
        await expect(new R2DefinitionSource(bucket).list(), name).rejects.toThrow(
          DefinitionSnapshotError,
        );
      }
    });

    it("refuses broken JSON, a bad current and a bad version option", async () => {
      const bucket = new MapBucket();
      const version = await writeDefinitionSnapshot(bucket, files);
      await bucket.put(keys.manifest(version), "{");
      await expect(new R2DefinitionSource(bucket).list()).rejects.toThrow(DefinitionSnapshotError);
      await bucket.put(keys.current, "../evil");
      await expect(new R2DefinitionSource(bucket).list()).rejects.toThrow(DefinitionSnapshotError);
      expect(() => new R2DefinitionSource(bucket, { version: "../evil" })).toThrow(
        DefinitionSnapshotError,
      );
    });

    it("tries again after a failed load", async () => {
      const bucket = new MapBucket();
      const source = new R2DefinitionSource(bucket);
      await expect(source.list()).rejects.toThrow("No workspace snapshot");
      await writeDefinitionSnapshot(bucket, files);
      expect(await source.list()).toHaveLength(2);
    });

    it("has no way to write", () => {
      const source = new R2DefinitionSource(new MapBucket());
      expect("write" in source).toBe(false);
      expect("remove" in source).toBe(false);
    });
  });
});
