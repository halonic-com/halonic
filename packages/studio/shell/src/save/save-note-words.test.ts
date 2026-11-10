import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { announceSaveNotes, saveNoteWords } from "./save-note-words.ts";
import { SaveState, type SavingItem } from "./save-state.ts";

const supportReply: SavingItem = { key: "workflow/acme/support-reply", title: "Support reply" };
const sorter: SavingItem = { key: "agent/acme/sorter", title: "Sorter" };

const failing = () => Promise.reject(Object.assign(new Error("full"), { code: "ENOSPC" }));

verifies("shell.save-note", () => {
  it.each([
    [
      { kind: "failed", count: 1, first: supportReply },
      { text: "Couldn't save Support reply", mark: "danger", action: "try-again" },
    ],
    [
      { kind: "failed", count: 2, first: supportReply },
      { text: "Couldn't save 2 items", mark: "danger", action: "try-again" },
    ],
    [
      { kind: "items-not-saved", count: 1, first: sorter },
      { text: "1 item not saved", mark: "warning", action: "compare" },
    ],
    [
      { kind: "items-not-saved", count: 3, first: sorter },
      { text: "3 items not saved", mark: "warning", action: "compare" },
    ],
    [
      { kind: "fields-not-saved", count: 1 },
      { text: "1 field not saved", mark: "warning" },
    ],
    [
      { kind: "fields-not-saved", count: 2 },
      { text: "2 fields not saved", mark: "warning" },
    ],
    [{ kind: "saving" }, { text: "Saving…", mark: "none" }],
    [{ kind: "saved" }, { text: "Saved", name: "All changes saved", mark: "check" }],
  ] as const)("words %j as %j", (note, words) => {
    expect(saveNoteWords(note)).toEqual(words);
  });

  describe("announceSaveNotes", () => {
    let saving: SaveState;
    let said: string[];
    let timers: FakeTimers;
    const flush = () => timers.advance(0);

    beforeEach(() => {
      saving = new SaveState(createToastStore());
      timers = new FakeTimers();
      const announcer = createAnnouncer({ timers });
      said = [];
      announcer.mountRegions({
        polite: { say: (text) => said.push(`polite: ${text}`) },
        assertive: { say: (text) => said.push(`assertive: ${text}`) },
      });
      announceSaveNotes(saving, announcer);
    });

    it("reads items not saved out once", () => {
      saving.holdForOutsideChange(sorter, () => {});
      saving.holdForOutsideChange(supportReply, () => {});
      flush();
      expect(said).toEqual(["polite: 1 item not saved."]);
    });

    it("leaves Couldn't save to the toast's alert", async () => {
      await saving.save(supportReply, failing);
      await saving.save(sorter, failing);
      flush();
      expect(said).toEqual([]);
    });

    it("never reads out Saving, Saved or fields not saved", async () => {
      await saving.save(supportReply, () => Promise.resolve());
      saving.setFieldsNotSaved(supportReply, 1);
      flush();
      expect(said).toEqual([]);
    });

    it("reads items not saved out again after the hold was released in between", () => {
      saving.holdForOutsideChange(sorter, () => {});
      // Past the announcer's 2 s, in which it drops the same words.
      timers.advance(2_500);
      saving.releaseHold(sorter.key);
      saving.holdForOutsideChange(sorter, () => {});
      flush();
      expect(said).toEqual(["polite: 1 item not saved.", "polite: 1 item not saved."]);
    });
  });
});
