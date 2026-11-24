import type { FileReview, LeftOutFile, TryItSource } from "@halonicjs/app";
import type { TryItChanges } from "@halonicjs/studio-feature-agents/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type TryItChangesParts, tryItChangesOf, watchTryItChanges } from "./try-it-changes.ts";

const agentPath = "acme/agents/sorter.yaml";

/** A file review with `count` line changes; only the parts' number matters here. */
const reviewWith = (count: number, deleted = false) =>
  ({ deleted, parts: Array.from({ length: count }, () => ({})) }) as unknown as FileReview;

/** A review service with these left-out files and these reviews by path; `changed` fires its listeners. */
function fakeReview(state: { leftOut: LeftOutFile[]; reviews: Record<string, FileReview | null> }) {
  const listeners = new Set<() => void>();
  const asked: { item?: string }[] = [];
  const review: TryItChangesParts["review"] = {
    tryItSource: async (options = {}) => {
      asked.push(options);
      const total = state.leftOut.reduce((sum, file) => sum + file.changes, 0);
      const beforeTrust = state.leftOut
        .filter((file) => file.reason === "before-trust")
        .reduce((sum, file) => sum + file.changes, 0);
      return { leftOut: { total, beforeTrust, files: state.leftOut } } as unknown as TryItSource;
    },
    changesIn: async (path) => state.reviews[path] ?? null,
    onDidChange: (listener) => {
      const heard = () => listener([]);
      listeners.add(heard);
      return () => listeners.delete(heard);
    },
  };
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return { review, asked, changed, listenerCount: () => listeners.size };
}

const partsOf = (
  review: TryItChangesParts["review"],
  errors: unknown[] = [],
): TryItChangesParts => ({
  review,
  workspaceName: "Acme",
  reportError: (error) => errors.push(error),
});

/** Lets the pending reads finish: each is a few awaited promises, with no timer. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

verifies("studio.try-it-changes", () => {
  it("counts the item's changes less those left out of it, and every left-out change by reason", async () => {
    const { review, asked } = fakeReview({
      leftOut: [
        { path: agentPath, reason: "permissions", changes: 1 },
        { path: "acme/skills/tone.md", reason: "connections", changes: 2 },
      ],
      reviews: { [agentPath]: reviewWith(3) },
    });
    const changes = await tryItChangesOf(partsOf(review), async () => agentPath);
    expect(asked).toEqual([{ item: agentPath }]);
    expect(changes).toEqual({
      included: 2,
      leftOut: [
        { reason: "permissions", changes: 1 },
        { reason: "trust-and-sandbox", changes: 0 },
        { reason: "connections", changes: 2 },
        { reason: "models", changes: 0 },
      ],
      beforeTrust: 0,
      workspaceName: "Acme",
    } satisfies TryItChanges);
  });

  it("counts a deleted file as one change, and before-trust changes apart", async () => {
    const { review } = fakeReview({
      leftOut: [{ path: "acme/agents/other.yaml", reason: "before-trust", changes: 3 }],
      reviews: { [agentPath]: reviewWith(0, true) },
    });
    const changes = await tryItChangesOf(partsOf(review), async () => agentPath);
    expect(changes.included).toBe(1);
    expect(changes.beforeTrust).toBe(3);
    expect(changes.leftOut.every((one) => one.changes === 0)).toBe(true);
  });

  it("reads again when the review records change, and gives nothing after it stops", async () => {
    const state = {
      leftOut: [],
      reviews: { [agentPath]: reviewWith(2) } as Record<string, FileReview | null>,
    };
    const fake = fakeReview(state);
    const heard: number[] = [];
    const stop = watchTryItChanges(
      partsOf(fake.review),
      async () => agentPath,
      (changes) => heard.push(changes.included),
    );
    await settle();
    state.reviews[agentPath] = null;
    fake.changed();
    await settle();
    expect(heard).toEqual([2, 0]);
    fake.changed();
    stop();
    await settle();
    expect(heard).toEqual([2, 0]);
    expect(fake.listenerCount()).toBe(0);
  });

  it("gives only the newest answer when reads overlap", async () => {
    const fake = fakeReview({ leftOut: [], reviews: { [agentPath]: reviewWith(1) } });
    const heard: number[] = [];
    // The first read waits for its path until the second read has finished.
    let releaseFirst: (path: string) => void = () => {};
    const paths = [
      new Promise<string>((resolve) => (releaseFirst = resolve)),
      Promise.resolve(agentPath),
    ];
    let reads = 0;
    const itemPath = () => paths[reads++] ?? Promise.resolve(agentPath);
    watchTryItChanges(partsOf(fake.review), itemPath, (changes) => heard.push(changes.included));
    fake.changed();
    await settle();
    releaseFirst(agentPath);
    await settle();
    expect(heard).toEqual([1]);
    expect(reads).toBe(2);
  });

  it("reports a read that fails, and gives the listener nothing", async () => {
    const { review } = fakeReview({ leftOut: [], reviews: {} });
    const errors: unknown[] = [];
    const heard: TryItChanges[] = [];
    const gone = new Error("not_found");
    watchTryItChanges(
      partsOf(review, errors),
      () => Promise.reject(gone),
      (changes) => heard.push(changes),
    );
    await settle();
    expect(errors).toEqual([gone]);
    expect(heard).toEqual([]);
  });
});
