// @vitest-environment jsdom

import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import { SKELETON_AFTER_MS } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayScene, SCENE_COMPUTER } from "../../test-support/gateway-scene.ts";
import { render, unmountAll } from "../../test-support/render.tsx";
import type { OwnerCheckAvailable, OwnerCheckReady } from "../gateway-client.ts";
import { timeOf } from "./inbox-words.ts";
import { PhoneInbox } from "./phone-inbox.tsx";
import { usePhoneInbox } from "./use-phone-inbox.ts";

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
    ownerCheck = () => Promise.resolve({ approval: screenLock, answer: screenLock }),
  }: { answersRisky?: boolean; screenLock?: boolean; ownerCheck?: OwnerCheckAvailable } = {},
) {
  const scene = new GatewayScene(ownerCheck);
  scenes.push(scene);
  const onOpenSettings = vi.fn();
  function Inbox() {
    const view = useSyncExternalStore(scene.client.subscribe.bind(scene.client), () =>
      scene.client.view(),
    );
    const items = usePhoneInbox(scene.client.messaging, view.canAnswer);
    return (
      <PhoneInbox
        items={items}
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

/** The Inbox row of the card titled `title`: its title, who asks, any hint, then its wait. */
function row(title: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("li > button")].find((each) =>
    each.textContent?.startsWith(title),
  );
  if (found === undefined) throw new Error(`No row ${title}`);
  return found;
}

async function open(title: string): Promise<void> {
  await step(() => row(title).click());
}

/** The list's heading as a screen reader hears it: "Needs you, 2 waiting". */
const heading = () =>
  [...(document.querySelector("section h2")?.childNodes ?? [])]
    .map((node) => node.textContent)
    .join("")
    .replace("· ", "");

const text = () => document.body.textContent ?? "";

const noScreenLock = "Set a screen lock on this phone to answer from it. Reading still works.";

/** The host says its Inbox changed, and answers the phone's new read with `items`. */
async function reread(scene: GatewayScene, items: readonly InboxItem[]): Promise<void> {
  await step(() => scene.host({ type: "msg-changed", source: "acme" }));
  await step(() => {
    const replyTo = scene.tunnel.lastOf("msg-read").id;
    scene.host({ type: "msg-data", replyTo, what: "inbox", items: [...items] });
  });
}

/** The host answers the phone's one `msg-answer` with `result`. */
async function result(scene: GatewayScene, answer: AnswerResult): Promise<void> {
  const replyTo = scene.tunnel.lastOf("msg-answer").id;
  await step(() => scene.host({ type: "msg-result", replyTo, result: answer }));
}

verifies("remote.phone-inbox", () => {
  it("lists what waits, and answers a card once with what the person picked", async () => {
    const { scene } = await mountInbox([item(), hire]);
    expect(heading()).toBe("Needs you, 2 waiting");
    await open("Ship phase 2 now?");
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
    // The pressed option is gone, so the focus moves to Next.
    expect(document.activeElement).toBe(button("Next"));
    await press("Next");
    expect(text()).toContain("Needs you");
    expect(document.activeElement).toBe(row("Ship phase 2 now?"));
  });

  it("puts the focus back on the card's row after Back", async () => {
    await mountInbox([item(), hire]);
    await open("Hire a designer?");
    await press("Inbox");
    expect(document.activeElement).toBe(row("Hire a designer?"));
  });

  it("puts the focus on the title when the last card has left the Inbox", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "answered", answeredAt });
    await reread(scene, []);
    await press("Next");
    expect(document.activeElement?.textContent).toBe("Nothing is waiting for you");
  });

  it("offers Back on a card that is gone from Paperclip", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "refused", reason: "not-found" });
    expect(text()).toContain("This card is gone from Paperclip.");
    expect(document.activeElement).toBe(button("Back"));
  });

  it("says the answers wait for the computer while it isn't answering", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await step(() => scene.tunnel.status("unreachable"));
    expect(text()).toContain(
      `You can answer once ${SCENE_COMPUTER} answers again. Nothing is sent later.`,
    );
    await step(() => scene.tunnel.status("phoneOffline"));
    expect(text()).toContain("You can answer once your phone reconnects.");
    expect(text()).not.toContain("Nothing is sent later.");
  });

  it("sends no answer pressed while the computer isn't answering, then or once it answers again", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await step(() => scene.tunnel.status("unreachable"));
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);

    await step(() => {
      scene.connect();
      scene.list([]);
    });
    expect(text()).not.toContain("Nothing is sent later.");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
  });

  it("puts the focus on Needs you when the card has left a list that still holds others", async () => {
    const { scene } = await mountInbox([item(), hire]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "answered", answeredAt });
    await reread(scene, [hire]);
    await press("Next");
    expect(document.activeElement).toBe(document.querySelector("section h2"));
    expect(document.activeElement?.textContent).toContain("Needs you");
  });

  it("moves the focus to Needs you when the focused row leaves on the next read", async () => {
    const { scene } = await mountInbox([item(), hire]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "answered", answeredAt });
    // Next comes before the host's re-read: the answered card's row takes the focus, then leaves.
    await press("Next");
    expect(document.activeElement).toBe(row("Ship phase 2 now?"));
    await reread(scene, [hire]);
    expect(document.activeElement).toBe(document.querySelector("section h2"));
  });

  it("says who answered first when the card was answered elsewhere", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Later");
    const by = { kind: "person", name: "Mara" } as const;
    await result(scene, { outcome: "already-answered", by, answeredAt });
    expect(text()).toContain(`Answered in Paperclip by Mara at ${timeOf(answeredAt)}`);
  });

  it("names the computer when the person already answered the card there", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "already-answered", by: { kind: "me" }, answeredAt });
    expect(text()).toContain(`Answered on ${SCENE_COMPUTER} at ${timeOf(answeredAt)}`);
    expect(button("Today").getAttribute("aria-disabled")).toBe("true");
    await press("Next");
    expect(text()).toContain("Needs you");
  });

  it("keeps a risky card on the computer, buttons off, while phones may not answer risky ones", async () => {
    const { scene } = await mountInbox([hire]);
    expect(text()).toContain("Answer this on your computer");
    expect(row("Hire a designer?").textContent).toContain("Answer this on your computer");
    await open("Hire a designer?");
    expect(text()).toContain("Answer this on your computer.");
    expect(button("Today").getAttribute("aria-disabled")).toBe("true");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
  });

  it("answers a risky card once the computer lets phones answer risky approvals", async () => {
    const { scene } = await mountInbox([hire]);
    await step(() => scene.push([], true));
    await open("Hire a designer?");
    expect(text()).not.toContain("Answer this on your computer.");
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toHaveLength(1);
  });

  it("reads but answers nothing on a phone without a screen lock", async () => {
    const { scene, onOpenSettings } = await mountInbox([item()], { screenLock: false });
    await open("Ship phase 2 now?");
    expect(text()).toContain("Ship phase 2 now?");
    expect(text()).toContain(
      "Set a screen lock on this phone to answer from it. Reading still works.",
    );
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);
    await press("Open settings");
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("answers a card on a phone with a PIN and no strong biometric", async () => {
    // The shell takes the PIN for an Inbox answer, not for a risky approval (HAL-19060).
    const ownerCheck = () => Promise.resolve({ approval: false, answer: true });
    const { scene } = await mountInbox([item()], { ownerCheck });
    expect(scene.client.view().ownerCheck).toBe("unavailable");
    await open("Ship phase 2 now?");
    expect(text()).not.toContain(noScreenLock);
    await press("Today");
    expect(scene.tunnel.sentOf("msg-answer")).toHaveLength(1);
  });

  it.each([true, false])(
    "keeps answers off with no screen-lock line until the owner check answers, then %s",
    async (screenLock) => {
      let answerCheck: (ready: OwnerCheckReady) => void = () => undefined;
      const ownerCheck = () =>
        new Promise<OwnerCheckReady>((resolve) => {
          answerCheck = resolve;
        });
      const { scene } = await mountInbox([item()], { ownerCheck });
      await open("Ship phase 2 now?");
      expect(text()).not.toContain(noScreenLock);
      expect(button("Today").getAttribute("aria-disabled")).toBe("true");
      await press("Today");
      expect(scene.tunnel.sentOf("msg-answer")).toEqual([]);

      await step(() => answerCheck({ approval: screenLock, answer: screenLock }));
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

/** Whether `first` comes before `second` in the document. */
const above = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The innermost element that says `words` and nothing else. */
function holding(words: string): Element {
  const found = [...document.querySelectorAll("p, div, span")]
    .filter((each) => each.textContent === words)
    .at(-1);
  if (found === undefined) throw new Error(`Nothing says ${words}`);
  return found;
}

const planned = item({
  question: "Ship phase 2 now?\nThe tests are green.",
  project: { id: "apps", name: "Halonic apps" },
});

verifies("remote.phone-inbox-parts", () => {
  it("shows each card as a flat row: its title, who asks and its wait", async () => {
    await mountInbox([planned, hire]);
    const shown = row("Ship phase 2 now?");
    expect(shown.textContent).toMatch(/^Ship phase 2 now\?Chief asks · Halonic appsWaiting \d/);
    expect(shown.textContent).not.toContain("The tests are green.");
    expect(shown.closest("li")?.className).toContain("border-b border-border");
    expect(row("Hire a designer?").querySelectorAll("svg")).toHaveLength(2);
  });

  it("heads the card with Needs you and its wait, then its title and who asks, under a labelled Back", async () => {
    await mountInbox([planned]);
    await open("Ship phase 2 now?");
    expect(button("Inbox").textContent?.trim()).toBe("Inbox");
    expect(document.querySelector("h2")?.textContent).toBe("Ship phase 2 now?");
    expect(above(holding("Needs you"), document.querySelector("h2") as Element)).toBe(true);
    expect(holding("Chief asks · Halonic apps")).toBeDefined();
    expect(holding("The tests are green.")).toBeDefined();
  });

  it("fills the first option and leaves the others secondary", async () => {
    await mountInbox([item()]);
    await open("Ship phase 2 now?");
    expect(button("Today").className).toContain("bg-primary");
    expect(button("Later").className).not.toContain("bg-primary");
  });

  it("says why the answers are off in a Callout above them, Open settings in it", async () => {
    await mountInbox([item()], { screenLock: false });
    await open("Ship phase 2 now?");
    const callout = holding(noScreenLock);
    expect(above(callout, button("Today"))).toBe(true);
    // One box holds the line and Open settings, and none of the options.
    const boxes = [...document.querySelectorAll("div")].filter(
      (box) =>
        box.contains(callout) &&
        box.contains(button("Open settings")) &&
        !box.contains(button("Today")),
    );
    expect(boxes.length).toBeGreaterThan(0);
  });

  it("keeps the options after an answer, turned off, under You chose", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "answered", answeredAt });
    const chose = document.querySelector('[role="status"]') as Element;
    expect(chose.textContent).toBe(`You chose: Today · ${timeOf(answeredAt)}`);
    for (const option of ["Today", "Later"]) {
      expect(button(option).getAttribute("aria-disabled")).toBe("true");
      expect(above(chose, button(option))).toBe(true);
    }
    expect(above(button("Later"), button("Next"))).toBe(true);
  });

  it("shows the skeleton only after a moment, and says it is loading", () => {
    vi.useFakeTimers();
    try {
      const scene = new GatewayScene(() => Promise.resolve({ approval: true, answer: true }));
      scenes.push(scene);
      const inbox = (
        <PhoneInbox
          items={undefined}
          view={scene.client.view()}
          messaging={scene.client.messaging}
          computer={SCENE_COMPUTER}
          onOpenSettings={() => undefined}
        />
      );
      render(inbox);
      expect(text()).toBe("Loading the Inbox");
      act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS - 1));
      expect(document.querySelectorAll(".bg-surface-muted")).toHaveLength(0);
      act(() => vi.advanceTimersByTime(1));
      expect(text()).toBe("Loading the Inbox");
      expect(document.querySelectorAll(".bg-surface-muted").length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

verifies("remote.phone-inbox-closed", () => {
  it("settles a card that closed before the answer got there, its options turned off", async () => {
    const { scene } = await mountInbox([item()]);
    await open("Ship phase 2 now?");
    await press("Today");
    await result(scene, { outcome: "closed", reason: "expired", closedAt: answeredAt });
    expect(text()).toContain(`Expired · ${timeOf(answeredAt)}`);
    expect(text()).not.toContain("Answer this on your computer");
    for (const option of ["Today", "Later"]) {
      expect(button(option).getAttribute("aria-disabled")).toBe("true");
    }
    await press("Next");
    expect(text()).toContain("Needs you");
  });
});
