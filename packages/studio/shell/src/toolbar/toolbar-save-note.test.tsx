// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SaveState, type SavingItem } from "../save/save-state.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SAVING_AFTER_MS, ToolbarSaveNote } from "./toolbar-save-note.tsx";

const supportReply: SavingItem = { key: "workflow/acme/support-reply", title: "Support reply" };
const sorter: SavingItem = { key: "agent/acme/sorter", title: "Sorter" };

let saving: SaveState;
let timers: FakeTimers;
let note: HTMLElement;

beforeEach(() => {
  saving = new SaveState(createToastStore());
  timers = new FakeTimers();
  note = render(<ToolbarSaveNote saving={saving} timers={timers} />);
});

afterEach(unmountAll);

/** What a screen reader reads: the text, without what's hidden from it, with each mark's name. */
function spoken(): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof HTMLElement) {
      if (node.getAttribute("aria-hidden") === "true") {
        return;
      }
      if (node.getAttribute("role") === "img") {
        parts.push(node.getAttribute("aria-label") ?? "");
        return;
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
    }
    node.childNodes.forEach(walk);
  };
  walk(note);
  return parts.filter((part) => part.trim() !== "").join(" ");
}

function pendingWrite() {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { write: () => done, finish: () => act(async () => finish()) };
}

function advance(ms: number) {
  act(() => timers.advance(ms));
}

async function failSave(item: SavingItem, write = vi.fn(() => Promise.reject(new Error("no")))) {
  await act(() => saving.save(item, write));
  return write;
}

verifies("shell.save-note", () => {
  it("shows ✓ Saved, named All changes saved", () => {
    expect(note.textContent).toBe("✓Saved" + "All changes saved");
    expect(spoken()).toBe("All changes saved");
  });

  it("doesn't flash Saving… for a write shorter than 300ms", async () => {
    const pending = pendingWrite();
    act(() => void saving.save(supportReply, pending.write));
    advance(SAVING_AFTER_MS - 1);
    expect(spoken()).toBe("All changes saved");

    await pending.finish();
    advance(SAVING_AFTER_MS);
    expect(spoken()).toBe("All changes saved");
  });

  it("shows Saving… once a write has run for 300ms", async () => {
    const pending = pendingWrite();
    act(() => void saving.save(supportReply, pending.write));
    advance(SAVING_AFTER_MS);
    expect(spoken()).toBe("Saving…");

    await pending.finish();
    expect(spoken()).toBe("All changes saved");
  });

  it("names the item that couldn't be saved, with a named mark, and tries again", async () => {
    const write = await failSave(supportReply);
    expect(spoken()).toBe("Error Couldn't save Support reply Try again");

    // Try again writes again, and the note follows once that write fails too.
    await act(async () => note.querySelector("button")?.click());
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("counts the items when several couldn't be saved", async () => {
    await failSave(supportReply);
    await failSave(sorter);
    expect(spoken()).toBe("Error Couldn't save 2 items Try again");
  });

  it("shows items not saved with a warning mark, and Compare opens the item held longest", () => {
    const compare = vi.fn();
    act(() => saving.holdForOutsideChange(sorter, compare));
    expect(spoken()).toBe("Warning 1 item not saved Compare");

    act(() => note.querySelector("button")?.click());
    expect(compare).toHaveBeenCalledOnce();
  });

  it("shows fields not saved with a warning mark and no button", () => {
    act(() => saving.setFieldsNotSaved(supportReply, 2));
    expect(spoken()).toBe("Warning 2 fields not saved");
    expect(note.querySelector("button")).toBeNull();
  });

  it("is no live region: announceSaveNotes reads it out", () => {
    expect(note.querySelector("[role=status], [role=alert], [aria-live]")).toBeNull();
  });
});
