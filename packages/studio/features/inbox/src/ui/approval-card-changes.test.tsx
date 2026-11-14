// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import { button, manual, openCard, press } from "./approval-card.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

verifies("inbox.approval-card", () => {
  describe("asking for changes", () => {
    function noteField(): HTMLTextAreaElement {
      const field = document.querySelector<HTMLTextAreaElement>("dialog textarea");
      if (field === null) throw new Error("no note field");
      return field;
    }

    async function type(text: string) {
      await act(async () => {
        const field = noteField();
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    function dialogButton(name: string): HTMLButtonElement {
      const dialog = document.querySelector("dialog");
      if (dialog === null) throw new Error("no dialog");
      return button(dialog as HTMLElement, name);
    }

    it("opens a dialog with the note focused, and sends it as the decision", async () => {
      const { root, sent, later } = openCard();
      later(61);
      await press(button(root, "Ask for changes"));
      expect(document.querySelector("dialog h2")?.textContent).toBe("Ask for changes");
      expect(document.activeElement).toBe(noteField());
      await type("Use the shorter title");
      await press(dialogButton("Send note"));
      expect(sent).toEqual(["note: Use the shorter title"]);
      expect(document.querySelector("dialog")).toBeNull();
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain(
        "Note sent to the agent at 10:44: Use the shorter title",
      );
      expect(document.activeElement).toBe(callout);
    });

    it("shows the sent note as text: a link and a script stay as written", async () => {
      const { root, later } = openCard();
      later(61);
      const note = "See [the docs](https://example.com) <script>alert(1)</script>";
      await press(button(root, "Ask for changes"));
      await type(note);
      await press(dialogButton("Send note"));
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain(`Note sent to the agent at 10:44: ${note}`);
      expect(callout?.querySelector("a, script")).toBeNull();
    });

    it("folds a long sent note behind Show more", async () => {
      const { root, later } = openCard();
      later(61);
      await press(button(root, "Ask for changes"));
      await type(Array.from({ length: 44 }, (_, index) => `line ${index + 1}`).join("\n"));
      await press(dialogButton("Send note"));
      const callout = root.querySelector<HTMLElement>("[role='group']");
      if (callout === null) throw new Error("no decided Callout");
      expect(callout.textContent).not.toContain("line 7");
      await act(async () => button(callout, "Show 38 more lines").click());
      expect(callout.textContent).toContain("line 44");
    });

    it("says what's missing for an empty note, and sends nothing", async () => {
      const { root, sent, later } = openCard();
      later(2);
      await press(button(root, "Ask for changes"));
      await press(dialogButton("Send note"));
      expect(sent).toEqual([]);
      expect(document.querySelector("dialog")?.textContent).toContain("Say what should change.");
      expect(document.activeElement).toBe(noteField());
      expect(noteField().getAttribute("aria-invalid")).toBe("true");
    });

    it("keeps the dialog and the note when the note can't be sent", async () => {
      const { root, later } = openCard({
        decisions: {
          approve: async () => waitingRun("r47"),
          reject: async () => waitingRun("r47"),
          askForChanges: async () => {
            throw new Error("engine gone");
          },
        },
      });
      later(2);
      await press(button(root, "Ask for changes"));
      await type("Use the shorter title");
      await press(dialogButton("Send note"));
      // The dialog's alert slot fills a frame after the request ends, so the failure is read.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(document.querySelector("dialog")?.textContent).toContain(
        "Couldn't record your decision.",
      );
      expect(noteField().value).toBe("Use the shorter title");
    });

    it("says the command sends Reject without the note, and gives it to copy", async () => {
      const { root, later } = openCard({
        decisions: {
          approve: async () => waitingRun("r47"),
          reject: async () => waitingRun("r47"),
          askForChanges: async () => {
            throw manual();
          },
        },
      });
      later(2);
      await press(button(root, "Ask for changes"));
      await type("Use the shorter title");
      await press(dialogButton("Send note"));
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      const text = document.querySelector("dialog")?.textContent ?? "";
      expect(text).toContain("The command sends Reject without your note.");
      expect(text).toContain("halonic runs send 7k2m9p approve");
      expect(text).not.toContain("Try again");
      expect(noteField().value).toBe("Use the shorter title");
    });

    it("keeps the note after Cancel, for the next time it opens", async () => {
      const { root, later } = openCard();
      later(2);
      await press(button(root, "Ask for changes"));
      await type("Use the shorter title");
      await press(dialogButton("Cancel"));
      expect(document.querySelector("dialog")).toBeNull();
      await press(button(root, "Ask for changes"));
      expect(noteField().value).toBe("Use the shorter title");
    });

    it("doesn't open in the first second", async () => {
      const { root } = openCard();
      await press(button(root, "Ask for changes"));
      expect(document.querySelector("dialog")).toBeNull();
    });
  });
});
