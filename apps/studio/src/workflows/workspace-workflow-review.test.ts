import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { ReviewService } from "@halonicjs/app";
import { contentDigest } from "@halonicjs/std";
import type { ItemReview } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceWorkflowReview } from "./workspace-workflow-review.ts";
import { setup as workflowsSetup } from "./workspace-workflows.test-helper.ts";

const reply = { hubId: "acme", id: "reply" };
const replyPath = "hubs/acme/workflows/reply.workflow.yaml";
const card = { chatId: "c1", cardId: "k1" };

/** `reply`: a writer drafts, then the workflow is done. */
const draftThenDone =
  "id: reply\nname: Reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on: [{ to: done }]\n  done:\n    type: final\n";

/** The assistant renamed `reply` and put a new step, `check`, between `draft` and `done`. */
const withCheck =
  "id: reply\nname: Mail reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on: [{ to: check }]\n  check:\n    agent: checker\n    on: [{ to: done }]\n  done:\n    type: final\n";

/** A workflows review over a review service on an in-memory workspace where the assistant wrote {@link withCheck}. */
async function setup() {
  const store = new MemoryDefinitionStore({ [replyPath]: draftThenDone });
  const review = new ReviewService({
    store,
    records: new MemoryDefinitionStore(),
    digest: webCryptoDigest,
    isTrusted: () => true,
  });
  const workflows = new WorkspaceWorkflowReview({
    review,
    pathOf: async (ref) => `hubs/${ref.hubId}/workflows/${ref.id}.workflow.yaml`,
  });
  const expected = await contentDigest(draftThenDone, webCryptoDigest);
  const outcome = await review.propose({ path: replyPath, content: withCheck, expected, card });
  expect(outcome.status).toBe("written");
  const changes = async (): Promise<ItemReview> => {
    const found = await workflows.changesIn(reply);
    if (found === null) throw new Error("no changes to review");
    return found;
  };
  const change = (review: ItemReview, id: string) => {
    const found = review.changes.find((one) => one.id === id);
    if (found === undefined) throw new Error(`no change ${id}`);
    return found;
  };
  return { store, workflows, changes, change };
}

verifies("studio.workspace-workflow-review", () => {
  describe("WorkspaceWorkflowReview", () => {
    it("gives one change per field and per step, with the changes each needs", async () => {
      const { changes, change } = await setup();
      const review = await changes();
      expect(review).toMatchObject({ path: replyPath, whole: false });
      expect(review.changes.map((one) => one.id)).toEqual([
        "field:name",
        "step:draft",
        "step:check",
      ]);
      expect(change(review, "field:name").before).toEqual({ value: "Reply" });
      expect(change(review, "step:draft").needs).toEqual(["step:check"]);
    });

    it("rejects the arrows to an added step along with the step", async () => {
      const { store, workflows, changes, change } = await setup();
      const review = await changes();
      const check = change(review, "step:check");
      const decided = await workflows.reject({ kind: "change", review, change: check });
      expect(decided.status).toBe("done");
      const text = await store.read(replyPath);
      expect(text).not.toContain("check");
      expect(text).toContain("name: Mail reply");
      expect((await changes()).changes.map((one) => one.id)).toEqual(["field:name"]);
    });

    it("accepts the step an arrow goes to along with the arrow", async () => {
      const { store, workflows, changes, change } = await setup();
      const review = await changes();
      const draft = change(review, "step:draft");
      const decided = await workflows.accept({ kind: "change", review, change: draft });
      expect(decided.status).toBe("done");
      expect(await store.read(replyPath)).toBe(withCheck);
      expect((await changes()).changes.map((one) => one.id)).toEqual(["field:name"]);
    });
  });
});

verifies("studio.workspace-workflow-review", () => {
  describe("WorkspaceWorkflows.filePath", () => {
    it("finds the workflow's file, and refuses a workflow that isn't there", async () => {
      const { host } = workflowsSetup();
      expect(await host.filePath(reply)).toBe(replyPath);
      await expect(host.filePath({ hubId: "acme", id: "gone" })).rejects.toThrow();
    });
  });
});
