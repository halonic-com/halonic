import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { eventsSignalOf } from "./paperclip-provider.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

const openedAt = "2026-11-24T13:50:00.000Z";
const endedAt = "2026-11-24T14:00:01.000Z";

/** An invented open task with one confirmation card for the board, as Paperclip lists them. */
function launchTask(updatedAt: string) {
  return { id: "task-2", identifier: "ACME-9", title: "Launch", status: "in_progress", updatedAt };
}

function launchCard(extra: object = {}) {
  return {
    id: "card-1",
    kind: "request_confirmation",
    status: "pending",
    createdByAgentId: "agent-ada",
    payload: { version: 1, prompt: "Launch on Friday?" },
    createdAt: openedAt,
    ...extra,
  };
}

/** A desktop with `halonic` connected, one open card read into the local copy, and its events socket open. */
async function withOpenCard(): Promise<Desktop> {
  desktop = await startDesktop();
  desktop.paperclip.servesInbox = true;
  desktop.paperclip.tasks = [launchTask(openedAt)];
  desktop.paperclip.cards = { "task-2": [launchCard()] };
  await desktop.paperclipKey.handOver({
    workspace: desktop.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
  await desktop.wait(0);
  desktop.sockets.say({ kind: "open" });
  await settle();
  await desktop.wait(0);
  return desktop;
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Paperclip ends the card as `extra` says, and touches its task as it does. */
function endCard(on: Desktop, extra: object): void {
  on.paperclip.tasks = [launchTask(endedAt)];
  on.paperclip.cards = { "task-2": [launchCard({ resolvedAt: endedAt, ...extra })] };
}

/** The task's event arrives, and its batch's read runs: 300 ms, then the scheduler's turn. */
async function taskEvent(on: Desktop): Promise<void> {
  const signal = eventsSignalOf({
    kind: "event",
    event: {
      kind: "activity",
      action: "issue.thread_interaction_resolved",
      entityType: "issue",
      entityId: "task-2",
      createdAt: endedAt,
    },
  });
  if (signal !== undefined) on.sockets.say(signal);
  await settle();
  await on.wait(300);
  await on.wait(0);
}

async function launchCardState(on: Desktop): Promise<InboxItem["state"] | undefined> {
  const items = await on.studio.listInboxItems();
  return items.find((item) => item.question === "Launch on Friday?")?.state;
}

verifies("agent-host.paperclip-decided-elsewhere", () => {
  describe("a card decided in Paperclip", () => {
    it("is listed as answered, with who and when, within 2 seconds of its event", async () => {
      const on = await withOpenCard();
      expect(await launchCardState(on)).toEqual({ kind: "open" });

      endCard(on, { status: "accepted", resolvedByUserId: "user-board" });
      await taskEvent(on);

      expect(await launchCardState(on)).toEqual({
        kind: "answered",
        by: { kind: "person", name: "Board" },
        answer: { kind: "option", option: "accept" },
        answeredAt: endedAt,
      });
    });

    it("is listed as closed when it is cancelled or expires", async () => {
      for (const reason of ["cancelled", "expired"] as const) {
        const on = await withOpenCard();

        endCard(on, { status: reason });
        await taskEvent(on);

        expect(await launchCardState(on)).toEqual({ kind: "closed", reason, closedAt: endedAt });
        await on.close();
        desktop = undefined;
      }
    });

    it("catches up when the socket opens again after Paperclip was out of reach", async () => {
      const on = await withOpenCard();
      const dropped = eventsSignalOf({ kind: "closed", code: 1006, why: "closed" });
      if (dropped !== undefined) on.sockets.say(dropped);
      await settle();
      on.paperclip.offline = true;
      await on.wait(60_000);
      expect(on.sockets.opened).toHaveLength(2);

      endCard(on, { status: "accepted", resolvedByUserId: "user-board" });
      on.paperclip.offline = false;
      on.sockets.say({ kind: "open" });
      await settle();
      await on.wait(0);

      expect(await launchCardState(on)).toMatchObject({ kind: "answered", answeredAt: endedAt });
    });
  });
});
