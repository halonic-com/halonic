import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import { joinInboxNotices } from "../notices/merge-notices.ts";
import { settled } from "./fake-sandbox.test-helper.ts";
import { type HeldAgent, type HeldAgentRef, onHoldSetup } from "./on-hold-setup-source.ts";

const writer: HeldAgent = {
  hubId: "acme",
  id: "writer",
  name: "Writer",
  since: "2026-11-20T09:00:00.000Z",
};
const sorter: HeldAgent = {
  hubId: "acme",
  id: "sorter",
  name: "Sorter",
  since: "2026-11-20T10:00:00.000Z",
};

/** An Inbox with the on-hold source, over held agents a test sets. */
function onHoldInbox(initial: readonly HeldAgent[]) {
  let held = initial;
  let unread: readonly HeldAgentRef[] = [];
  const listeners = new Set<() => void>();
  const { source, notices } = onHoldSetup(
    {
      list: async () => ({ held, unread }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    () => new Date("2026-11-20T12:00:00.000Z"),
  );
  const inbox = new Inbox(fakeRuns([]).runs);
  inbox.addSetupSource(source);
  return {
    inbox,
    notices,
    source,
    set: async (value: readonly HeldAgent[], unreadNow: readonly HeldAgentRef[] = []) => {
      held = value;
      unread = unreadNow;
      for (const listener of [...listeners]) listener();
      await settled();
    },
  };
}

verifies("inbox.on-hold-row", () => {
  it("lists one item per held agent, titled by the agent, with no routine count", async () => {
    const t = onHoldInbox([writer, sorter]);
    await settled();
    expect(t.inbox.state.items).toMatchObject([
      {
        kind: "setup",
        key: "setup:sandbox-on-hold:acme/sorter",
        title: "Confirm again: Sorter runs in the sandbox for now",
        progress: "Sorter's file changed since you chose On this computer.",
        changedAt: "2026-11-20T10:00:00.000Z",
      },
      {
        key: "setup:sandbox-on-hold:acme/writer",
        title: "Confirm again: Writer runs in the sandbox for now",
      },
    ]);
    expect(t.inbox.signal().value).toBe(2);
  });

  it("says Fixed, uncounted, once the agent isn't on hold, and leaves a notice once released", async () => {
    const t = onHoldInbox([writer]);
    await settled();
    await t.set([]);
    const [item] = t.inbox.state.items;
    expect(item).toMatchObject({
      key: "setup:sandbox-on-hold:acme/writer",
      title: "Confirm again: Writer runs in the sandbox for now",
      fixed: true,
    });
    expect(t.inbox.signal().value).toBe(0);
    expect(await t.notices.list()).toEqual([]);

    if (item?.kind !== "setup") throw new Error("expected the setup item");
    t.inbox.releaseSetup(item);
    await settled();
    expect(t.inbox.state.items).toEqual([]);
    expect(await t.notices.list()).toEqual([
      {
        kind: "sandbox-fixed",
        key: "sandbox-fixed:on-hold:acme/writer:2026-11-20T12:00:00.000Z",
        at: "2026-11-20T12:00:00.000Z",
        title:
          "Confirm again: Writer runs in the sandbox for now · Writer's file changed since you chose On this computer.",
      },
    ]);
  });

  it("needs you again when the agent is on hold again before its Fixed item went, and leaves no notice", async () => {
    const t = onHoldInbox([writer]);
    await settled();
    await t.set([]);
    await t.set([writer]);
    expect(t.inbox.state.items).toMatchObject([{ key: "setup:sandbox-on-hold:acme/writer" }]);
    expect(t.inbox.state.items[0]).not.toHaveProperty("fixed");
    expect(t.inbox.signal().value).toBe(1);
    t.inbox.releaseSetup({ ...writerItem(), fixed: true });
    expect(await t.notices.list()).toEqual([]);
  });

  it("keeps a listed agent's item as it was when its choice couldn't be read, and leaves no notice", async () => {
    const t = onHoldInbox([writer, sorter]);
    await settled();
    await t.set([sorter], [{ hubId: "acme", id: "writer" }]);
    expect(t.inbox.state.items).toMatchObject([
      { key: "setup:sandbox-on-hold:acme/sorter" },
      { key: "setup:sandbox-on-hold:acme/writer", changedAt: writer.since },
    ]);
    expect(t.inbox.state.items[1]).not.toHaveProperty("fixed");
    expect(t.inbox.signal().value).toBe(2);
    t.inbox.releaseSetup(writerItem());
    expect(await t.notices.list()).toEqual([]);

    // Read again and not on hold any more: now it is fixed.
    await t.set([sorter]);
    const item = t.inbox.state.items.find((each) => each.key.endsWith("acme/writer"));
    expect(item).toMatchObject({ fixed: true });
  });

  it("gives an unlisted agent whose choice couldn't be read no item", async () => {
    const t = onHoldInbox([]);
    await settled();
    await t.set([], [{ hubId: "acme", id: "writer" }]);
    expect(t.inbox.state.items).toEqual([]);
  });

  it("dismisses only its own notice and keeps nothing after a restart", async () => {
    const t = onHoldInbox([writer]);
    await settled();
    await t.set([]);
    const [item] = t.inbox.state.items;
    if (item?.kind !== "setup") throw new Error("expected the setup item");
    t.inbox.releaseSetup(item);
    const listener = vi.fn();
    t.notices.subscribe(listener);
    t.notices.dismiss("sandbox-fixed:2026-11-20T12:00:00.000Z");
    expect(listener).not.toHaveBeenCalled();
    t.notices.dismiss("sandbox-fixed:on-hold:acme/writer:2026-11-20T12:00:00.000Z");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await t.notices.list()).toEqual([]);

    const restarted = onHoldInbox([]);
    await settled();
    expect(restarted.inbox.state.items).toEqual([]);
  });

  it("lists the Inbox's own notices together, newest first, and sends a dismissal to each", async () => {
    const notice = (at: string) => ({
      kind: "sandbox-fixed" as const,
      key: `sandbox-fixed:${at}`,
      at,
      title: at,
    });
    const source = (at: string) => {
      const notices: InboxNotices = {
        list: async () => [notice(at)],
        subscribe: () => () => {},
        dismiss: vi.fn(),
      };
      return notices;
    };
    const sandbox = source("2026-11-20T09:00:00.000Z");
    const onHold = source("2026-11-20T12:00:00.000Z");
    const joined = joinInboxNotices([sandbox, onHold]);
    expect((await joined?.list())?.map((each) => each.at)).toEqual([
      "2026-11-20T12:00:00.000Z",
      "2026-11-20T09:00:00.000Z",
    ]);
    joined?.dismiss("sandbox-fixed:x");
    expect(sandbox.dismiss).toHaveBeenCalledWith("sandbox-fixed:x");
    expect(onHold.dismiss).toHaveBeenCalledWith("sandbox-fixed:x");
    expect(joinInboxNotices([sandbox])).toBe(sandbox);
    expect(joinInboxNotices([])).toBeUndefined();
  });
});

function writerItem() {
  return {
    kind: "setup" as const,
    key: "setup:sandbox-on-hold:acme/writer",
    provider: "sandbox-on-hold",
    account: "acme/writer",
    title: "Confirm again: Writer runs in the sandbox for now",
    progress: "Writer's file changed since you chose On this computer.",
    changedAt: writer.since,
  };
}
