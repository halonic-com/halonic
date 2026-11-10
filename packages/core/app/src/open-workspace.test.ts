import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openWorkspace, reviewServiceKey, workspaceFilesKey } from "./open-workspace.ts";
import { reviewRecordPath } from "./review-record.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerk = "agents/clerk.agent.yaml";

verifies("app.review-record", () => {
  it("keeps an opened workspace's records in their own store, never in the workspace", async () => {
    const store = new TestDefinitionStore({ [clerk]: "name: Clerk\n" }, digest);
    const reviewRecords = new TestDefinitionStore({}, digest);
    const scope = openWorkspace({
      store,
      reviewRecords,
      digest,
      isTrusted: () => true,
      onListenerError: (error) => {
        throw error;
      },
    });
    const versionBefore = await store.version();
    const review = scope.services.get(reviewServiceKey);
    await review.propose({
      path: clerk,
      content: "name: Clerk 2\n",
      expected: await contentDigest("name: Clerk\n", digest),
      card: { chatId: "c1", cardId: "k1" },
    });
    expect([...store.files.keys()]).toEqual([clerk]);
    expect([...reviewRecords.files.keys()]).toEqual([await reviewRecordPath(clerk, digest)]);

    // An Accept changes only the record, so the workspace's version stays.
    const versionWritten = await store.version();
    expect(versionWritten).not.toBe(versionBefore);
    await review.accept({ kind: "file", path: clerk });
    expect(reviewRecords.files.size).toBe(0);
    expect(await store.version()).toBe(versionWritten);
    await scope.close();
  });
});

verifies("app.review-other-writes-merge", () => {
  it("sends an opened workspace's saves through the review service's write hook", async () => {
    const store = new TestDefinitionStore(
      { [clerk]: "name: Clerk\nrole: files\nmodel: fast\n" },
      digest,
    );
    const scope = openWorkspace({
      store,
      reviewRecords: new TestDefinitionStore({}, digest),
      digest,
      isTrusted: () => true,
      onListenerError: (error) => {
        throw error;
      },
    });
    const review = scope.services.get(reviewServiceKey);
    await review.propose({
      path: clerk,
      content: "name: Clerk\nrole: files\nmodel: smart\n",
      expected: await contentDigest("name: Clerk\nrole: files\nmodel: fast\n", digest),
      card: { chatId: "c1", cardId: "k1" },
    });
    const files = scope.services.get(workspaceFilesKey);
    files.change("Renamed the agent", { [clerk]: "name: Clerk 2\nrole: files\nmodel: smart\n" });
    await files.save();
    // The rename went into the baseline, so only the assistant's model change is left to review.
    const changes = await review.changesIn(clerk);
    expect(changes?.parts.map((part) => part.added)).toEqual([["model: smart\n"]]);
    await scope.close();
  });
});
