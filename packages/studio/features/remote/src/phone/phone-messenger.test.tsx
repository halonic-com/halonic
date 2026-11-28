// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene, SCENE_COMPUTER } from "../test-support/gateway-scene.ts";
import {
  answer,
  buttonNamed,
  channel,
  direct,
  line,
  message,
  openChannel,
  readLine,
  renderMessenger,
  rowNamed,
  settle,
  type,
} from "../test-support/phone-messenger-scene.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { messageParts, openChecked, openInBrowserTab } from "./message-links.ts";
import { PhoneMessenger } from "./phone-messenger.tsx";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const pullRequest = "https://github.com/acme/app/pull/12";
const paperclip = "Paperclip · Halonic";

verifies("remote.phone-messenger", () => {
  describe("the phone's Messenger tab", () => {
    it("lists the chats, All or Waiting for me", async () => {
      const { scene } = renderMessenger();
      answer(scene, "conversations", [channel, { ...direct, waitingForMe: false }]);
      answer(scene, "agents", []);
      await settle();
      expect(rowNamed("Chief")).toBeDefined();
      const chips = [...document.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label')];
      expect(chips.map((chip) => chip.textContent)).toEqual(["All", "Waiting for me · 1"]);
      await act(async () => chips[1]?.querySelector("input")?.click());
      expect(rowNamed("Chief")).toBeUndefined();
      expect(rowNamed("Engineering")).toBeDefined();
    });

    it("has no control to add or remove a member, start a chat or channel, join or leave", async () => {
      await openChannel();
      await act(async () => buttonNamed("Members")?.click());
      const dialog = document.querySelector("dialog");
      expect(dialog?.textContent).toContain("Liam");
      expect(dialog?.textContent).toContain("Lead");
      expect(dialog?.textContent).toContain("Change members on Work laptop.");
      const controls = [...document.querySelectorAll("button, a, [role=menuitem]")].map(
        (control) => `${control.getAttribute("aria-label") ?? ""} ${control.textContent}`,
      );
      for (const control of controls) {
        expect(control).not.toMatch(/add|remove|make lead|new chat|new channel|join|leave/i);
      }
    });

    it("sends to the members picked in Name someone", async () => {
      const { scene } = await openChannel();
      await act(async () => buttonNamed("Name someone")?.click());
      expect(document.querySelector("[data-chat-picker]")?.textContent).toContain("Name someone");
      await act(async () => optionNamed("Liam")?.click());
      expect(document.body.textContent).toContain("To Liam");
      type("Ship it");
      await act(async () => buttonNamed("Send")?.click());
      expect(scene.tunnel.sentOf("msg-send")).toEqual([
        expect.objectContaining({ conversation: "c1", body: "Ship it", to: ["liam"] }),
      ]);
    });

    it("sends nothing over 10,000 characters", async () => {
      const { scene } = await openChannel();
      type("x".repeat(10_001));
      await act(async () => buttonNamed("Send")?.click());
      expect(line()).toBe("A message from the phone can be at most 10,000 characters.");
      expect(scene.tunnel.sentOf("msg-send")).toEqual([]);
    });

    it("says a send cut off by a drop, keeps the text and never sends it again", async () => {
      const { scene } = await openChannel();
      type("Ship it");
      await act(async () => buttonNamed("Send")?.click());
      scene.drop();
      scene.connect();
      await settle();
      expect(line()).toBe(
        "The connection dropped before your computer confirmed this message. Once your phone reconnects, you'll see whether it arrived. Send it again only if it didn't.",
      );
      expect(document.querySelector("textarea")?.value).toBe("Ship it");
      expect(scene.tunnel.sentOf("msg-send")).toHaveLength(1);
    });

    it("shows a link's full address and opens only one isAllowedWebLink passes", async () => {
      const body = `See [the PR](${pullRequest}) or https://github.com.evil.io/acme/app/pull/12.`;
      const { opened } = await openChannel([message(body)]);
      expect(document.querySelectorAll("a")).toHaveLength(1);
      expect(document.body.textContent).toContain("https://github.com.evil.io/acme/app/pull/12.");
      await act(async () => document.querySelector("a")?.click());
      expect(opened).toEqual([pullRequest]);
      const onOpenLink = vi.fn();
      expect(openChecked("javascript:alert(1)", undefined, onOpenLink)).toBe(false);
      expect(onOpenLink).not.toHaveBeenCalled();
    });

    it("keeps the sentence round a link and refuses a link with a label that hides it", () => {
      expect(messageParts(`Merged: ${pullRequest}.`)).toEqual([
        { kind: "text", text: "Merged: " },
        { kind: "link", link: pullRequest },
        { kind: "text", text: "." },
      ]);
      expect(messageParts("[the PR](https://evil.io/x)")).toEqual([
        { kind: "text", text: "[the PR](https://evil.io/x)" },
      ]);
    });

    it("says a source is offline instead of an empty list, and Try again reads again", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 26, 15, 0) });
      const { scene } = renderMessenger();
      const reads = () => scene.tunnel.sentOf("msg-read").filter((read) => read.what !== "sources");
      const refused = reads().find((read) => read.what === "conversations");
      scene.host({ type: "error", replyTo: refused?.id ?? "", code: "offline" });
      answer(scene, "agents", []);
      await settle();
      // Nothing until the sources read answers, so the generic refusal never shows first.
      expect(readLine()).toBe("");
      const asOf = new Date(2026, 10, 26, 14, 2).toISOString();
      const state = { kind: "offline", asOf } as const;
      answer(scene, "sources", [{ id: "s1", provider: "paperclip", label: paperclip, state }]);
      await settle();
      expect(readLine()).toBe(
        "Paperclip · Halonic is offline, as of 14:02, so its chats may be out of date.",
      );
      const before = reads().length;
      await act(async () => buttonNamed("Try again")?.click());
      expect(reads().slice(before)).toEqual([expect.objectContaining({ what: "conversations" })]);
      answer(scene, "conversations", [channel]);
      await settle();
      expect(buttonNamed("Try again")).toBeUndefined();
      expect(readLine()).toBe("");
      expect(rowNamed("Engineering")).toBeDefined();
    });

    it("says a chat cut off by a drop couldn't be loaded, and Try again reads it again", async () => {
      const { scene } = await openChannel();
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [channel]);
      answer(scene, "agents", []);
      await settle();
      await act(async () => rowNamed("Engineering")?.click());
      scene.drop();
      scene.connect();
      await settle();
      expect(readLine()).toBe("Couldn't load it: Work laptop isn't answering.");
      const messageReads = () =>
        scene.tunnel.sentOf("msg-read").filter((read) => read.what === "messages");
      const before = messageReads().length;
      await act(async () => buttonNamed("Try again")?.click());
      expect(messageReads()).toHaveLength(before + 1);
      answer(scene, "messages", [message("Merged.")]);
      await settle();
      expect(buttonNamed("Try again")).toBeUndefined();
      expect(document.body.textContent).toContain("Merged.");
    });

    it("says the computer turned down a list it refused for any other reason", async () => {
      const { scene } = renderMessenger();
      answer(scene, "conversations", [channel]);
      const agents = scene.tunnel.sentOf("msg-read").find((read) => read.what === "agents");
      scene.host({ type: "error", replyTo: agents?.id ?? "", code: "signed-out" });
      await settle();
      expect(readLine()).toBe(
        "Couldn't load it: Work laptop turned it down. You can open it there.",
      );
      expect(rowNamed("Engineering")).toBeDefined();
      // Only the list's own read of the sources, for the rows: none to word the refusal.
      const sources = scene.tunnel.sentOf("msg-read").filter((read) => read.what === "sources");
      expect(sources).toHaveLength(1);
    });

    it("shows the update note and reads nothing while the computer speaks version 3", () => {
      const scene = new GatewayScene();
      scene.connect();
      render(
        <PhoneMessenger
          messaging={scene.client.messaging}
          computer={SCENE_COMPUTER}
          olderComputer
          onOpenLink={() => undefined}
        />,
      );
      expect(document.body.textContent).toContain("Update Halonic on Work laptop");
      expect(scene.tunnel.sentOf("msg-read")).toEqual([]);
    });
  });
});

/** A row of the box's list of members, by the member's name. */
function optionNamed(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
    option.textContent?.startsWith(name),
  );
}

/** A Messenger tab over a version 4 host that hasn't answered anything yet. */
const openList = () => renderMessenger().scene;

const chips = () => document.querySelector('[role="radiogroup"]');

verifies("remote.phone-messenger-tab", () => {
  describe("the Messenger tab before it has chats", () => {
    it("says Loading Messenger, without chips, until the computer answers", async () => {
      const scene = openList();
      await settle();
      expect(readLine()).toBe("Loading Messenger");
      expect(chips()).toBeNull();
      answer(scene, "conversations", []);
      answer(scene, "agents", []);
      await settle();
      expect(document.body.textContent).toBe(
        "No chats yetChats you start on Work laptop show up here.",
      );
    });

    it("says why a failed read failed, never No chats yet", async () => {
      const scene = openList();
      const conversations = scene.tunnel
        .sentOf("msg-read")
        .find((read) => read.what === "conversations");
      scene.host({ type: "error", replyTo: conversations?.id ?? "", code: "signed-out" });
      answer(scene, "agents", []);
      await settle();
      expect(readLine()).toBe(
        "Couldn't load it: Work laptop turned it down. You can open it there.",
      );
      expect(document.body.textContent).not.toContain("No chats yet");
      expect(chips()).toBeNull();
    });

    it("loads again from Try again after a failed read, never No chats yet", async () => {
      const scene = openList();
      const conversations = () =>
        scene.tunnel.sentOf("msg-read").filter((read) => read.what === "conversations");
      scene.host({ type: "error", replyTo: conversations()[0]?.id ?? "", code: "signed-out" });
      answer(scene, "agents", []);
      await settle();
      await act(async () => buttonNamed("Try again")?.click());
      expect(conversations()).toHaveLength(2);
      expect(readLine()).toBe("Loading Messenger");
      expect(document.body.textContent).not.toContain("No chats yet");
      expect(chips()).toBeNull();
      answer(scene, "conversations", [direct]);
      await settle();
      expect(rowNamed("Chief")).toBeDefined();
    });

    it("says Nothing is waiting for you under the chips when nothing waits", async () => {
      const scene = openList();
      answer(scene, "conversations", [{ ...direct, waitingForMe: false }]);
      answer(scene, "agents", []);
      await settle();
      await act(async () => chips()?.querySelectorAll("input")[1]?.click());
      expect(document.body.textContent).toContain("Nothing is waiting for you.");
      expect(rowNamed("Chief")).toBeUndefined();
    });
  });
});

/** How long one split of `body` takes, in milliseconds. */
function timeSplit(body: string): number {
  const started = performance.now();
  messageParts(body);
  return performance.now() - started;
}

/**
 * The fastest of three splits of each body, in milliseconds and at least one, so a split too quick
 * to time still gives a ratio. The two take turns, so a runner that slows down part-way slows both.
 */
function fastestSplits(small: string, large: string): { small: number; large: number } {
  let fastestSmall = Number.POSITIVE_INFINITY;
  let fastestLarge = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 3; round++) {
    fastestSmall = Math.min(fastestSmall, timeSplit(small));
    fastestLarge = Math.min(fastestLarge, timeSplit(large));
  }
  return { small: Math.max(fastestSmall, 1), large: Math.max(fastestLarge, 1) };
}

verifies("remote.phone-messenger-links", () => {
  describe("a link and the way back in a phone chat", () => {
    it("is a link that says it opens in the browser, showing only the address", async () => {
      await openChannel([message(`Merged: ${pullRequest}`)]);
      const link = document.querySelector("a");
      expect(link?.getAttribute("href")).toBe(pullRequest);
      expect(link?.textContent).toBe(`${pullRequest} opens in your browser`);
      const hidden = link?.querySelector(".sr-only")?.textContent;
      expect(hidden).toBe(" opens in your browser");
      expect(link?.textContent?.replace(hidden ?? "", "")).toBe(pullRequest);
    });

    it("opens a link in a new tab, cut off from the page, in a browser", () => {
      const opener = { open: vi.fn(() => null) };
      expect(openInBrowserTab(pullRequest, opener)).toBe(true);
      expect(opener.open).toHaveBeenCalledWith(pullRequest, "_blank", "noopener,noreferrer");
      expect(openInBrowserTab("javascript:alert(1)", opener)).toBe(false);
      expect(opener.open).toHaveBeenCalledTimes(1);
    });

    it("names the chat's back button Messenger, and it goes back to the list", async () => {
      const { scene } = await openChannel();
      expect(document.querySelector("h2")?.textContent).toBe("Engineering");
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [channel, direct]);
      answer(scene, "agents", []);
      await settle();
      expect(document.querySelector("h2")).toBeNull();
      expect(rowNamed("Chief")).toBeDefined();
    });

    // HAL-20070: unbounded, each `[` and each dot rescanned to the end; 100,000 took seconds.
    // The split must grow in step with the text: ten times the text takes about ten times as
    // long, where the rescan took a hundred. A ratio on the same runner, not a fixed time, so a
    // busy runner can't fail it (HAL-20604).
    it.each([
      ["brackets that never close", (size: number) => "[".repeat(size)],
      ["links that never close", (size: number) => "[](".repeat(Math.ceil(size / 3))],
      ["a run of dots after an address", (size: number) => `${pullRequest}${".".repeat(size)}a`],
    ])("splits 100,000 characters of %s in step with the text", (_name, body) => {
      const { small, large } = fastestSplits(body(10_000), body(100_000));
      expect(large).toBeLessThan(30 * small);
    });
  });
});
