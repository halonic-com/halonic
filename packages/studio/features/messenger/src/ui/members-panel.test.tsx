// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, openDialog, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press, said } from "../test-support/page.tsx";
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

/** The `label` button in `member`'s row of the panel. */
function rowButton(panel: HTMLElement, member: string, label: string): HTMLElement | undefined {
  return button(label, panel.querySelector(`[data-member="${member}"]`) ?? panel);
}

async function openMembers(page: HTMLElement): Promise<HTMLElement> {
  await openChat(page, "Engineering");
  await press(byText(page, "header button", "Members ·"));
  const panel = page.querySelector<HTMLElement>("aside");
  if (panel === null) throw new Error("no Members panel");
  return panel;
}

verifies("messenger.members", () => {
  describe("Members", () => {
    it("shows the history notice before a member is added, and calls setMembers only on Add", async () => {
      const { messaging, channel, writer } = acme();
      const setMembers = vi.spyOn(messaging, "setMembers");
      // A source that never reports its own writes: the panel must refresh by itself.
      const silent = { next: () => new Promise<IteratorResult<string>>(() => undefined) };
      vi.spyOn(messaging, "changes").mockReturnValue({ [Symbol.asyncIterator]: () => silent });
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      expect(panel.querySelector("h3")?.textContent).toBe("Members · 3");

      await press(button("Writer", panel));
      expect(openDialog()?.querySelector("[data-history-notice]")?.textContent).toBe(
        "Writer will see all earlier messages in Engineering.",
      );
      expect(setMembers).not.toHaveBeenCalled();

      await press(button("Add Writer", openDialog() ?? document));
      expect(setMembers).toHaveBeenCalledOnce();
      const [after] = await messaging.listConversations();
      expect(after?.members).toContain(writer.id);
      expect(after?.id).toBe(channel.id);
      expect(page.querySelector("aside h3")?.textContent).toBe("Members · 4");
    });

    it("adds nobody when the person cancels the notice", async () => {
      const { messaging } = acme();
      const setMembers = vi.spyOn(messaging, "setMembers");
      const panel = await openMembers(await openMessenger(messaging));
      await press(button("Writer", panel));
      await press(button("Cancel", openDialog() ?? document));
      expect(openDialog()).toBeNull();
      expect(setMembers).not.toHaveBeenCalled();
    });

    it("adds at once to a channel with no messages", async () => {
      const { messaging, writer } = acme({ withMessage: false });
      const panel = await openMembers(await openMessenger(messaging));
      await press(button("Writer", panel));
      expect(openDialog()).toBeNull();
      const [after] = await messaging.listConversations();
      expect(after?.members).toContain(writer.id);
    });

    it("asks for a new lead before it removes the lead", async () => {
      const { messaging, chief, liam, elena } = acme();
      const panel = await openMembers(await openMessenger(messaging));
      const chiefRow = panel.querySelector(`[data-member="${chief.id}"]`) ?? document;
      await press(button("Remove from channel", chiefRow));
      const dialog = openDialog();
      expect(dialog?.textContent).toContain("Chief is the lead. Pick a new lead first.");
      await press(button("Remove Chief", dialog ?? document));
      const [after] = await messaging.listConversations();
      expect(after?.agent).toBe(liam.id);
      expect(after?.members).toEqual([liam.id, elena.id]);
    });

    it("keeps Remove from channel off with 2 members, and says why", async () => {
      const { messaging } = acme({ members: 2 });
      const setMembers = vi.spyOn(messaging, "setMembers");
      const panel = await openMembers(await openMessenger(messaging));
      const remove = button("Remove from channel", panel);
      expect(remove?.getAttribute("aria-disabled")).toBe("true");
      expect(panel.textContent).toContain(
        "A channel needs at least 2 agents. Add one, or archive the channel.",
      );
      await press(remove);
      expect(setMembers).not.toHaveBeenCalled();
    });

    it("after a remove, focuses the next row's Remove from channel and says who left", async () => {
      const { messaging, liam, elena } = acme();
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      await press(rowButton(panel, liam.id, "Remove from channel"));
      expect(panel.querySelector(`[data-member="${liam.id}"]`)).toBeNull();
      expect(document.activeElement).toBe(rowButton(panel, elena.id, "Remove from channel"));
      expect(said(page)).toBe("Removed Liam from Engineering.");
    });

    it("after removing the last row, focuses Add an agent", async () => {
      const { messaging, elena } = acme();
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      await press(rowButton(panel, elena.id, "Remove from channel"));
      expect(document.activeElement).toBe(button("Add an agent", panel));
      expect(said(page)).toBe("Removed Elena from Engineering.");
    });

    it("after removing the lead, focuses the next row and says who left", async () => {
      const { messaging, chief, liam } = acme();
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      await press(rowButton(panel, chief.id, "Remove from channel"));
      await press(button("Remove Chief", openDialog() ?? document));
      expect(document.activeElement).toBe(rowButton(panel, liam.id, "Remove from channel"));
      expect(said(page)).toBe("Removed Chief from Engineering.");
    });

    it("after Make lead, focuses the new lead's row and says so", async () => {
      const { messaging, liam } = acme();
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      await press(rowButton(panel, liam.id, "Make lead"));
      expect(rowButton(panel, liam.id, "Make lead")).toBeUndefined();
      expect(document.activeElement).toBe(rowButton(panel, liam.id, "Remove from channel"));
      expect(said(page)).toBe("Liam is now the lead.");
    });

    it("after an add, focuses the added agent's row and says so", async () => {
      const { messaging, writer } = acme();
      const page = await openMessenger(messaging);
      const panel = await openMembers(page);
      await press(button("Writer", panel));
      await press(button("Add Writer", openDialog() ?? document));
      expect(document.activeElement).toBe(rowButton(panel, writer.id, "Make lead"));
      expect(said(page)).toBe("Added Writer to Engineering.");
    });

    it("asks Leave Engineering? once, then the channel leaves the list", async () => {
      const { messaging } = acme();
      const leave = vi.spyOn(messaging, "leaveChannel");
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      await press(button("Leave channel", page));
      expect(openDialog()?.textContent).toContain("Leave Engineering?");
      expect(openDialog()?.textContent).toContain("You can join again from Browse channels.");
      expect(leave).not.toHaveBeenCalled();
      await press(button("Leave", openDialog() ?? document));
      expect(leave).toHaveBeenCalledOnce();
      expect(openDialog()).toBeNull();
      expect(byText(page, "nav li button", "Engineering")).toBeUndefined();
    });
  });
});
