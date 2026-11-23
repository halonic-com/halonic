import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { ReviewService } from "@halonicjs/app";
import { contentDigest } from "@halonicjs/std";
import type { AgentRef, AgentReview } from "@halonicjs/studio-feature-agents/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceAgentReview } from "./workspace-agent-review.ts";
import { writerFile } from "./workspace-agents.test-helper.ts";

const writer: AgentRef = { hubId: "acme", id: "writer" };
const writerPath = "hubs/acme/agents/writer.agent.yaml";
const editorPath = "hubs/acme/agents/editor.agent.yaml";
const card = { chatId: "c1", cardId: "k1" };

const renamed = "id: writer\nname: Mail writer\ndescription: Drafts replies.\nmodel: large\n";

/** An agents review over a review service on an in-memory workspace holding `files`. */
function setup(files: Record<string, string>) {
  const store = new MemoryDefinitionStore(files);
  const review = new ReviewService({
    store,
    records: new MemoryDefinitionStore(),
    digest: webCryptoDigest,
    isTrusted: () => true,
  });
  const agents = new WorkspaceAgentReview({
    review,
    pathOf: async (ref) => `hubs/${ref.hubId}/agents/${ref.id}.agent.yaml`,
  });
  /** The assistant writes `content` to `path`, as `propose_file` does. */
  const seen = { ...files };
  const propose = async (path: string, content: string) => {
    const old = seen[path];
    const expected = old === undefined ? "absent" : await contentDigest(old, webCryptoDigest);
    const outcome = await review.propose({ path, content, expected, card });
    expect(outcome.status).toBe("written");
    seen[path] = content;
  };
  const changes = async (): Promise<AgentReview> => {
    const found = await agents.changesIn(writer);
    if (found === null) throw new Error("no changes to review");
    return found;
  };
  return { store, agents, propose, changes };
}

verifies("studio.workspace-agent-review", () => {
  describe("WorkspaceAgentReview", () => {
    it("gives one change per field, with the value from before", async () => {
      const { agents, propose, changes } = setup({ [writerPath]: writerFile });
      expect(await agents.changesIn(writer)).toBeNull();
      await propose(writerPath, renamed);
      const review = await changes();
      expect(review).toMatchObject({ path: writerPath, whole: false });
      expect(review.changes.map((change) => change.id)).toEqual(["field:name", "field:model"]);
      expect(review.changes[1]).toMatchObject({ parts: [["model"]], before: { value: "fast" } });
    });

    it("rejects one change and leaves the other to review", async () => {
      const { store, agents, propose, changes } = setup({ [writerPath]: writerFile });
      await propose(writerPath, renamed);
      const review = await changes();
      const model = review.changes[1];
      if (model === undefined) throw new Error("no model change");
      const decided = await agents.reject({ kind: "change", review, change: model });
      expect(decided.status).toBe("done");
      expect(await store.read(writerPath)).toContain("model: fast");
      expect((await changes()).changes.map((change) => change.id)).toEqual(["field:name"]);
    });

    it("answers stale for a change read before the file changed", async () => {
      const { agents, propose, changes } = setup({ [writerPath]: writerFile });
      await propose(writerPath, renamed);
      const old = await changes();
      const model = old.changes[1];
      if (model === undefined) throw new Error("no model change");
      await propose(writerPath, renamed.replace("large", "huge"));
      const decided = await agents.accept({ kind: "change", review: old, change: model });
      expect(decided).toEqual({ status: "stale" });
    });

    it("decides a file the assistant created as a whole", async () => {
      const { store, agents, propose, changes } = setup({});
      await propose(writerPath, writerFile);
      const review = await changes();
      expect(review).toMatchObject({ whole: true, changes: [{ sentence: "New", parts: [] }] });
      const [created] = review.changes;
      if (created === undefined) throw new Error("no change");
      expect((await agents.reject({ kind: "change", review, change: created })).status).toBe(
        "done",
      );
      expect(await store.list()).not.toContain(writerPath);
    });

    it("accepts all as one step that undo takes back", async () => {
      const { agents, propose } = setup({ [writerPath]: writerFile });
      await propose(writerPath, renamed);
      const decided = await agents.accept({ kind: "all", path: writerPath });
      if (decided.status !== "done") throw new Error(`not done: ${decided.status}`);
      expect(await agents.changesIn(writer)).toBeNull();
      expect(await decided.undo()).toBe("done");
      expect((await agents.changesIn(writer))?.changes).toHaveLength(2);
    });

    it("tells the page about its own agent's file only", async () => {
      const { agents, propose } = setup({ [writerPath]: writerFile, [editorPath]: writerFile });
      const listener = vi.fn();
      const stop = agents.subscribe(writer, listener);
      // The path is looked up first; let it settle.
      await Promise.resolve();
      await propose(editorPath, renamed);
      expect(listener).not.toHaveBeenCalled();
      await propose(writerPath, renamed);
      expect(listener).toHaveBeenCalled();
      stop();
    });
  });
});
