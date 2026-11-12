// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AskForChangesDialog } from "./ask-for-changes-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

// Invented, shaped like the real thing: a prefix and random-looking characters.
const googleSecret = `GOCSPX-${"aB3".repeat(8)}`;
const providerKey = `sk-proj-${"Xy7".repeat(8)}`;
const googleLine =
  "This looks like a Google client secret. Messages are kept in the run log. Put it in the secret field of the Google setup instead.";

function openDialog() {
  const sent: string[] = [];
  function Host() {
    const [note, setNote] = useState("");
    return (
      <AskForChangesDialog
        note={note}
        onNoteChange={setNote}
        busy={false}
        error={undefined}
        onSend={(text) => sent.push(text)}
        onCancel={() => {}}
      />
    );
  }
  render(<Host />);
  return sent;
}

function noteField(): HTMLTextAreaElement {
  const field = document.querySelector("textarea");
  if (field === null) throw new Error("no note field");
  return field;
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
}

async function type(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(noteField(), text);
    noteField().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(name: string) {
  const target = buttonNamed(name);
  if (target === undefined) throw new Error(`no button "${name}"`);
  await act(async () => target.click());
}

verifies("inbox.secret-hold", () => {
  describe("the Ask for changes dialog", () => {
    it("holds a note with a Google client secret and keeps its text and focus", async () => {
      const sent = openDialog();
      await type(`the secret is ${googleSecret}`);
      await click("Send note");
      expect(sent).toEqual([]);
      expect(noteField().value).toBe(`the secret is ${googleSecret}`);
      expect(document.activeElement).toBe(noteField());
      expect(noteField().getAttribute("aria-invalid")).toBe("true");
      expect(document.querySelector("dialog")?.textContent).toContain(googleLine);
      expect(buttonNamed("Send anyway")).toBeDefined();
    });

    it("describes the note with the line, and never repeats the secret", async () => {
      openDialog();
      await type(googleSecret);
      await click("Send note");
      const describedBy = noteField().getAttribute("aria-describedby");
      const line = describedBy === null ? null : document.getElementById(describedBy);
      expect(line?.textContent).toBe(googleLine);
      expect(line?.textContent).not.toContain("aB3");
    });

    it("sends the held note as typed with Send anyway", async () => {
      const sent = openDialog();
      await type(googleSecret);
      await click("Send note");
      await click("Send anyway");
      expect(sent).toEqual([googleSecret]);
    });

    it("clears the line and Send anyway when the secret is deleted, and sends the rest", async () => {
      const sent = openDialog();
      await type(`use ${googleSecret}`);
      await click("Send note");
      await type("use the shorter title");
      expect(document.querySelector("dialog")?.textContent).not.toContain("looks like");
      expect(buttonNamed("Send anyway")).toBeUndefined();
      await click("Send note");
      expect(sent).toEqual(["use the shorter title"]);
    });

    it("points any other key to Providers", async () => {
      openDialog();
      await type(providerKey);
      await click("Send note");
      expect(document.querySelector("dialog")?.textContent).toContain(
        "Put it in Providers instead.",
      );
    });

    it("sends a note that only names a prefix", async () => {
      const sent = openDialog();
      await type("We use sk-learn for this");
      await click("Send note");
      expect(sent).toEqual(["We use sk-learn for this"]);
    });
  });
});
