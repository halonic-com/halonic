import { PaperclipMessaging, PaperclipTeamStatus } from "@halonicjs/adapter-paperclip-client";
import { openListener } from "@halonicjs/adapter-remote-gateway/testing";
import { PhoneRateLimits, phoneMessaging } from "@halonicjs/app-agent-host/remote-parts";
import type { InboxItem, MergeQueue } from "@halonicjs/ports";
import { GatewayClient } from "@halonicjs/studio-feature-remote/phone-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  acmeCard,
  acmeCompany,
  acmeKey,
  acmeTask,
  FakePaperclip,
} from "./fake-paperclip.test-helper.ts";
import { TestPhoneTunnel, until } from "./phone-gateway.test-helper.ts";

type Gateway = Awaited<ReturnType<typeof openListener>>;

const opened: Gateway[] = [];
const clients: GatewayClient[] = [];
const now = () => new Date("2026-11-24T10:10:00.000Z");
const acceptCard = `POST /api/issues/${acmeTask}/interactions/${acmeCard}/accept` as const;

afterEach(async () => {
  for (const client of clients.splice(0)) client.dispose();
  for (const gateway of opened.splice(0)) await gateway.stop();
});

/**
 * The desktop's side as the host builds it: the phone's allow-list view over
 * the Paperclip provider for Acme, with the host's per-phone rates.
 */
function desktopMessaging(paperclip: FakePaperclip) {
  const connection = { address: paperclip.address, key: acmeKey, fetch: paperclip.fetch };
  const messaging = new PaperclipMessaging({
    ...connection,
    connection: "acme",
    company: acmeCompany,
    label: "Paperclip · Acme",
    now,
  });
  const team = new PaperclipTeamStatus({
    ...connection,
    connection: "acme",
    company: acmeCompany,
    now,
  });
  const rates = new PhoneRateLimits({ now });
  return {
    view: phoneMessaging(messaging, team),
    rateLimitFor: (phoneKey: Uint8Array) => rates.forPhone(phoneKey),
  };
}

/** The real gateway serving Acme's Inbox, and a paired phone's client, its session open. */
async function pairedPhone() {
  const paperclip = new FakePaperclip();
  const gateway = await openListener({ messaging: desktopMessaging(paperclip) });
  opened.push(gateway);
  const client = new GatewayClient(
    new TestPhoneTunnel(await gateway.pairedClient()),
    "Work laptop",
  );
  clients.push(client);
  await until(client, (view) => view.canAnswer);
  return { paperclip, gateway, client };
}

/** The phone's Inbox, read in one page. */
async function inboxOf(client: GatewayClient): Promise<readonly InboxItem[]> {
  const page = await client.messaging.readList("inbox");
  if (page.kind !== "done") throw new Error(`The Inbox wasn't read: ${JSON.stringify(page)}`);
  return page.value.items as readonly InboxItem[];
}

/** The Inbox item whose question starts with `words`. */
function itemOf(items: readonly InboxItem[], words: string): InboxItem {
  const item = items.find((candidate) => JSON.stringify(candidate).includes(words));
  if (item === undefined) throw new Error(`No Inbox item says "${words}"`);
  return item;
}

verifies("integration.phone-messaging-interop", () => {
  describe("a paired phone's Inbox and queue through the real gateway and the desktop's view", () => {
    it("reads the Inbox: the card and the risky approval", async () => {
      const { paperclip, client } = await pairedPhone();
      const items = await inboxOf(client);
      expect(itemOf(items, "Launch on Friday?").risk ?? "normal").toBe("normal");
      expect(itemOf(items, "Hire a designer").risk).toBe("risky");
      expect(paperclip.unexpected).toEqual([]);
    });

    it("answers the test card, and the answer reaches Paperclip exactly once", async () => {
      const { paperclip, client } = await pairedPhone();
      const card = itemOf(await inboxOf(client), "Launch on Friday?");
      const outcome = await client.messaging.answer(card.id, { kind: "option", option: "accept" });
      expect(outcome).toEqual({
        kind: "done",
        value: expect.objectContaining({ outcome: "answered" }),
      });
      expect(paperclip.count(acceptCard)).toBe(1);
      expect(paperclip.unexpected).toEqual([]);
    });

    it("can't answer the risky approval, and Paperclip sees no answer", async () => {
      const { paperclip, client } = await pairedPhone();
      const approval = itemOf(await inboxOf(client), "Hire a designer");
      const outcome = await client.messaging.answer(approval.id, {
        kind: "option",
        option: "approve",
      });
      expect(outcome).toEqual({ kind: "refused", code: "not-allowed-remotely" });
      expect(paperclip.seen.filter((seen) => seen.startsWith("POST"))).toEqual([]);
      expect(paperclip.unexpected).toEqual([]);
    });

    it("reads the merge queue", async () => {
      const { paperclip, client } = await pairedPhone();
      const page = await client.messaging.readTeam("queue");
      if (page.kind !== "done") throw new Error(`The queue wasn't read: ${JSON.stringify(page)}`);
      const queues = page.value.items as readonly MergeQueue[];
      expect(queues.map((queue) => [queue.repo, queue.waiting])).toEqual([
        ["app", ["paperclip:acme:pull:acme%2Fapp:11", "paperclip:acme:pull:acme%2Fapp:12"]],
      ]);
      expect(paperclip.unexpected).toEqual([]);
    });

    it("is refused while Paperclip is offline, and nothing is answered", async () => {
      const { paperclip, client } = await pairedPhone();
      const card = itemOf(await inboxOf(client), "Launch on Friday?");
      paperclip.offline = true;
      const outcome = await client.messaging.answer(card.id, { kind: "option", option: "accept" });
      expect(outcome.kind).toBe("refused");
      expect(paperclip.count(acceptCard)).toBe(0);
      expect(paperclip.unexpected).toEqual([]);
    });

    it("sends nothing once the desktop's gateway has closed", async () => {
      const { paperclip, gateway, client } = await pairedPhone();
      const card = itemOf(await inboxOf(client), "Launch on Friday?");
      await gateway.stop();
      opened.splice(0);
      await until(client, (view) => !view.canAnswer);
      const outcome = await client.messaging.answer(card.id, { kind: "option", option: "accept" });
      expect(outcome).toEqual({ kind: "not-sent", reason: "not-open" });
      expect(paperclip.count(acceptCard)).toBe(0);
    });
  });
});
