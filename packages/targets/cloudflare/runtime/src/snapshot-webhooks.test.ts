import type { DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { snapshotWebhooks } from "./snapshot-webhooks.ts";

const routineFile = [
  "id: orders",
  "name: Orders",
  "trigger: { webhook: { secret: acme-hook } }",
  "run: { workflow: handle-order, input: { order: '{{trigger.body.id}}' } }",
].join("\n");

/** A snapshot in memory that counts how many files were read, and whose version a test can change. */
class CountingSource implements DefinitionSource {
  readonly location: string;
  reads = 0;
  currentVersion = "v1";
  readonly #files: Record<string, string>;

  constructor(location: string, files: Record<string, string>) {
    this.location = location;
    this.#files = files;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.#files);
  }

  async read(path: string): Promise<string | null> {
    this.reads += 1;
    return this.#files[path] ?? null;
  }

  async version(): Promise<string> {
    return this.currentVersion;
  }
}

const routinePath = "hubs/acme/workflows/routines/orders.routine.yaml";

verifies("runtime.serve", () => {
  describe("the routines read for a webhook", () => {
    it("parses the snapshot once per version, however many deliveries ask", async () => {
      const source = new CountingSource("memory:once", { [routinePath]: routineFile });
      const webhooks = snapshotWebhooks(source);
      expect(await webhooks.find("acme/orders")).not.toBeNull();
      const readsAfterFirst = source.reads;
      expect(readsAfterFirst).toBeGreaterThan(0);

      // A later request builds a new source object over the same snapshot.
      const later = snapshotWebhooks(source);
      expect(await later.find("acme/orders")).not.toBeNull();
      expect(await later.find("acme/nothing")).toBeNull();
      expect(source.reads).toBe(readsAfterFirst);
    });

    it("parses the snapshot again after a deploy changes its version", async () => {
      const source = new CountingSource("memory:deploy", { [routinePath]: routineFile });
      const webhooks = snapshotWebhooks(source);
      await webhooks.find("acme/orders");
      const readsAfterFirst = source.reads;

      source.currentVersion = "v2";
      await webhooks.find("acme/orders");
      expect(source.reads).toBeGreaterThan(readsAfterFirst);
    });
  });
});
