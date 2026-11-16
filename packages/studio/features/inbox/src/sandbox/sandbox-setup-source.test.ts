import type { SandboxStartResult } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, expect, it } from "vitest";
import { completedRun, refusedRun, sandboxInbox, settled } from "./fake-sandbox.test-helper.ts";
import { refusedRoutineRuns } from "./sandbox-setup-source.ts";

verifies("inbox.sandbox-row", () => {
  // The card's view loads lazily. The first import transforms the view and everything behind it,
  // which on a busy CI machine can take longer than a test's own 5 s (and tests run in random
  // order, so any of them can be first). Do it up front under the hook's longer limit.
  beforeAll(async () => {
    await import("../ui/sandbox-setup-view.tsx");
  }, 60_000);

  it("counts the routines the sandbox refused, once each", () => {
    const runs = [
      refusedRun("a", "daily", "2026-11-10T06:00:00.000Z"),
      refusedRun("b", "daily", "2026-11-10T07:00:00.000Z"),
      refusedRun("c", "weekly", "2026-11-10T08:00:00.000Z"),
    ];
    expect(refusedRoutineRuns(runs).map((run) => run.id)).toEqual(["c", "b", "a"]);
  });

  it("leaves out a hand-started run, a test run, another failure and a superseded refusal", () => {
    const manual = refusedRun("m", "x", "2026-11-10T06:00:00.000Z", { trigger: null });
    const test = refusedRun("t", "x", "2026-11-10T06:00:00.000Z", { kind: "test" });
    const other = refusedRun("o", "x", "2026-11-10T06:00:00.000Z", { reason: "budget" });
    const old = refusedRun("old", "daily", "2026-11-10T06:00:00.000Z");
    const later = completedRun("ok", "2026-11-10T07:00:00.000Z", "daily");
    expect(refusedRoutineRuns([manual, test, other, old, later])).toEqual([]);
  });

  it("is superseded only by a later run of the same routine, not by one that never used the sandbox", () => {
    const refused = refusedRun("a", "daily", "2026-11-10T06:00:00.000Z");
    const hourly = completedRun("h", "2026-11-10T07:00:00.000Z", "hourly");
    const early = refusedRun("e", "hourly", "2026-11-10T08:00:00.000Z", { reason: "budget" });
    expect(refusedRoutineRuns([refused, hourly, early]).map((run) => run.id)).toEqual(["a"]);
    const daily = completedRun("d", "2026-11-10T09:00:00.000Z", "daily");
    expect(refusedRoutineRuns([refused, hourly, daily])).toEqual([]);
  });

  it("lists one item for this computer, titled with the count and the reason's sentence", async () => {
    const t = sandboxInbox([
      refusedRun("a", "daily", "2026-11-10T06:00:00.000Z"),
      refusedRun("c", "weekly", "2026-11-10T08:00:00.000Z"),
    ]);
    await settled();
    expect(t.inbox.state.items).toMatchObject([
      {
        kind: "setup",
        key: "setup:sandbox:this-computer",
        title: "2 routines didn't run",
        progress: "bubblewrap isn't installed, and the sandbox needs it.",
      },
    ]);
    expect(t.inbox.signal().value).toBe(1);
  });

  it("says 1 routine for one, and reads a missing or unknown reason as other", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    t.reason("from-the-future");
    await t.inbox.refresh();
    expect(t.inbox.state.items[0]).toMatchObject({
      title: "1 routine didn't run",
      progress: "Halonic can't tell what the sandbox is missing.",
    });
  });

  it("has no item when nothing was refused", async () => {
    const t = sandboxInbox([completedRun("ok", "2026-11-10T07:00:00.000Z")]);
    await settled();
    expect(t.inbox.state.items).toEqual([]);
  });

  it("drops the count at once when the check passes and keeps a fixed item that isn't counted", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    expect(t.inbox.signal().value).toBe(1);

    // The card's control is what the view calls; it is reached through the loaded view's props.
    const { check } = await controlOf(t);
    await check();
    await settled();
    expect(t.inbox.state.items).toMatchObject([
      { key: "setup:sandbox:this-computer", fixed: true, title: "The sandbox is ready" },
    ]);
    expect(t.inbox.signal().value).toBe(0);
  });

  it("lets the fixed item go once it is released, and brings a new refusal back", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    await (await controlOf(t)).check();
    await settled();
    const [item] = t.inbox.state.items;
    if (item?.kind !== "setup") throw new Error("expected the fixed item");
    t.inbox.releaseSetup(item);
    await settled();
    expect(t.inbox.state.items).toEqual([]);

    t.set([
      refusedRun("a", "daily", "2026-11-10T06:00:00.000Z"),
      refusedRun("n", "daily", "2026-11-10T13:00:00.000Z"),
    ]);
    await settled();
    expect(t.inbox.state.items).toMatchObject([{ title: "1 routine didn't run" }]);
  });

  it("keeps the row while the sandbox is still refused", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")], {
      ok: false,
      reason: "ripgrep-missing",
    });
    await settled();
    const result = await (await controlOf(t)).check();
    await settled();
    expect(result).toEqual({ ok: false, reason: "ripgrep-missing" });
    expect(t.inbox.state.items).toMatchObject([{ title: "1 routine didn't run" }]);
  });

  it("rejects when the check can't run, and keeps the row", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    t.throwOnCheck();
    await expect((await controlOf(t)).check()).rejects.toThrow("no host");
    expect(t.inbox.state.items).toHaveLength(1);
  });

  it("shows a refusal again after a restart, until a later run or a passing check", async () => {
    const runs = [refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")];
    const first = sandboxInbox(runs);
    await settled();
    await (await controlOf(first)).check();
    await settled();
    expect(first.inbox.signal().value).toBe(0);

    const restarted = sandboxInbox(runs);
    await settled();
    expect(restarted.inbox.signal().value).toBe(1);
    restarted.set([...runs, completedRun("ok", "2026-11-10T07:00:00.000Z", "daily")]);
    await settled();
    expect(restarted.inbox.state.items).toEqual([]);
  });
});

verifies("inbox.sandbox-fixed-notice", () => {
  it("leaves one notice when the fixed row is released, with its own dismissal", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    await (await controlOf(t)).check();
    await settled();
    expect(await t.notices.list()).toEqual([]);
    const [item] = t.inbox.state.items;
    if (item?.kind !== "setup") throw new Error("expected the fixed item");
    t.inbox.releaseSetup(item);
    const [notice] = await t.notices.list();
    expect(notice).toMatchObject({ kind: "sandbox-fixed", at: "2026-11-10T12:00:00.000Z" });
    t.notices.dismiss("sandbox-fixed:other");
    expect(await t.notices.list()).toHaveLength(1);
    t.notices.dismiss(notice?.key ?? "");
    expect(await t.notices.list()).toEqual([]);
  });

  it("goes straight to a notice when a check passed elsewhere, with no fixed row", async () => {
    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    t.pass();
    await settled();
    expect(t.inbox.state.items).toEqual([]);
    expect(await t.notices.list()).toMatchObject([{ kind: "sandbox-fixed" }]);
  });

  it("makes no notice for a pass elsewhere when nothing was refused, or for the card's own check", async () => {
    const none = sandboxInbox([]);
    await settled();
    none.pass();
    await settled();
    expect(await none.notices.list()).toEqual([]);

    const t = sandboxInbox([refusedRun("a", "daily", "2026-11-10T06:00:00.000Z")]);
    await settled();
    await (await controlOf(t)).check();
    t.pass();
    await settled();
    expect(t.inbox.state.items).toMatchObject([{ fixed: true }]);
    expect(await t.notices.list()).toEqual([]);
  });
});

/** The card's control, as the loaded view builds it: its `check` and `runs`. */
async function controlOf(t: ReturnType<typeof sandboxInbox>) {
  const loaded = (await t.source.view?.load()) as {
    SandboxSetupView: (props: never) => {
      props: { control: { check(): Promise<SandboxStartResult> } };
    };
  };
  const element = loaded.SandboxSetupView({} as never);
  return element.props.control;
}
