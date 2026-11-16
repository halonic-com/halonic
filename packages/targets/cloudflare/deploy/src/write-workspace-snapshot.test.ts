import { R2DefinitionSource, readRoutineIndex } from "@halonicjs/adapter-cloudflare-storage";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { writeWorkspaceSnapshot } from "./write-workspace-snapshot.ts";

const routineFile = [
  "id: orders",
  "name: Orders",
  "trigger: { webhook: { secret: orders-hook } }",
  "run: { workflow: handle-order }",
].join("\n");

verifies("cloudflare-storage.routine-index", () => {
  it("indexes the routines of the files it writes, so the two can't differ", async () => {
    const objects = new Map<string, string | Uint8Array>();
    await writeWorkspaceSnapshot(
      {
        async put(key, value) {
          objects.set(key, value);
        },
      },
      { "hubs/acme/workflows/routines/orders.routine.yaml": routineFile },
    );

    const source = new R2DefinitionSource({
      async get(key) {
        const stored = objects.get(key);
        if (stored === undefined) {
          return null;
        }
        const bytes = typeof stored === "string" ? new TextEncoder().encode(stored) : stored;
        return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
      },
    });
    const index = await readRoutineIndex(source);
    expect(index.map((entry) => [entry.hub, entry.routine.id])).toEqual([["acme", "orders"]]);
    expect(index[0]?.routine.trigger).toMatchObject({ webhook: { secret: "orders-hook" } });
  });
});
