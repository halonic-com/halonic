import type { ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { RemovedFile } from "./files-host.ts";
import { removeFile } from "./remove-file.ts";
import { kinded } from "./test-support/kinded.ts";
import { trashedFile } from "./trash.ts";

function toastsOf() {
  const show = vi.fn();
  return { show, store: { show } as unknown as ToastStore };
}

verifies("files.ui.delete-file", () => {
  it("says the file was deleted with Undo, and brings it back on Undo", async () => {
    const undo = vi.fn(async () => {});
    const { show, store } = toastsOf();

    await removeFile({ remove: async () => ({ places: 0, undo }) }, store, "agents/models.yaml");

    const toast = show.mock.calls[0]?.[0];
    expect(toast).toMatchObject({
      tone: "success",
      title: "Deleted agents/models.yaml",
    });
    expect(toast.text).toBeUndefined();
    toast.action.onClick();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("adds a second line when other files name the file", async () => {
    const remove = async (): Promise<RemovedFile> => ({ places: 2, undo: async () => {} });
    const one = toastsOf();
    const many = toastsOf();

    await removeFile({ remove: async () => ({ places: 1, undo: async () => {} }) }, one.store, "a");
    await removeFile({ remove }, many.store, "SKILL.md");

    expect(one.show.mock.calls[0]?.[0]).toMatchObject({
      title: "Deleted a.",
      text: "1 place now shows an error until you update it.",
    });
    expect(many.show.mock.calls[0]?.[0]).toMatchObject({
      title: "Deleted SKILL.md.",
      text: "2 places now show an error until you update them.",
    });
  });

  it("says why Undo can't bring the file back", async () => {
    const { show, store } = toastsOf();
    const undo = async () => {
      throw kinded(
        "conflict",
        "a.md can't be put back, because the workspace changed after it was deleted.",
      );
    };

    await removeFile({ remove: async () => ({ places: 0, undo }) }, store, "a.md");
    show.mock.calls[0]?.[0].action.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(show.mock.calls[1]?.[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't put a.md back",
      text: "a.md can't be put back, because the workspace changed after it was deleted.",
    });
  });

  it("keeps a toast with the reason and Try again when the host refuses", async () => {
    const remove = vi
      .fn<() => Promise<RemovedFile>>()
      .mockRejectedValueOnce(kinded("not_found", "a.md isn't here any more."))
      .mockResolvedValue({ places: 0, undo: async () => {} });
    const { show, store } = toastsOf();

    await removeFile({ remove }, store, "dir/a.md");

    const toast = show.mock.calls[0]?.[0];
    expect(toast).toMatchObject({
      tone: "danger",
      title: "Couldn't delete dir/a.md: a.md isn't here any more.",
      sticky: true,
    });
    toast.action.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1]?.[0]).toMatchObject({ title: "Deleted dir/a.md" });
  });

  it("says what to do instead, with no Try again, when trying again can't help", async () => {
    const refusal = Object.assign(
      kinded("unavailable", "Studio can't delete a skill that has other files in its folder yet."),
      { fix: "To delete pdf, delete the folder skills/pdf in Finder." },
    );
    const { show, store } = toastsOf();

    await removeFile({ remove: async () => Promise.reject(refusal) }, store, "skills/pdf/SKILL.md");

    const toast = show.mock.calls[0]?.[0];
    expect(toast).toEqual({
      tone: "danger",
      title: "Studio can't delete a skill that has other files in its folder yet.",
      text: "To delete pdf, delete the folder skills/pdf in Finder.",
      sticky: true,
    });
  });

  it("tells the tree when the file is in the trash and when Undo brought it back", async () => {
    const { show, store } = toastsOf();
    const removed = vi.fn();
    const restored = vi.fn();

    await removeFile({ remove: async () => ({ places: 0, undo: async () => {} }) }, store, "a.md", {
      removed,
      restored,
    });
    expect(removed).toHaveBeenCalledOnce();
    expect(restored).not.toHaveBeenCalled();
    expect(trashedFile("a.md")).toBeDefined();

    show.mock.calls[0]?.[0].action.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(restored).toHaveBeenCalledOnce();
    expect(trashedFile("a.md")).toBeUndefined();
  });
});
