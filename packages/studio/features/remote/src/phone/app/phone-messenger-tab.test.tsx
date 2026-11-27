// @vitest-environment jsdom

import {
  type Conversation,
  gatewayFallbackProtocolVersion,
  type Message,
  type PairingQrPayload,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GatewayHost } from "../../test-support/gateway-scene.ts";
import { listedSession } from "../../test-support/listed-session.ts";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { MessagingList } from "../messaging-client.ts";
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

const scanner: PhoneScanner = {
  scan: () => Promise.resolve({ kind: "pairingCode", payload }),
  close: () => Promise.resolve(),
};

const reporter = listedSession({ id: "s-reporter", title: "Reporter", lastSeq: 1 });
const engineering: Conversation = {
  id: "c1",
  source: "acme",
  agent: "elena",
  title: "Engineering",
  updatedAt: "2026-11-25T10:00:00.000Z",
  waitingForMe: true,
};
const chief: Conversation = { ...engineering, id: "c2", title: "Chief", waitingForMe: false };
const pullRequest = "https://github.com/acme/app/pull/12";

/** The phone app as the Android page mounts it, paired with Tim's laptop and its screen open. */
async function openComputer() {
  const tunnel = new FakePhoneTunnel();
  const hosts = new Map<ComputerId, GatewayHost>();
  const onOpenLink = vi.fn();
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
        onOpenLink,
      }),
    );
  });
  await settle();
  await press("Scan code");
  await press("Open agents");
  const [[computer, host] = []] = [...hosts];
  if (computer === undefined || host === undefined) throw new Error("No gateway client held.");
  return { tunnel, computer, host, onOpenLink };
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

/** The tab bar's tabs, at the foot of the computer's screen. */
const tabButtons = () => [...document.querySelectorAll<HTMLButtonElement>("nav button")];

/** Picks the computer's tab `name` in the tab bar. */
async function openTab(name: string): Promise<void> {
  const tab = tabButtons().find((each) => each.textContent?.startsWith(name));
  expect(tab, name).toBeDefined();
  await act(async () => (tab as HTMLButtonElement | null)?.click());
  await settle();
}

/** The host answers the newest `msg-read` of `what` with `items`. */
async function answer(host: GatewayHost, what: MessagingList | "messages", items: unknown[]) {
  const read = host.tunnel.sentOf("msg-read").findLast((each) => each.what === what);
  await act(async () => host.host({ type: "msg-data", replyTo: read?.id ?? "", what, items }));
  await settle();
}

function message(body: string): Message {
  const author = { kind: "agent", agent: "elena", name: "Elena" } as const;
  return {
    id: "m1",
    conversation: "c1",
    author,
    body,
    attachments: [],
    sentAt: engineering.updatedAt,
  };
}

verifies("remote.phone-messenger-tab", () => {
  it("reads Inbox · Messenger · Agents, lists the chats and sends a tapped link to the opener", async () => {
    const { tunnel, computer, host, onOpenLink } = await openComputer();
    await act(async () => {
      tunnel.push(computer, { state: "connected" });
      host.connectAndList([reporter]);
    });
    await settle();
    // A tab's text starts with its label; the Inbox's count, if any, follows it.
    const labels = tabButtons().map((tab) => tab.textContent ?? "");
    expect(labels.map((label) => label.replace(/\d+.*$/, ""))).toEqual([
      "Inbox",
      "Messenger",
      "Agents",
    ]);

    await openTab("Messenger");
    await answer(host, "conversations", [engineering, chief]);
    await answer(host, "agents", [{ id: "elena", name: "Elena" }]);
    expect(buttonNamed("Engineering")).toBeDefined();
    expect(buttonNamed("Chief")).toBeDefined();

    await press("Engineering");
    await answer(host, "messages", [message(`Merged: ${pullRequest}.`)]);
    const link = document.querySelector<HTMLAnchorElement>(`a[href="${pullRequest}"]`);
    expect(link).not.toBeNull();
    await act(async () => link?.click());
    expect(onOpenLink.mock.calls).toEqual([[pullRequest]]);
  });

  it("holds only Update Halonic on… in the Messenger tab while the computer speaks version 3", async () => {
    const { tunnel, computer, host } = await openComputer();
    await act(async () => {
      tunnel.push(computer, { state: "connected" });
      host.connectAt(gatewayFallbackProtocolVersion);
      host.list([reporter]);
    });
    await settle();
    await openTab("Messenger");
    const panel = document.getElementById(tabButtons()[1]?.getAttribute("aria-controls") ?? "");
    expect(panel?.textContent).toBe(
      [
        "Update Halonic on Tim's laptop",
        "Update Halonic on Tim's laptop to use Inbox and Messenger from your phone.",
        "Agents still works.",
      ].join(""),
    );
    expect(host.tunnel.sentOf("msg-read")).toEqual([]);
  });
});
