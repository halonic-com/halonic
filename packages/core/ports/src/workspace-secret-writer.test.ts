import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type WorkspaceSecretWriter, workspaceSecretWriter } from "./index.ts";

const halonicRefusal = "A workspace can't pick a secret that belongs to Halonic.";
const pluginRefusal = "A workspace can't pick a secret that belongs to a plugin.";

/** A store in memory, which remembers every call it was asked. */
function memoryStore(): WorkspaceSecretWriter & {
  readonly values: Map<string, string>;
  readonly asked: string[];
} {
  const values = new Map<string, string>();
  const asked: string[] = [];
  return {
    values,
    asked,
    set: async (name, value) => {
      asked.push(`set ${name}`);
      values.set(name, value);
    },
    remove: async (name) => {
      asked.push(`remove ${name}`);
      values.delete(name);
    },
    has: async (name) => {
      asked.push(`has ${name}`);
      return values.has(name);
    },
  };
}

/** Each of the writer's three calls, for a name. */
const calls: readonly [
  string,
  (writer: WorkspaceSecretWriter, name: string) => Promise<unknown>,
][] = [
  ["set", (writer, name) => writer.set(name, "typed value")],
  ["remove", (writer, name) => writer.remove(name)],
  ["has", (writer, name) => writer.has(name)],
];

verifies("ports.workspace-secret-writer", () => {
  describe("workspaceSecretWriter", () => {
    for (const [call, run] of calls) {
      it.each(["serve-password", "Token_Key", "Halonic-Token-google_refresh"])(
        `refuses ${call} of %s without asking the store`,
        async (name) => {
          const store = memoryStore();

          await expect(run(workspaceSecretWriter(store), name)).rejects.toThrow(
            new RangeError(halonicRefusal),
          );
          expect(store.asked).toEqual([]);
        },
      );

      it.each(["plugin__weather__acme-key", "Plugin-_Weather__Acme_Key"])(
        `refuses ${call} of the plugin secret %s without asking the store`,
        async (name) => {
          const store = memoryStore();

          await expect(run(workspaceSecretWriter(store), name)).rejects.toThrow(
            new RangeError(pluginRefusal),
          );
          expect(store.asked).toEqual([]);
        },
      );
    }

    it("keeps a plugin's value when a workspace names it", async () => {
      const store = memoryStore();
      store.values.set("plugin__weather__acme-key", "the plugin's value");

      await expect(
        workspaceSecretWriter(store).set("plugin__weather__acme-key", "typed value"),
      ).rejects.toThrow(RangeError);
      expect(store.values.get("plugin__weather__acme-key")).toBe("the plugin's value");
    });

    it("sets, finds and removes a name the workspace picks", async () => {
      const store = memoryStore();
      const writer = workspaceSecretWriter(store);

      await writer.set("NOTES_TOKEN", "typed value");
      expect(store.values.get("NOTES_TOKEN")).toBe("typed value");
      expect(await writer.has("NOTES_TOKEN")).toBe(true);

      await writer.remove("NOTES_TOKEN");
      expect(await writer.has("NOTES_TOKEN")).toBe(false);
    });

    it("refuses a name that breaks the rule with the rule's own RangeError", async () => {
      const store = memoryStore();

      await expect(workspaceSecretWriter(store).set("notes token", "typed value")).rejects.toThrow(
        'Secret name "notes token" must be',
      );
      expect(store.asked).toEqual([]);
    });
  });
});
