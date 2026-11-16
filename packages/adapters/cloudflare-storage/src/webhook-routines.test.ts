import type { DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DefinitionSnapshotError } from "./definition-snapshot.ts";
import { writeDefinitionSnapshot } from "./definition-snapshot-writer.ts";
import { R2DefinitionSource } from "./r2-definition-source.ts";
import { type IndexedRoutine, readRoutineIndex } from "./webhook-routines.ts";

/** A map-backed bucket, as `r2-definition-source.test.ts` uses; the workerd suites prove the real binding. */
class MapBucket {
  readonly objects = new Map<string, string>();

  async put(key: string, value: string | Uint8Array): Promise<void> {
    this.objects.set(key, typeof value === "string" ? value : new TextDecoder().decode(value));
  }

  async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
    const stored = this.objects.get(key);
    return stored === undefined
      ? null
      : { arrayBuffer: async () => new TextEncoder().encode(stored).buffer as ArrayBuffer };
  }
}

const orders: IndexedRoutine = {
  hub: "acme",
  routine: {
    version: 1,
    id: "orders",
    name: "Orders",
    enabled: true,
    trigger: { webhook: { secret: "acme-hook", headers: ["x-event"] } },
    run: { workflow: "handle-order", input: { order: "{{trigger.body.id}}" } },
    overlap: "skip",
    catchUp: "last",
  },
};

const files = { "hubs/acme/workflows/routines/orders.routine.yaml": "id: orders\n" };

describe("the routine index", () => {
  verifies("cloudflare-storage.r2-definition-source", () => {
    it("reads back the routines the snapshot was written with", async () => {
      const bucket = new MapBucket();
      await writeDefinitionSnapshot(bucket, files, [
        orders,
        { hub: null, routine: orders.routine },
      ]);
      const routines = await readRoutineIndex(new R2DefinitionSource(bucket));
      expect(routines).toEqual([orders, { hub: null, routine: orders.routine }]);
    });

    it("lists the index in the manifest, and not among the workspace files", async () => {
      const bucket = new MapBucket();
      await writeDefinitionSnapshot(bucket, files, [orders]);
      const source = new R2DefinitionSource(bucket);
      expect(await source.list()).toEqual(Object.keys(files));
      const manifest = [...bucket.objects.entries()].find(([key]) => key.endsWith("manifest.json"));
      expect(manifest?.[1]).toContain("routines.index.json");
    });

    it("keeps nothing in the bucket the routine files didn't hold: secrets stay names", async () => {
      const bucket = new MapBucket();
      const value = "a-secret-value-made-up-for-this-test";
      await writeDefinitionSnapshot(bucket, { ...files, ".env": `ACME_HOOK=${value}` }, [orders]);
      const text = [...bucket.objects.values()].join("\n");
      expect(text).not.toContain(value);
      const index = [...bucket.objects.entries()].find(([key]) =>
        key.endsWith("routines.index.json"),
      );
      expect(JSON.parse(index?.[1] ?? "null")).toEqual([orders]);
      expect(index?.[1]).toContain('"secret":"acme-hook"');
    });

    it("refuses a workspace file at the index's own path", async () => {
      await expect(
        writeDefinitionSnapshot(new MapBucket(), { "routines.index.json": "[]" }, []),
      ).rejects.toThrow(RangeError);
    });

    it("fails for a snapshot with no index, an index that isn't JSON and one that doesn't fit", async () => {
      /** A source whose only file is the index; `null` is a snapshot without one. */
      const holding = (index: string | null) =>
        ({ read: async () => index }) as Pick<DefinitionSource, "read"> as DefinitionSource;
      await expect(readRoutineIndex(holding(null))).rejects.toThrow("halonic deploy");
      await expect(readRoutineIndex(holding("{"))).rejects.toThrow(DefinitionSnapshotError);
      await expect(readRoutineIndex(holding('[{"hub":"a"}]'))).rejects.toThrow("expected shape");
    });
  });
});
