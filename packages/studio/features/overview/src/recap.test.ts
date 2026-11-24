import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { memoryRecapMark, RecapStore } from "./recap-store.ts";

const lastRecap = "2026-11-23T10:00:00.000Z";
const now = new Date("2026-11-24T10:00:00.000Z");
const hour = 3_600_000;

/** A fake with one item answered, two open and one work item blocked since {@link lastRecap}, plus older changes. */
function acmeSinceLastRecap(): FakeAgentMessaging {
  const messaging = new FakeAgentMessaging({ now: () => now });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const logo = messaging.addInboxItem(acme.id, { question: "Which logo?" });
  messaging.answerElsewhere(logo.id, { kind: "me" }, { kind: "reply", text: "The blue one" });
  messaging.addInboxItem(acme.id, {
    question: "Answered before the last recap",
    state: {
      kind: "answered",
      by: { kind: "me" },
      answer: { kind: "reply", text: "No" },
      answeredAt: "2026-11-22T09:00:00.000Z",
    },
  });
  messaging.addInboxItem(acme.id, {
    question: "Ship on Friday?",
    createdAt: "2026-11-22T10:00:00.000Z",
  });
  messaging.addInboxItem(acme.id, {
    question: "Print 500 flyers?",
    createdAt: "2026-11-24T07:00:00.000Z",
  });
  messaging.addWork(acme.id, { label: "ACME-2", title: "Print the flyers", state: "blocked" });
  messaging.addWork(acme.id, {
    label: "ACME-1",
    title: "Blocked before the last recap",
    state: "blocked",
    updatedAt: "2026-11-22T10:00:00.000Z",
  });
  return messaging;
}

/** Opens a recap once and gives it. */
async function openRecap(store: RecapStore) {
  await store.open();
  const state = store.snapshot();
  if (state.kind !== "ready") throw new Error(`the recap is ${state.kind}`);
  return state.recap;
}

verifies("overview.daily-recap", () => {
  it("counts one answered item, two open items with their waiting times, and one newly blocked work item", async () => {
    const store = new RecapStore(acmeSinceLastRecap(), memoryRecapMark(lastRecap), () => now);

    const recap = await openRecap(store);

    expect(recap.answered).toBe(1);
    expect(recap.open.map((item) => [item.question, item.waitingMs])).toEqual([
      ["Ship on Friday?", 48 * hour],
      ["Print 500 flyers?", 3 * hour],
    ]);
    expect(recap.newlyBlocked.map((work) => work.label)).toEqual(["ACME-2"]);
    expect(recap.done).toEqual([]);
    expect(recap.empty).toBe(false);
  });

  it("is empty when nothing changed since the last recap", async () => {
    const messaging = new FakeAgentMessaging({ now: () => now });
    messaging.addSource({ label: "Paperclip · Acme" });
    const store = new RecapStore(messaging, memoryRecapMark(lastRecap), () => now);

    const recap = await openRecap(store);

    expect(recap).toMatchObject({ answered: 0, open: [], done: [], newlyBlocked: [], empty: true });
  });

  it("covers only what changed after the recap opened last, in the next session", async () => {
    const messaging = acmeSinceLastRecap();
    const mark = memoryRecapMark(lastRecap);

    await openRecap(new RecapStore(messaging, mark, () => now));
    const nextSession = await openRecap(new RecapStore(messaging, mark, () => now));

    expect(mark.read()).toBe(now.toISOString());
    expect(nextSession.answered).toBe(0);
    expect(nextSession.newlyBlocked).toEqual([]);
  });

  it("keeps what changed when the same recap opens again", async () => {
    const store = new RecapStore(acmeSinceLastRecap(), memoryRecapMark(lastRecap), () => now);

    await openRecap(store);
    const again = await openRecap(store);

    expect(again.answered).toBe(1);
    expect(again.newlyBlocked.map((work) => work.label)).toEqual(["ACME-2"]);
  });

  it("keeps the mark when the read fails, so the next recap misses nothing", async () => {
    const messaging = new FakeAgentMessaging({ now: () => now });
    messaging.listWork = () => Promise.reject(new Error("offline"));
    const mark = memoryRecapMark(lastRecap);

    await new RecapStore(messaging, mark, () => now).open();

    expect(mark.read()).toBe(lastRecap);
  });
});
