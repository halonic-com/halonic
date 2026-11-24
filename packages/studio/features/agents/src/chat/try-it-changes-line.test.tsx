// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { noTryItChanges, type TryItChanges, tryItChangesSentences } from "./try-it-changes.ts";
import { TryItChangesLine, type WatchTryItChanges } from "./try-it-changes-line.tsx";

afterEach(unmount);

const changes = (some: Partial<TryItChanges>): TryItChanges => ({
  ...noTryItChanges,
  workspaceName: "Acme",
  ...some,
});

/** A watch the test drives: `give` sends the listener new changes; `stopped` tells it stopped. */
function fakeWatch(first: TryItChanges) {
  let listener: ((changes: TryItChanges) => void) | undefined;
  let stopped = false;
  const watch: WatchTryItChanges = (heard) => {
    listener = heard;
    heard(first);
    return () => {
      stopped = true;
    };
  };
  const give = (next: TryItChanges) => act(() => listener?.(next));
  return { watch, give, isStopped: () => stopped };
}

verifies("agents.chat.try-it-changes-line", () => {
  it("says how many changes Try it includes, one or more", () => {
    expect(tryItChangesSentences(changes({ included: 3 }))).toEqual([
      "Includes 3 changes from the assistant you haven't accepted yet.",
    ]);
    expect(tryItChangesSentences(changes({ included: 1 }))).toEqual([
      "Includes 1 change from the assistant you haven't accepted yet.",
    ]);
  });

  it("names what it leaves out by reason, in the flow's order, then from before trust", () => {
    const sentences = tryItChangesSentences(
      changes({
        included: 2,
        leftOut: [
          { reason: "permissions", changes: 1 },
          { reason: "trust-and-sandbox", changes: 2 },
          { reason: "connections", changes: 0 },
          { reason: "models", changes: 1 },
        ],
        beforeTrust: 3,
      }),
    );
    expect(sentences).toEqual([
      "Includes 2 changes from the assistant you haven't accepted yet.",
      "Leaves out 1 change to permissions until you accept it.",
      "Leaves out 2 changes to sandbox until you accept them.",
      "Leaves out 1 change to models until you accept it.",
      "Leaves out 3 changes the assistant made before you trusted Acme.",
    ]);
  });

  it("says only what it leaves out when nothing in the item is included", () => {
    expect(tryItChangesSentences(changes({ beforeTrust: 1 }))).toEqual([
      "Leaves out 1 change the assistant made before you trusted Acme.",
    ]);
  });

  it("shows the line from the watch, follows it, and goes when nothing is left", async () => {
    const { watch, give } = fakeWatch(changes({ included: 3 }));
    const shown = await show(<TryItChangesLine watch={watch} />);
    expect(shown.textContent).toBe(
      "Includes 3 changes from the assistant you haven't accepted yet.",
    );
    give(changes({ included: 1, leftOut: [{ reason: "connections", changes: 2 }] }));
    expect(shown.textContent).toBe(
      "Includes 1 change from the assistant you haven't accepted yet." +
        "Leaves out 2 changes to connections until you accept them.",
    );
    give(changes({}));
    expect(shown.textContent).toBe("");
  });

  it("stops watching when it goes", async () => {
    const { watch, isStopped } = fakeWatch(changes({ included: 1 }));
    await show(<TryItChangesLine watch={watch} />);
    unmount();
    expect(isStopped()).toBe(true);
  });

  it("shows nothing where the host has no watch", async () => {
    expect((await show(<TryItChangesLine />)).textContent).toBe("");
  });
});
