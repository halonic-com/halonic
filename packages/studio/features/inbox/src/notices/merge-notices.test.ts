import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { InboxNotice, InboxNotices } from "./inbox-notices.ts";
import { mergeNotices } from "./merge-notices.ts";

const fixed = (at: string): InboxNotice => ({
  kind: "sandbox-fixed",
  key: `sandbox-fixed:${at}`,
  at,
  title: "ready",
});
const failed = (at: string): InboxNotice => ({
  kind: "failed-run",
  key: `failed-run:acme/daily:${at}`,
  routineId: "acme/daily",
  runId: "r",
  hubId: "acme",
  at,
  count: 1,
  fixed: false,
  title: "Daily failed",
});

function source(notices: readonly InboxNotice[]) {
  const dismiss = vi.fn();
  const notices_: InboxNotices = {
    list: async () => notices,
    subscribe: () => () => {},
    dismiss,
  };
  return { source: notices_, dismiss };
}

verifies("inbox.sandbox-row", () => {
  it("returns the one source there is", () => {
    const one = source([]).source;
    expect(mergeNotices(one, undefined)).toBe(one);
    expect(mergeNotices(undefined, one)).toBe(one);
    expect(mergeNotices(undefined, undefined)).toBeUndefined();
  });

  it("lists both newest first and sends a dismissal to the source that holds the notice", async () => {
    const app = source([failed("2026-11-16T06:00:00.000Z")]);
    const sandbox = source([fixed("2026-11-16T09:00:00.000Z")]);
    const merged = mergeNotices(app.source, sandbox.source);
    expect((await merged?.list())?.map((notice) => notice.kind)).toEqual([
      "sandbox-fixed",
      "failed-run",
    ]);
    merged?.dismiss("sandbox-fixed:2026-11-16T09:00:00.000Z");
    merged?.dismiss("failed-run:acme/daily:2026-11-16");
    expect(sandbox.dismiss).toHaveBeenCalledTimes(1);
    expect(app.dismiss).toHaveBeenCalledWith("failed-run:acme/daily:2026-11-16");
    expect(app.dismiss).toHaveBeenCalledTimes(1);
  });
});
