// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, openDialog, polyfillModals } from "../test-support/modal.ts";
import { byText, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

beforeEach(polyfillModals);
afterEach(unmountAll);

/** Acme with Chief, Liam, Elena and Writer; "Engineering" holds the first three, Chief leads. */
function acme(options: { withMessage?: boolean; members?: number } = {}) {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const [chief, liam, elena, writer] = ["Chief", "Liam", "Elena", "Writer"].map((name) =>
    messaging.addAgent(source.id, { name }),
  );
  if (chief === undefined || liam === undefined || elena === undefined || writer === undefined) {
    throw new Error("no agents");
  }
  const members = [chief.id, liam.id, elena.id].slice(0, options.members ?? 3);
  const channel = messaging.addConversation(chief.id, { title: "Engineering", members });
  if (options.withMessage ?? true) messaging.addMessage(channel.id, { body: "Plan for today" });
  return { messaging, source, chief, liam, elena, writer, channel };
}

async function check(label: string): Promise<void> {
  const box = [...document.querySelectorAll<HTMLInputElement>("dialog input[type=checkbox]")].find(
    (each) => each.closest("label")?.textContent?.includes(label),
  );
  await press(box);
}

verifies("messenger.channel-create", () => {
  describe("New channel", () => {
    async function openNewChannel(page: HTMLElement): Promise<HTMLDialogElement> {
      await press(button("New channel", page));
      const dialog = openDialog();
      if (dialog === null) throw new Error("no New channel dialog");
      return dialog;
    }

    it("keeps Create channel off with 1 agent, and says why", async () => {
      const { messaging } = acme();
      const start = vi.spyOn(messaging, "startChannel");
      const dialog = await openNewChannel(await openMessenger(messaging));
      await check("Chief");
      const create = button("Create channel", dialog);
      expect(create?.getAttribute("aria-disabled")).toBe("true");
      expect(dialog.querySelector("[data-create-reason]")?.textContent).toBe(
        "Pick at least 2 agents.",
      );
      await press(create);
      expect(start).not.toHaveBeenCalled();
    });

    it("stops at 8 agents: the ninth can't be picked", async () => {
      const messaging = new FakeAgentMessaging();
      const source = messaging.addSource({ label: "Paperclip · Acme" });
      for (let index = 1; index <= 9; index += 1)
        messaging.addAgent(source.id, { name: `Agent ${index}` });
      const dialog = await openNewChannel(await openMessenger(messaging));
      for (let index = 1; index <= 9; index += 1) await check(`Agent ${index}`);
      expect(dialog.textContent).toContain("A channel can have up to 8 agents. · 8 of 8 picked");
      const boxes = [...dialog.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
      expect(boxes.filter((box) => box.checked)).toHaveLength(8);
      expect(boxes.at(-1)?.getAttribute("aria-disabled")).toBe("true");
      expect(button("Create channel", dialog)?.getAttribute("aria-disabled")).toBeNull();
    });

    it("makes the channel and opens it", async () => {
      const { messaging } = acme();
      const page = await openMessenger(messaging);
      const dialog = await openNewChannel(page);
      const name = dialog.querySelector<HTMLInputElement>("input:not([type=checkbox])");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          name,
          "Design",
        );
        name?.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await check("Liam");
      await check("Writer");
      await press(button("Create channel", dialog));
      await settle();
      expect(openDialog()).toBeNull();
      expect(page.querySelector("main h2")?.textContent).toBe("Design");
    });
  });

  describe("Browse channels", () => {
    it("lists only the channels the person isn't in, and Join puts one in the list", async () => {
      const { messaging, chief, liam } = acme();
      const design = messaging.addConversation(chief.id, {
        title: "Design",
        members: [chief.id, liam.id],
      });
      await messaging.leaveChannel(design.id);
      const page = await openMessenger(messaging);
      await press(button("Browse channels", page));
      const dialog = openDialog();
      const listed = [...(dialog?.querySelectorAll("[data-browse-channel]") ?? [])];
      expect(listed.map((each) => each.querySelector("bdi")?.textContent)).toEqual(["Design"]);

      await press(button("Join", dialog ?? document));
      expect(openDialog()).toBeNull();
      expect(byText(page, "nav li button", "Design")).toBeDefined();
      expect(page.querySelector("main h2")?.textContent).toBe("Design");
    });
  });
});
