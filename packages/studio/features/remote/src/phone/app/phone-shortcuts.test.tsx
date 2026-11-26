// @vitest-environment jsdom

import type { Conversation, PairingQrPayload } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GatewayHost } from "../../test-support/gateway-scene.ts";
import { listedSession } from "../../test-support/listed-session.ts";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { MessagingList } from "../messaging-client.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId } from "../phone-tunnel.ts";
import { mountPhoneApp, type PhoneShortcuts } from "./mount-phone-app.tsx";

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

const scanner: PhoneScanner = {
  scan: () => Promise.resolve({ kind: "pairingCode", payload }),
  close: () => Promise.resolve(),
};

type Opening = Awaited<ReturnType<PhoneShortcuts["takeOpening"]>>;

/** The shell's shortcuts: `openings` are taken in turn, then none. */
function fakeShortcuts(openings: Opening[], canPin = () => Promise.resolve(true)) {
  return {
    takeOpening: vi.fn(() => Promise.resolve(openings.shift())),
    setLastChat: vi.fn(),
    canPin,
    pin: vi.fn(),
  } satisfies PhoneShortcuts;
}

const launchReview: Conversation = {
  id: "c-launch",
  source: "acme",
  agent: "elena",
  title: "Launch review",
  updatedAt: "2026-11-25T10:00:00.000Z",
  waitingForMe: false,
};

/** The phone app as the Android page mounts it, with nothing paired yet. */
async function mount(
  shortcuts: PhoneShortcuts,
  report: (problem: string) => void = () => undefined,
) {
  const tunnel = new FakePhoneTunnel();
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
        report,
        onAddress: () => undefined,
        onCamera: () => undefined,
        onOpenSettings: () => undefined,
        onOpenTailscale: () => undefined,
        onOpenLink: () => undefined,
        shortcuts,
      }),
    );
  });
  await settle();
  return { tunnel, hosts };
}

/** Pairs Tim's laptop by its code, opens its screen and lets it answer. */
async function pairAndConnect(tunnel: FakePhoneTunnel, hosts: Map<ComputerId, GatewayHost>) {
  await press("Scan code");
  await press("Open agents");
  const [[computer, host] = []] = [...hosts];
  if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
  await act(async () => {
    tunnel.push(computer, { state: "connected" });
    host.connectAndList([listedSession({ id: "s-reporter", title: "Reporter", lastSeq: 1 })]);
  });
  await settle();
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
}

async function press(name: string): Promise<void> {
  const found = buttonNamed(name);
  expect(found, name).toBeDefined();
  await act(async () => found?.click());
  await settle();
}

/** The host answers the newest `msg-read` of `what` with `items`. */
async function answer(host: GatewayHost, what: MessagingList, items: unknown[]): Promise<void> {
  const read = host.tunnel.sentOf("msg-read").findLast((each) => each.what === what);
  await act(async () => host.host({ type: "msg-data", replyTo: read?.id ?? "", what, items }));
  await settle();
}

/** The heading of the open chat, if one is open. */
const openChat = () => document.querySelector("header h2")?.textContent;

/** The picked tab's label, from the tab bar at the foot of the computer's screen. */
const pickedTab = () =>
  document.querySelector('nav button[aria-current="page"]')?.textContent?.replace(/\d+.*$/, "");

/** The page shows again, as when a shortcut is tapped while the app runs. */
async function showAgain(): Promise<void> {
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await settle();
}

verifies("remote.phone-shortcuts", () => {
  it("says which screen opens after pairing, then opens the computer on it", async () => {
    const { tunnel, hosts } = await mount(fakeShortcuts([{ screen: "messenger" }]));
    expect(document.body.textContent).toContain("After pairing, Messenger opens.");
    await pairAndConnect(tunnel, hosts);
    expect(pickedTab()).toBe("Messenger");
  });

  it("opens the last chat's shortcut in that chat on the Messenger tab", async () => {
    const shortcuts = fakeShortcuts([]);
    const { tunnel, hosts } = await mount(shortcuts);
    await pairAndConnect(tunnel, hosts);
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");

    shortcuts.takeOpening.mockResolvedValueOnce({
      screen: "chat",
      computer,
      chat: launchReview.id,
    });
    await showAgain();
    expect(pickedTab()).toBe("Messenger");
    await answer(host, "conversations", [launchReview]);

    expect(openChat()).toBe("Launch review");
    expect(shortcuts.setLastChat.mock.calls).toEqual([
      [{ computer, chat: launchReview.id, name: "Launch review" }],
    ]);
  });

  it("opens the Messenger list for a last chat that's gone", async () => {
    const shortcuts = fakeShortcuts([]);
    const { tunnel, hosts } = await mount(shortcuts);
    await pairAndConnect(tunnel, hosts);
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");

    shortcuts.takeOpening.mockResolvedValueOnce({ screen: "chat", computer, chat: "c-gone" });
    await showAgain();
    await answer(host, "conversations", [launchReview]);

    expect(openChat()).toBeUndefined();
    expect(buttonNamed("Launch review")).toBeDefined();
    expect(shortcuts.setLastChat).not.toHaveBeenCalled();
  });

  it("makes a chat the person opens the last chat", async () => {
    const shortcuts = fakeShortcuts([{ screen: "messenger" }]);
    const { tunnel, hosts } = await mount(shortcuts);
    await pairAndConnect(tunnel, hosts);
    const [[computer, host] = []] = [...hosts];
    if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
    await answer(host, "conversations", [launchReview]);
    await press("Launch review");
    expect(shortcuts.setLastChat.mock.calls).toEqual([
      [{ computer, chat: launchReview.id, name: "Launch review" }],
    ]);
  });

  it("says nothing more on Pair with a computer when no shortcut opened the app", async () => {
    await mount(fakeShortcuts([]));
    expect(document.body.textContent).not.toContain("After pairing");
  });

  it("switches to a shortcut's tab tapped while the app runs, closing Paired computers", async () => {
    const shortcuts = fakeShortcuts([]);
    const { tunnel, hosts } = await mount(shortcuts);
    await pairAndConnect(tunnel, hosts);
    expect(pickedTab()).toBe("Inbox");
    await press("Connected to Tim's laptop. Details");
    await press("Paired computers");
    const back = vi.spyOn(window.history, "back");

    shortcuts.takeOpening.mockResolvedValueOnce({ screen: "messenger" });
    await showAgain();

    expect(pickedTab()).toBe("Messenger");
    // The entry that stood for Paired computers goes: Back now leaves the app.
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it("shows Home screen on Paired computers, and Add opens Android's dialog for that screen", async () => {
    const shortcuts = fakeShortcuts([]);
    const { tunnel, hosts } = await mount(shortcuts);
    await pairAndConnect(tunnel, hosts);
    await press("Connected to Tim's laptop. Details");
    await press("Paired computers");
    expect(document.querySelector("section h2")?.textContent).toBe("Home screen");
    expect(buttonNamed("Add Inbox")?.textContent).toBe("Add");
    await press("Add Messenger");
    expect(shortcuts.pin.mock.calls).toEqual([["messenger"]]);
  });

  it("shows no Home screen group when the launcher can't pin", async () => {
    const { tunnel, hosts } = await mount(fakeShortcuts([], () => Promise.resolve(false)));
    await pairAndConnect(tunnel, hosts);
    await press("Connected to Tim's laptop. Details");
    await press("Paired computers");
    expect(document.body.textContent).not.toContain("Home screen");
    expect(buttonNamed("Add Inbox")).toBeUndefined();
  });

  it("shows no Home screen group, and logs why, when asking whether the launcher pins fails", async () => {
    const report = vi.fn();
    const failed = fakeShortcuts([], () => Promise.reject(new Error("not allowed")));
    const { tunnel, hosts } = await mount(failed, report);
    await pairAndConnect(tunnel, hosts);
    await press("Connected to Tim's laptop. Details");
    await press("Paired computers");
    expect(document.body.textContent).not.toContain("Home screen");
    expect(report).toHaveBeenCalledWith(
      "Whether the launcher pins couldn't be read: Error: not allowed",
    );
  });
});
