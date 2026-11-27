// @vitest-environment jsdom

import {
  gatewayFallbackProtocolVersion,
  type InboxItem,
  type PairingQrPayload,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GatewayHost } from "../../test-support/gateway-scene.ts";
import { listedSession } from "../../test-support/listed-session.ts";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId } from "../phone-tunnel.ts";
import { mountPhoneApp } from "./mount-phone-app.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const unmounts: (() => void)[] = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  document.body.replaceChildren();
});

const payload: PairingQrPayload = {
  hostKey: new Uint8Array(32).fill(7),
  code: "7KQ2M4XD9TH6",
  hostName: "Tim's laptop",
  endpoints: ["wss://studio.tail1234.ts.net"],
};

/** A camera that reads the computer's pairing code at once. */
const scanner: PhoneScanner = {
  scan: () => Promise.resolve({ kind: "pairingCode", payload }),
  close: () => Promise.resolve(),
};

const sorter = listedSession({ id: "s-sorter", title: "Sorter", state: "waiting", lastSeq: 2 });
const reporter = listedSession({ id: "s-reporter", title: "Reporter", lastSeq: 1 });

/**
 * The phone app as the Android page mounts it, with the shell played by fakes: the phone tunnel
 * pairs and sends statuses, and each computer's tunnel carries the gateway messages of a host the
 * test plays.
 */
async function mountApp(tunnel = new FakePhoneTunnel()) {
  const hosts = new Map<ComputerId, GatewayHost>();
  const container = document.createElement("section");
  document.body.append(container);
  await act(async () => {
    unmounts.push(
      mountPhoneApp(container, {
        tunnel,
        computerTunnel: (computer) => {
          const host = new GatewayHost();
          hosts.set(computer, host);
          return host.tunnel;
        },
        scanner,
        window,
        report: () => undefined,
        onAddress: () => undefined,
        onCamera: () => undefined,
        onOpenSettings: () => undefined,
        onOpenTailscale: () => undefined,
        onOpenLink: () => undefined,
      }),
    );
  });
  await settle();
  return { tunnel, hosts };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function press(name: string): Promise<void> {
  const found = [...document.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
  expect(found, name).toBeDefined();
  await act(async () => found?.click());
  await settle();
}

/** Picks the computer's tab `name` in the tab bar at the foot of its screen. */
async function openTab(name: string): Promise<void> {
  const tab = [...document.querySelectorAll("nav button")].find((each) =>
    each.textContent?.startsWith(name),
  );
  expect(tab, name).toBeDefined();
  await act(async () => (tab as HTMLButtonElement | null)?.click());
  await settle();
}

/** Taps the Agents list's row of the agent `title`. */
async function tapRow(title: string): Promise<void> {
  const row = [...document.querySelectorAll("li > button")].find((each) =>
    each.querySelector(".sr-only")?.textContent?.startsWith(title),
  );
  expect(row, title).toBeDefined();
  await act(async () => (row as HTMLButtonElement | undefined)?.click());
  await settle();
}

async function typePrompt(text: string): Promise<void> {
  await act(async () => {
    const box = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const text = () => document.body.textContent ?? "";

/** Plays one step of the host or the shell, and lets the screens catch up. */
async function step(play: () => void): Promise<void> {
  await act(async () => play());
  await settle();
}

verifies("remote.phone-computer-agents", () => {
  it("pairs, lists, watches, answers and prompts, goes stale on a drop and live on the reconnect", async () => {
    const { tunnel, hosts } = await mountApp();

    // Pair: scan the code, the computer allows, Open agents.
    await press("Scan code");
    expect(text()).toContain("Paired with Tim's laptop");
    await press("Open agents");
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
    // The computer's screen opens on its heading (C48, CS2).
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Tim's laptop");

    // List and watch: the session opens, the phone says hello, lists and watches.
    await step(() => {
      tunnel.push(computer, { state: "connected" });
      host.connectAndList([sorter, reporter]);
    });
    // The screen opens on the Inbox tab; the agents are on their own tab.
    await openTab("Agents");
    expect(host.tunnel.sentOf("watch").map((watch) => watch.sessionId)).toEqual([
      "s-sorter",
      "s-reporter",
    ]);
    await step(() => {
      host.event("s-sorter", 1, { type: "message", role: "agent", text: "Sorting the inbox." });
      host.event("s-sorter", 2, {
        type: "approval-requested",
        approval: { id: "a-1", summary: "Send 4 replies", risk: "normal" },
      });
      host.event("s-reporter", 1, {
        type: "message",
        role: "agent",
        text: "Writing the weekly report",
      });
    });
    expect(text()).toContain("Send 4 replies");
    expect(text()).toContain("Writing the weekly report");
    // The heading stays, hidden, while the label shows (C48, CS1).
    expect(document.querySelector("h1.sr-only")?.textContent).toBe("Tim's laptop");

    // Approve: sent once; the host takes it and settles the approval.
    await press("Approve Sorter");
    expect(host.tunnel.sentOf("answer-approval")).toEqual([
      expect.objectContaining({ sessionId: "s-sorter", approvalId: "a-1", decision: "approve" }),
    ]);
    await step(() => {
      host.ok(host.tunnel.lastOf("answer-approval").id);
      host.event("s-sorter", 3, {
        type: "approval-settled",
        approvalId: "a-1",
        decision: "approve",
      });
    });
    expect(document.querySelector("li button[aria-disabled], li button[aria-busy]")).toBeNull();
    // Focus stays on Sorter's row, and the list says what was answered (C48, AP2).
    expect(document.activeElement?.getAttribute("data-session")).toBe("s-sorter");
    expect(text()).toContain("Approved: Sorter.");

    // Prompt: from Reporter's run detail, sent once.
    await tapRow("Reporter");
    expect(document.querySelector("h1")?.textContent).toBe("Reporter");
    await typePrompt("Add last week's numbers.");
    await press("Send");
    expect(host.tunnel.sentOf("prompt")).toEqual([
      expect.objectContaining({ sessionId: "s-reporter", text: "Add last week's numbers." }),
    ]);
    await step(() => host.ok(host.tunnel.lastOf("prompt").id));
    expect(text()).toContain("Prompt sent.");

    // Drop: the view goes stale, keeps what it showed, and the prompt box is off.
    await step(() => {
      tunnel.push(computer, { state: "reconnecting", lastTry: "timeout" });
      host.tunnel.status("unreachable");
    });
    expect(text()).toContain("Working as of");
    expect(text()).toContain("You can send a prompt once your phone reconnects.");
    await press("Back to Agents");
    expect(text()).toContain("Writing the weekly report · as of");
    // Back on the list, focus returns to Reporter's row (C48, RD1).
    expect(document.activeElement?.getAttribute("data-session")).toBe("s-reporter");

    // Reconnect: hello and list again, each watch resumes after the last seq, and it's live. The
    // screen reads and watches the Inbox again too, so the tab bar's count is current on any tab.
    await step(() => {
      tunnel.push(computer, { state: "connected" });
      host.connectAndList([{ ...sorter, state: "running", lastSeq: 3 }, reporter]);
    });
    const resumed = host.tunnel.sent.filter((sent) => sent.generation === 2);
    expect(resumed.map((sent) => sent.message.type)).toEqual([
      "hello",
      "list-sessions",
      "watch",
      "watch",
      "msg-read",
      "msg-watch",
    ]);
    expect(host.tunnel.sentOf("watch").slice(-2)).toEqual([
      expect.objectContaining({ sessionId: "s-sorter", afterSeq: 3 }),
      expect.objectContaining({ sessionId: "s-reporter", afterSeq: 1 }),
    ]);
    expect(text()).not.toContain("as of");
    expect(text()).not.toContain("You can send a prompt once your phone reconnects.");
  });

  it("drops the computer's agents when it removes this phone", async () => {
    const { tunnel, hosts } = await mountApp();
    await press("Scan code");
    await press("Open agents");
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
    await step(() => {
      tunnel.push(computer, { state: "connected" });
      host.connectAndList([reporter]);
    });
    await openTab("Agents");
    await tapRow("Reporter");
    await step(() => tunnel.push(computer, { state: "removed" }));
    expect(document.querySelector("h2")?.textContent).toBe("Removed from Tim's laptop");
    expect(text()).not.toContain("Reporter");
  });

  it("puts Update Halonic on… in the Inbox tab, and the agents on theirs, when the computer speaks only version 3", async () => {
    const { tunnel, hosts } = await mountApp();
    await press("Scan code");
    await press("Open agents");
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
    await step(() => {
      tunnel.push(computer, { state: "connected" });
      host.connectAt(gatewayFallbackProtocolVersion);
      host.list([reporter]);
    });
    // The Inbox tab is p05c, whole: its title, its text and its hint, and nothing else.
    const older = [
      "Update Halonic on Tim's laptop",
      "Update Halonic on Tim's laptop to use Inbox and Messenger from your phone.",
      "Agents still works.",
    ];
    const tabs = document.querySelector("nav button");
    const panel = document.getElementById(tabs?.getAttribute("aria-controls") ?? "");
    expect(panel?.textContent).toBe(older.join(""));
    // The tab bar is at the foot of the screen, after the view it shows (p02a).
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect((panel?.compareDocumentPosition(tabs as Node) ?? 0) & following).toBe(following);
    expect(host.tunnel.sentOf("msg-read")).toEqual([]);
    // The Agents tab lists the agents, with none of p05c's words.
    await openTab("Agents");
    expect(text()).toContain("Reporter");
    for (const words of older) expect(text()).not.toContain(words);
  });
});

verifies("remote.phone-inbox-parts", () => {
  it("shows none of a forgotten computer's Inbox on the next computer's screen", async () => {
    const tunnel = new FakePhoneTunnel();
    for (const [id, name] of [
      ["c-1", "Tim's laptop"],
      ["c-2", "Work desktop"],
    ] as const) {
      const computer = id as ComputerId;
      tunnel.computers.set(computer, {
        id: computer,
        name,
        pairedAt: "2026-11-14T10:00:00Z",
        endpoints: ["wss://studio.tail1234.ts.net"],
        standing: "paired",
      });
    }
    const { hosts } = await mountApp(tunnel);
    const laptop = "c-1" as ComputerId;
    const first = hosts.get(laptop);
    if (first === undefined) throw new Error("No gateway client held for the laptop.");
    await step(() => {
      tunnel.push(laptop, { state: "connected" });
      first.connectAndList([]);
    });
    await step(() => {
      const replyTo = first.tunnel.lastOf("msg-read").id;
      first.host({ type: "msg-data", replyTo, what: "inbox", items: [card] });
    });
    expect(text()).toContain("Ship phase 2 now?");
    expect(document.querySelector("nav button")?.getAttribute("aria-label")).toContain("waiting");

    // The laptop removes this phone, and it's forgotten on its Removed screen.
    await step(() => tunnel.push(laptop, { state: "removed" }));
    await press("Forget this computer");
    const confirm = [...document.querySelectorAll("dialog button")].find((each) =>
      each.textContent?.startsWith("Forget"),
    );
    await step(() => (confirm as HTMLButtonElement | undefined)?.click());
    const desktop = "c-2" as ComputerId;
    const next = hosts.get(desktop);
    if (next === undefined) throw new Error("No gateway client held for the desktop.");
    // The desktop answers, but holds its Inbox read.
    await step(() => {
      tunnel.push(desktop, { state: "connected" });
      next.connectAndList([]);
    });
    expect(document.querySelector("h1")?.textContent).toBe("Work desktop");
    expect(next.tunnel.sentOf("msg-read")).toHaveLength(1);
    expect(text()).not.toContain("Ship phase 2 now?");
    expect(document.querySelector("nav")?.textContent).toBe("InboxMessengerAgents");
  });
});

const card: InboxItem = {
  id: "i-1",
  source: "acme",
  from: { kind: "agent", agent: "chief", name: "Chief" },
  question: "Ship phase 2 now?",
  options: [],
  attachments: [],
  createdAt: "2026-11-25T14:00:00.000Z",
  state: { kind: "open" },
};
