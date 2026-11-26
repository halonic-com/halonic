// @vitest-environment jsdom

import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayScene, SCENE_COMPUTER } from "../../test-support/gateway-scene.ts";
import { render, unmountAll } from "../../test-support/render.tsx";
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

/** The phone's Inbox over a gateway scene whose host has `items`, its list saying `answersRisky`. */
async function mountInbox(
  items: readonly InboxItem[],
  { answersRisky = false, screenLock = true } = {},
) {
  const scene = new GatewayScene(() => Promise.resolve(screenLock));
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

/** Opens the card whose row starts with `title`. */
async function openRow(title: string): Promise<void> {
  const row = [...document.querySelectorAll("li button")].find((each) =>
    each.textContent?.startsWith(title),
  );
  if (!(row instanceof HTMLButtonElement)) throw new Error(`No row ${title}`);
  await step(() => row.click());
}

const text = () => document.body.textContent ?? "";

/** The host answers the phone's one `msg-answer` with `result`. */
async function result(scene: GatewayScene, answer: AnswerResult): Promise<void> {
  const replyTo = scene.tunnel.lastOf("msg-answer").id;
  await step(() => scene.host({ type: "msg-result", replyTo, result: answer }));
}

verifies("remote.phone-inbox", () => {
  it("lists what waits, and answers a card once with what the person picked", async () => {
    const { scene } = await mountInbox([item(), hire]);
    expect(text()).toContain("Needs you2 waiting");
    expect(text()).toContain("Chief asks");
    await openRow("Ship phase 2 now?");
    expect(document.activeElement?.textContent).toBe("Ship phase 2 now?");
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
    // The options stay, off, under the decision.
    expect(button("Today").getAttribute("aria-disabled")).toBe("true");
    expect(button("Later").getAttribute("aria-disabled")).toBe("true");
    await press("Next");
    expect(text()).toContain("Needs you");
  });

  it("says who answered first when the card was answered elsewhere", async () => {
    const { scene } = await mountInbox([item()]);
    await openRow("Ship phase 2 now?");
    await press("Later");
    const by = { kind: "person", name: "Mara" } as const;
    await result(scene, { outcome: "already-answered", by, answeredAt });
    expect(text()).toContain(`Answered in Paperclip by Mara at ${timeOf(answeredAt)}`);
  });

  it("keeps a risky card on the computer, buttons off, while phones may not answer risky ones", async () => {
    const { scene } = await mountInbox([hire]);
    expect(text()).toContain("Answer this on your computer");
    await openRow("Hire a designer?");
    expect(text()).toContain("Answer this on your computer.");
    expect(button("Today").getAttribute("aria-disabled")).toBe("true");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
  });

  it("answers a risky card once the computer lets phones answer risky approvals", async () => {
    const { scene } = await mountInbox([hire]);
    await step(() => scene.push([], true));
    await openRow("Hire a designer?");
    expect(text()).not.toContain("Answer this on your computer.");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toHaveLength(1);
  });

  it("reads but answers nothing on a phone without a screen lock", async () => {
    const { scene, onOpenSettings } = await mountInbox([item()], { screenLock: false });
    await openRow("Ship phase 2 now?");
    expect(text()).toContain("Ship phase 2 now?");
    expect(text()).toContain(
      "Set a screen lock on this phone to answer from it. Reading still works.",
    );
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
    await press("Open settings");
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

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
  it("says each row's asker and project, and filters the rows by project", async () => {
    const apps = { id: "apps", name: "Halonic apps" };
    await mountInbox([
      item({ project: apps }),
      item({
        id: "i-hire",
        question: "Hire a Release agent",
        options: [
          { id: "approve", label: "Approve" },
          { id: "reject", label: "Reject" },
        ],
      }),
    ]);
    expect(text()).toContain("Chief asks · Halonic apps");
    expect(text()).toContain("Chief · approval");
    const chip = [...document.querySelectorAll("label")].find(
      (each) => each.textContent === "No project",
    );
    if (chip === undefined) throw new Error("No project chip");
    await step(() => chip.click());
    expect(text()).toContain("Hire a Release agent");
    expect(text()).not.toContain("Ship phase 2 now?");
    expect(text()).toContain("1 waiting");
  });

  it("titles the card with the question's first line and says it once", async () => {
    await mountInbox([item({ question: "Ship phase 2 now?\nThe flows are ready." })]);
    await openRow("Ship phase 2 now?");
    expect(document.activeElement?.textContent).toBe("Ship phase 2 now?");
    expect(text().split("Ship phase 2 now?")).toHaveLength(2);
    expect(text()).toContain("The flows are ready.");
  });

  it("offers Reply beside the options, which opens the reply box and sends it", async () => {
    const { scene } = await mountInbox([item()]);
    await openRow("Ship phase 2 now?");
    expect(button("Today").className).toContain("bg-primary");
    expect(button("Later").className).not.toContain("bg-primary");
    expect(document.querySelector("textarea")).toBeNull();
    await press("Reply");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
    const box = document.querySelector("textarea");
    if (box === null) throw new Error("No reply box");
    await step(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(box, "After lunch");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press("Reply");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([
      expect.objectContaining({ answer: { kind: "reply", text: "After lunch" } }),
    ]);
  });
});
