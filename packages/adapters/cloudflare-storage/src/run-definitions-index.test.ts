import type { DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import type { HubDefinitions } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { DefinitionSnapshotError } from "./definition-snapshot.ts";
import { writeDefinitionSnapshot } from "./definition-snapshot-writer.ts";
import { R2DefinitionSource } from "./r2-definition-source.ts";
import { readRunDefinitionsIndex, runDefinitionsIndexFormat } from "./run-definitions-index.ts";

/** A map-backed bucket, as `webhook-routines.test.ts` uses; the workerd suites prove the real binding. */
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

/** Hub `acme` with no files of its own: the index only carries it. */
const acme = {
  hubId: "acme",
  settings: null,
  hub: null,
  workflows: {},
  agents: {},
  models: {},
  providers: {},
  runtimes: {},
  skills: {},
  knowledge: {},
  collections: {},
  connectors: {},
} satisfies HubDefinitions;

const files = { "hubs/acme/notes.md": "Orders arrive by mail.\n" };

/** A source whose only file is the index; `null` is a snapshot without one. */
function holding(index: string | null): DefinitionSource {
  return { read: async () => index } as Pick<DefinitionSource, "read"> as DefinitionSource;
}

verifies("cloudflare-storage.run-definitions-index", () => {
  describe("the run-definitions index", () => {
    it("reads back the hubs the snapshot was written with, and lists it with no file", async () => {
      const bucket = new MapBucket();
      await writeDefinitionSnapshot(bucket, files, { routines: [], runDefinitions: { acme } });
      const source = new R2DefinitionSource(bucket);
      expect(await readRunDefinitionsIndex(source)).toEqual({ acme });
      expect(await source.list()).toEqual(Object.keys(files));
    });

    it("refuses a workspace file at the index's own path", async () => {
      const taken = { "run-definitions.index.json": "{}" };
      await expect(
        writeDefinitionSnapshot(new MapBucket(), taken, { routines: [], runDefinitions: {} }),
      ).rejects.toThrow(RangeError);
    });

    it("tells a snapshot written without one to deploy again", async () => {
      const bucket = new MapBucket();
      await writeDefinitionSnapshot(bucket, files, { routines: [] });
      await expect(readRunDefinitionsIndex(new R2DefinitionSource(bucket))).rejects.toThrow(
        "Run `halonic deploy` again",
      );
    });

    it("refuses a newer format plainly, and an older one with a deploy again", async () => {
      const newer = JSON.stringify({ format: runDefinitionsIndexFormat + 1, hubs: {} });
      await expect(readRunDefinitionsIndex(holding(newer))).rejects.toThrow(
        `is in format ${runDefinitionsIndexFormat + 1}, newer than this Worker reads`,
      );
      await expect(readRunDefinitionsIndex(holding(newer))).rejects.toThrow("Update Halonic");
      const older = JSON.stringify({ format: 0, hubs: {} });
      await expect(readRunDefinitionsIndex(holding(older))).rejects.toThrow("halonic deploy");
    });

    it("fails for an index that isn't JSON, has no format or doesn't fit", async () => {
      const current = runDefinitionsIndexFormat;
      await expect(readRunDefinitionsIndex(holding("{"))).rejects.toThrow(DefinitionSnapshotError);
      await expect(readRunDefinitionsIndex(holding('{"hubs":{}}'))).rejects.toThrow("no format");
      await expect(
        readRunDefinitionsIndex(holding(JSON.stringify({ format: current, hubs: { acme: {} } }))),
      ).rejects.toThrow("expected shape");
      await expect(
        readRunDefinitionsIndex(
          holding(JSON.stringify({ format: current, hubs: { other: acme } })),
        ),
      ).rejects.toThrow('files hub "acme" under "other"');
    });
  });
});
