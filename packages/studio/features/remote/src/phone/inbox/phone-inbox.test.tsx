// @vitest-environment jsdom

import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayScene, SCENE_COMPUTER } from "../../test-support/gateway-scene.ts";
import { render, unmountAll } from "../../test-support/render.tsx";
import type { OwnerCheckAvailable } from "../gateway-client.ts";
import { timeOf } from "./inbox-words.ts";
import { PhoneInbox } from "./phone-inbox.tsx";

const scenes: GatewayScene[] = [];
afterEach(() => {
  unmountAll();
  for (const scene of scenes.splice(0)) scene.client.dispose();
});

const asked = "2026-11-25T14:00:00.000Z";
const answeredAt = "2026-11-25T14:02:00.000Z";

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "i-1",
    source: "acme",
    from: { kind: "agent", agent: "chief", name: "Chief" },
    question: "Ship phase 2 now?",
    options: [
      { id: "today", label: "Today" },
      { id: "later", label: "Later" },
    ],
    attachments: [],
    createdAt: asked,
    state: { kind: "open" },
    ...overrides,
  };
}

const hire = item({ id: "i-hire", question: "Hire a designer?", risk: "risky" });

/**
 * The phone's Inbox over a gateway scene whose host has `items`, its list saying `answersRisky`;
 * `ownerCheck` stands for the shell's, answering `screenLock` at once unless a test passes its own.
 */
async function mountInbox(
  items: readonly InboxItem[],
  {
    answersRisky = false,
    screenLock = true,
    ownerCheck = () => Promise.resolve(screenLock),
  }: { answersRisky?: boolean; screenLock?: boolean; ownerCheck?: OwnerCheckAvailable } = {},
) {
  const scene = new GatewayScene(ownerCheck);
  scenes.push(scene);
  const onOpenSettings = vi.fn();
  function Inbox() {
    const view = useSyncExternalStore(scene.client.subscribe.bind(scene.client), () =>
      scene.client.view(),
    );
    return (
      <PhoneInbox
        view={view}
        messaging={scene.client.messaging}
        computer={SCENE_COMPUTER}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  render(<Inbox />);
  await step(() => {
    scene.connect();
    scene.list([], answersRisky);
  });
  await step(() => {
    const replyTo = scene.tunnel.lastOf("msg-read").id;
    scene.host({ type: "msg-data", replyTo, what: "inbox", items: [...items] });
  });
  return { scene, onOpenSettings };
}

async function step(play: () => void): Promise<void> {
  await act(async () => {
    play();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

async function press(name: string): Promise<void> {
  await step(() => button(name).click());
}

const text = () => document.body.textContent ?? "";

const noScreenLock = "Set a screen lock on this phone to answer from it. Reading still works.";

/** The host answers the phone's one `msg-answer` with `result`. */
async function result(scene: GatewayScene, answer: AnswerResult): Promise<void> {
  const replyTo = scene.tunnel.lastOf("msg-answer").id;
  await step(() => scene.host({ type: "msg-result", replyTo, result: answer }));
}

verifies("remote.phone-inbox", () => {
  it("lists what waits, and answers a card once with what the person picked", async () => {
    const { scene } = await mountInbox([item(), hire]);
    expect(text()).toContain("Needs you · 2 waiting");
    await press("Chief" + "Ship phase 2 now?");
    expect(document.activeElement?.textContent).toBe("Chief");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([
      expect.objectContaining({
        item: "i-1",
        answer: { kind: "option", option: "today" },
        confirmed: true,
      }),
    ]);
    await result(scene, { outcome: "answered", answeredAt });
    expect(text()).toContain(`You chose: Today · ${timeOf(answeredAt)}`);
    await press("Next");
    expect(text()).toContain("Needs you");
  });

  it("says who answered first when the card was answered elsewhere", async () => {
    const { scene } = await mountInbox([item()]);
    await press("Chief" + "Ship phase 2 now?");
    await press("Later");
    const by = { kind: "person", name: "Mara" } as const;
    await result(scene, { outcome: "already-answered", by, answeredAt });
    expect(text()).toContain(`Answered in Paperclip by Mara at ${timeOf(answeredAt)}`);
  });

  it("keeps a risky card on the computer, buttons off, while phones may not answer risky ones", async () => {
    const { scene } = await mountInbox([hire]);
    expect(text()).toContain("Answer this on your computer");
    await press("Chief" + "Hire a designer?" + "Answer this on your computer");
    expect(text()).toContain("Answer this on your computer.");
    expect(button("Today").getAttribute("aria-disabled")).toBe("true");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
  });

  it("answers a risky card once the computer lets phones answer risky approvals", async () => {
    const { scene } = await mountInbox([hire]);
    await step(() => scene.push([], true));
    await press("Chief" + "Hire a designer?");
    expect(text()).not.toContain("Answer this on your computer.");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toHaveLength(1);
  });

  it("reads but answers nothing on a phone without a screen lock", async () => {
    const { scene, onOpenSettings } = await mountInbox([item()], { screenLock: false });
    await press("Chief" + "Ship phase 2 now?");
    expect(text()).toContain("Ship phase 2 now?");
    expect(text()).toContain(
      "Set a screen lock on this phone to answer from it. Reading still works.",
    );
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
    await press("Open settings");
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    "keeps answers off with no screen-lock line until the owner check answers, then %s",
    async (screenLock) => {
      let answerCheck: (available: boolean) => void = () => undefined;
      const ownerCheck = () =>
        new Promise<boolean>((resolve) => {
          answerCheck = resolve;
        });
      const { scene } = await mountInbox([item()], { ownerCheck });
      await press("Chief" + "Ship phase 2 now?");
      expect(text()).not.toContain(noScreenLock);
      expect(button("Today").getAttribute("aria-disabled")).toBe("true");
      await press("Today");
      expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);

      await step(() => answerCheck(screenLock));
      expect(text().includes(noScreenLock)).toBe(!screenLock);
      expect(button("Today").getAttribute("aria-disabled") === "true").toBe(!screenLock);
    },
  );

  it("says nothing is waiting when the Inbox is empty", async () => {
    await mountInbox([
      item({
        state: {
          kind: "answered",
          by: { kind: "me" },
          answer: { kind: "reply", text: "Yes" },
          answeredAt,
        },
      }),
    ]);
    expect(text()).toContain("Nothing is waiting for you");
    expect(text()).toContain("Questions and approvals from your agents show up here.");
  });
});
