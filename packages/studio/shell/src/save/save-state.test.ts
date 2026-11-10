import { createToastStore, type ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it, vi } from "vitest";
import { couldNotSaveText, SaveState, type SavingItem } from "./save-state.ts";

const supportReply: SavingItem = { key: "workflow/acme/support-reply", title: "Support reply" };
const sorter: SavingItem = { key: "agent/acme/sorter", title: "Sorter" };

let toasts: ToastStore;
let saving: SaveState;

beforeEach(() => {
  toasts = createToastStore();
  saving = new SaveState(toasts);
});

function failedNote(count: number, first: SavingItem) {
  return { kind: "failed", count, first };
}

function writeError(code: string): Error {
  return Object.assign(new Error(`${code}: write failed`), { code });
}

/** A write that waits until the test lets it finish or fail. */
function pendingWrite() {
  let finish = () => {};
  let fail: (error: unknown) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { write: () => done, finish, fail };
}

verifies("shell.save-state", () => {
  it("says Saved before anything is written", () => {
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("says Saving while a write runs, and Saved once it's done", async () => {
    const pending = pendingWrite();
    const saved = saving.save(supportReply, pending.write);
    expect(saving.note).toEqual({ kind: "saving" });

    pending.finish();
    expect(await saved).toBe(true);
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("says Couldn't save and shows the error toast with its reason and Try again", async () => {
    expect(await saving.save(supportReply, () => Promise.reject(writeError("ENOSPC")))).toBe(false);

    expect(saving.note).toEqual(failedNote(1, supportReply));
    expect(toasts.list()).toEqual([
      expect.objectContaining({
        tone: "danger",
        title: "Couldn't save Support reply: the disk is full.",
        action: expect.objectContaining({ label: "Try again" }),
      }),
    ]);
  });

  it("runs the same write again on Try again, and closes the toast once it saves", async () => {
    const write = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(writeError("EBUSY"))
      .mockResolvedValue(undefined);
    await saving.save(supportReply, write);

    saving.tryAgain();
    await vi.waitFor(() => expect(saving.note).toEqual({ kind: "saved" }));
    expect(write).toHaveBeenCalledTimes(2);
    expect(toasts.list()).toEqual([]);
  });

  it("runs the write again from the toast's Try again too", async () => {
    const write = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(writeError("EROFS"))
      .mockResolvedValue(undefined);
    await saving.save(supportReply, write);

    toasts.list()[0]?.action?.onClick();
    await vi.waitFor(() => expect(saving.note).toEqual({ kind: "saved" }));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("ignores an older write that fails after a newer one of the same item started", async () => {
    const older = pendingWrite();
    const newer = pendingWrite();
    const olderSaved = saving.save(supportReply, older.write);
    const newerSaved = saving.save(supportReply, newer.write);

    older.fail(writeError("ENOSPC"));
    expect(await olderSaved).toBe(false);
    newer.finish();
    expect(await newerSaved).toBe(true);

    expect(saving.note).toEqual({ kind: "saved" });
    expect(toasts.list()).toEqual([]);
  });

  it("keeps a newer write's failure when an older write saves after it", async () => {
    const older = pendingWrite();
    const newerWrite = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(writeError("EBUSY"))
      .mockResolvedValue(undefined);
    const olderSaved = saving.save(supportReply, older.write);
    expect(await saving.save(supportReply, newerWrite)).toBe(false);

    older.finish();
    expect(await olderSaved).toBe(true);
    expect(saving.note).toEqual(failedNote(1, supportReply));

    saving.tryAgain();
    await vi.waitFor(() => expect(saving.note).toEqual({ kind: "saved" }));
    expect(newerWrite).toHaveBeenCalledTimes(2);
  });

  it("keeps Couldn't save above every other note while any item failed", async () => {
    await saving.save(supportReply, () => Promise.reject(writeError("EACCES")));
    saving.setFieldsNotSaved(sorter, 1);
    saving.holdForOutsideChange(sorter, () => {});
    void saving.save(sorter, pendingWrite().write);

    expect(saving.note).toEqual(failedNote(1, supportReply));
  });

  it("counts the items that failed, and names one", async () => {
    const failing = () => Promise.reject(writeError("ENOSPC"));
    await saving.save(supportReply, failing);
    await saving.save(sorter, failing);
    expect(saving.note).toEqual(failedNote(2, supportReply));

    await saving.save(supportReply, () => Promise.resolve());
    expect(saving.note).toEqual(failedNote(1, sorter));
  });

  it("forgets a deleted or closed item: its failure, its toast and its hold", async () => {
    await saving.save(supportReply, () => Promise.reject(writeError("ENOSPC")));
    saving.holdForOutsideChange(sorter, () => {});
    saving.setFieldsNotSaved(sorter, 2);

    saving.forget(supportReply.key);
    expect(toasts.list()).toEqual([]);
    expect(saving.note).toEqual({ kind: "items-not-saved", count: 1, first: sorter });

    saving.forget(sorter.key);
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("ignores the failure of a write still running when its item is forgotten", async () => {
    const pending = pendingWrite();
    const saved = saving.save(supportReply, pending.write);
    saving.forget(supportReply.key);
    expect(saving.note).toEqual({ kind: "saved" });

    pending.fail(writeError("ENOSPC"));
    expect(await saved).toBe(false);
    expect(saving.note).toEqual({ kind: "saved" });
    expect(toasts.list()).toEqual([]);
  });

  it("does nothing when it forgets an item it doesn't know", () => {
    const listener = vi.fn();
    saving.subscribe(listener);
    saving.forget("nothing/known");
    expect(listener).not.toHaveBeenCalled();
  });

  it("counts fields with a mistake over every item, and says Saved once they're fixed", () => {
    saving.setFieldsNotSaved(supportReply, 1);
    saving.setFieldsNotSaved(sorter, 2);
    expect(saving.note).toEqual({ kind: "fields-not-saved", count: 3 });

    saving.setFieldsNotSaved(sorter, 0);
    expect(saving.note).toEqual({ kind: "fields-not-saved", count: 1 });
    saving.setFieldsNotSaved(supportReply, 0);
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("shows fields not saved over a write that runs for the rest of the item", () => {
    saving.setFieldsNotSaved(supportReply, 1);
    void saving.save(supportReply, pendingWrite().write);

    expect(saving.note).toEqual({ kind: "fields-not-saved", count: 1 });
  });

  it("says which items an outside change holds back, and opens Compare for the first", () => {
    const compareSorter = vi.fn();
    saving.setFieldsNotSaved(supportReply, 1);
    saving.holdForOutsideChange(sorter, compareSorter);
    saving.holdForOutsideChange(supportReply, () => {});
    expect(saving.note).toEqual({ kind: "items-not-saved", count: 2, first: sorter });

    saving.compare();
    expect(compareSorter).toHaveBeenCalledOnce();

    saving.releaseHold(sorter.key);
    saving.releaseHold(supportReply.key);
    expect(saving.note).toEqual({ kind: "fields-not-saved", count: 1 });
  });

  it("opens the newest Compare for an item held again, keeping its place", () => {
    const compareAgain = vi.fn();
    saving.holdForOutsideChange(sorter, () => {});
    saving.holdForOutsideChange(supportReply, () => {});
    saving.holdForOutsideChange(sorter, compareAgain);

    expect(saving.note).toEqual({ kind: "items-not-saved", count: 2, first: sorter });
    saving.compare();
    expect(compareAgain).toHaveBeenCalledOnce();
  });

  it.each([-1, 1.5, Number.NaN])("refuses %d as a count of fields not saved", (count) => {
    expect(() => saving.setFieldsNotSaved(supportReply, count)).toThrow(RangeError);
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("uses an item's new name after a rename", async () => {
    saving.holdForOutsideChange(sorter, () => {});
    const renamed = { key: sorter.key, title: "Sorter v2" };
    await saving.save(renamed, () => Promise.reject(writeError("EIO")));

    expect(toasts.list()[0]?.title).toBe("Couldn't save Sorter v2.");
    saving.releaseHold(sorter.key);
    expect(saving.note).toEqual(failedNote(1, renamed));
  });

  it("tells listeners only when the note changes", () => {
    const listener = vi.fn();
    const stop = saving.subscribe(listener);

    saving.setFieldsNotSaved(supportReply, 0);
    saving.releaseHold("nothing/held");
    expect(listener).not.toHaveBeenCalled();

    saving.setFieldsNotSaved(supportReply, 2);
    saving.setFieldsNotSaved(supportReply, 2);
    expect(listener).toHaveBeenCalledOnce();

    stop();
    saving.setFieldsNotSaved(supportReply, 0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it.each([
    ["disk-full", "Couldn't save Support reply: the disk is full."],
    ["not-writable", "Couldn't save Support reply: Halonic can't write to this folder."],
    ["in-use", "Couldn't save Support reply: another app is using the file."],
    ["failed", "Couldn't save Support reply."],
  ] as const)("words the %s reason as %j", (reason, text) => {
    expect(couldNotSaveText("Support reply", reason)).toBe(text);
  });
});
