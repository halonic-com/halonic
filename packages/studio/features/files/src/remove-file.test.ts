import type { ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { RemovedFile } from "./files-host.ts";
import { removeFile } from "./remove-file.ts";

function toastsOf() {
  const show = vi.fn();
  return { show, store: { show } as unknown as ToastStore };
}

verifies("files.ui.delete-file", () => {
  it("says the file went to the trash with Undo, and brings it back on Undo", async () => {
    const undo = vi.fn(async () => {});
    const { show, store } = toastsOf();

    await removeFile({ remove: async () => ({ places: 0, undo }) }, store, "agents/models.yaml");

    const toast = show.mock.calls[0]?.[0];
    expect(toast).toMatchObject({ tone: "success", title: "Moved models.yaml to the trash" });
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
      title: "Moved a to the trash.",
      text: "1 place now shows an error until you update it.",
    });
    expect(many.show.mock.calls[0]?.[0]).toMatchObject({
      title: "Moved SKILL.md to the trash.",
      text: "2 places now show an error until you update them.",
    });
  });

  it("says why Undo can't bring the file back", async () => {
    const { show, store } = toastsOf();
    const undo = async () => {
      throw new Error(
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
      .mockRejectedValueOnce(new Error("a.md isn't here any more."))
      .mockResolvedValue({ places: 0, undo: async () => {} });
    const { show, store } = toastsOf();

    await removeFile({ remove }, store, "dir/a.md");

    const toast = show.mock.calls[0]?.[0];
    expect(toast).toMatchObject({
      tone: "danger",
      title: "Couldn't move a.md to the trash: a.md isn't here any more.",
      sticky: true,
    });
    toast.action.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1]?.[0]).toMatchObject({ title: "Moved a.md to the trash" });
  });
});
