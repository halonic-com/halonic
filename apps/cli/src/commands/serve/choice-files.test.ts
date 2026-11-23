import { MemoryDefinitionStore, MemoryVcs } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type ChoiceHistory,
  saveChoiceFiles,
  UncommittedChoiceFilesError,
} from "./choice-files.ts";

const committed = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": "aliases:\n  default: mock/echo\n",
  "notes.md": "Acme notes\n",
};

/** A workspace with one commit of {@link committed}, and the history the save opens. */
async function workspace(history = true) {
  const store = new MemoryDefinitionStore(committed);
  const vcs = new MemoryVcs(store);
  await vcs.init();
  await vcs.commitVersion({ message: "Start", exclude: [] });
  const closed: string[] = [];
  const opened = { vcs: vcs as ChoiceHistory, close: async () => void closed.push("closed") };
  const input = {
    store,
    root: "/acme",
    openHistory: async () => (history ? opened : null),
  };
  return { store, vcs, input, closed };
}

const choice = {
  "models.yaml": "aliases:\n  default: anthropic/claude-haiku\n",
  "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
};

describe("saving a served window's model choice", () => {
  verifies("cli.commands.serve.choice-commit", () => {
    it("commits only the choice files, in one commit with the fixed message", async () => {
      const { store, vcs, input, closed } = await workspace();
      await store.write("notes.md", "Acme notes, edited\n");
      await vcs.stage(["notes.md"]);

      await saveChoiceFiles(input, choice);

      const [last] = await vcs.log(1);
      expect(last?.message).toBe("Save the model picked through halonic serve");
      expect(await vcs.readAt(last?.hash ?? "", "models.yaml")).toBe(choice["models.yaml"]);
      expect(await vcs.readAt(last?.hash ?? "", "providers/anthropic.yaml")).not.toBeNull();
      expect(await vcs.readAt(last?.hash ?? "", "notes.md")).toBe(committed["notes.md"]);
      // The person's own staged edit is still theirs, staged and uncommitted.
      expect((await vcs.status()).changes).toEqual([
        { path: "notes.md", status: "modified", staged: true },
      ]);
      expect(closed).toEqual(["closed"]);
    });

    it("refuses, writing nothing, when a choice file has changes that aren't committed", async () => {
      const { store, vcs, input, closed } = await workspace();
      await store.write("models.yaml", "aliases:\n  default: mock/echo # mine\n");

      const saving = saveChoiceFiles(input, choice);

      await expect(saving).rejects.toThrow(UncommittedChoiceFilesError);
      await expect(saving).rejects.toThrow(
        "Couldn't save: models.yaml has changes that aren't committed. Commit or undo them, then try again.",
      );
      expect(await store.read("models.yaml")).toBe("aliases:\n  default: mock/echo # mine\n");
      expect(await store.read("providers/anthropic.yaml")).toBeNull();
      expect((await vcs.log(5)).map((commit) => commit.message)).toEqual(["Start"]);
      expect(closed).toEqual(["closed"]);
    });

    it("names every such file, staged or not", async () => {
      const { store, vcs, input } = await workspace();
      await store.write("models.yaml", "aliases: {}\n");
      await store.write("workspace.yaml", "id: acme\nname: Acme Ltd\n");
      await vcs.stage(["workspace.yaml"]);

      const saving = saveChoiceFiles(input, {
        ...choice,
        "workspace.yaml": "id: acme\nname: Acme\nprivacy:\n  localOnly: false\n",
      });

      await expect(saving).rejects.toThrow(
        "Couldn't save: models.yaml and workspace.yaml have changes that aren't committed.",
      );
    });

    it("lists three files with commas and 'and' before the last", () => {
      const refusal = new UncommittedChoiceFilesError([
        "models.yaml",
        "providers/anthropic.yaml",
        "workspace.yaml",
      ]);
      expect(refusal.message).toBe(
        "Couldn't save: models.yaml, providers/anthropic.yaml and workspace.yaml have changes that aren't committed. Commit or undo them, then try again.",
      );
    });

    it("puts the files back as they were when the commit fails", async () => {
      const { store, vcs, input } = await workspace();
      const failing: ChoiceHistory = {
        status: () => vcs.status(),
        commitVersion: () => Promise.reject(new Error("git stopped")),
      };
      const opened = { vcs: failing, close: async () => undefined };

      const saving = saveChoiceFiles({ ...input, openHistory: async () => opened }, choice);

      await expect(saving).rejects.toThrow("git stopped");
      expect(await store.read("models.yaml")).toBe(committed["models.yaml"]);
      expect(await store.read("providers/anthropic.yaml")).toBeNull();
    });

    it("writes the files without a commit when the workspace has no history", async () => {
      const { store, input } = await workspace(false);

      await saveChoiceFiles(input, choice);

      expect(await store.read("models.yaml")).toBe(choice["models.yaml"]);
      expect(await store.read("providers/anthropic.yaml")).toBe(choice["providers/anthropic.yaml"]);
    });
  });
});
