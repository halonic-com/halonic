import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FakePhoneRemote } from "../../test-support/fake-phone-remote.ts";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId, PairedComputer } from "../phone-tunnel.ts";
import { PhoneAppRouter } from "./phone-app-router.ts";

const scanner: PhoneScanner = {
  scan: () => Promise.resolve({ kind: "closed" }),
  close: () => Promise.resolve(),
};

const laptop: PairedComputer = {
  id: "c-1" as ComputerId,
  name: "Tim's laptop",
  pairedAt: "2026-11-14T10:00:00Z",
  endpoints: ["wss://studio.tail1234.ts.net"],
  standing: "paired",
};

function setUp(...computers: PairedComputer[]) {
  const tunnel = new FakePhoneTunnel();
  for (const computer of computers) tunnel.computers.set(computer.id, computer);
  const lastChat = vi.fn();
  const router = new PhoneAppRouter({
    tunnel,
    scanner,
    report: () => undefined,
    hold: () => Object.assign(new FakePhoneRemote(), { dispose: () => undefined }),
    lastChat,
  });
  return { tunnel, router, lastChat };
}

verifies("remote.phone-shortcuts", () => {
  it("opens the computer it would open anyway on the shortcut's tab", async () => {
    const { router } = setUp(laptop);
    await router.start("messenger");
    expect(router.view.screen).toEqual({
      screen: "computer",
      computer: laptop.id,
      sheet: "none",
      tab: "messenger",
    });
    expect(router.view.landing).toBeUndefined();
  });

  it("keeps the tab through pairing, then opens the new computer on it", async () => {
    const { tunnel, router } = setUp();
    await router.start("inbox");
    expect(router.view.screen.screen).toBe("pair");
    expect(router.view.landing).toBe("inbox");
    tunnel.computers.set(laptop.id, laptop);
    await router.openPaired(laptop);
    expect(router.view.screen).toMatchObject({ screen: "computer", tab: "inbox" });
    expect(router.view.landing).toBeUndefined();
  });

  it("lands a shortcut tapped while the app runs on the computer, with nothing to go back to", async () => {
    const { router } = setUp(laptop);
    await router.start();
    router.openRun("s-1");
    router.openComputers();
    expect(router.view.canGoBack).toBe(true);
    router.openShortcut("messenger");
    expect(router.view.screen).toEqual({
      screen: "computer",
      computer: laptop.id,
      sheet: "none",
      tab: "messenger",
    });
    expect(router.view.canGoBack).toBe(false);
  });

  it("keeps a shortcut tapped during a pairing for when the computer's screen opens", async () => {
    const { router } = setUp();
    await router.start();
    router.openShortcut("messenger");
    expect(router.view.screen.screen).toBe("pair");
    expect(router.view.landing).toBe("messenger");
  });

  it("follows the tab bar, and the Inbox is the tab when none was picked", async () => {
    const { router } = setUp(laptop);
    await router.start();
    expect(router.view.screen).not.toHaveProperty("tab");
    router.selectTab("agents");
    expect(router.view.screen).toMatchObject({ tab: "agents" });
  });

  it("opens the last chat's computer on Messenger with the chat, until the tab takes it", async () => {
    const { router, lastChat } = setUp(laptop);
    await router.start({ computer: laptop.id, chat: "c-launch" });
    expect(router.view.screen).toEqual({
      screen: "computer",
      computer: laptop.id,
      sheet: "none",
      tab: "messenger",
      chat: "c-launch",
    });
    router.chatOpened({ id: "c-launch", title: "Launch review" });
    router.chatLanded();
    expect(router.view.screen).not.toHaveProperty("chat");
    expect(router.view.screen).toMatchObject({ tab: "messenger" });
    expect(lastChat.mock.calls).toEqual([
      [{ computer: laptop.id, chat: "c-launch", name: "Launch review" }],
    ]);
  });

  it("opens the Messenger list for a last chat on another computer", async () => {
    const { router } = setUp(laptop);
    await router.start();
    router.openShortcut({ computer: "c-2" as ComputerId, chat: "c-launch" });
    expect(router.view.screen).toEqual({
      screen: "computer",
      computer: laptop.id,
      sheet: "none",
      tab: "messenger",
    });
  });

  it("says Messenger opens after pairing for the last chat's shortcut", async () => {
    const { router } = setUp();
    await router.start({ computer: laptop.id, chat: "c-launch" });
    expect(router.view.landing).toBe("messenger");
  });
});
