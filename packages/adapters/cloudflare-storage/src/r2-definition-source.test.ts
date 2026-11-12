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

    it("has no way to write", () => {
      const source = new R2DefinitionSource(new MapBucket());
      expect("write" in source).toBe(false);
      expect("remove" in source).toBe(false);
    });
  });
});
