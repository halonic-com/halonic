import type { ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FilePathError, type RenamedFile } from "./files-host.ts";
import { renameFile } from "./rename-file.ts";
import { kinded } from "./test-support/kinded.ts";

function toastsOf() {
  const show = vi.fn();
  return { show, store: { show } as unknown as ToastStore };
}

const effects = () => ({ moved: vi.fn(), movedBack: vi.fn() });
const renamed = (over: Partial<RenamedFile> = {}): RenamedFile => ({
  places: 0,
  owners: [],
  undo: async () => {},
  ...over,
});

verifies("files.ui.rename-file", () => {
  it("renames inside the folder and says so with Undo, which moves the file back", async () => {
    const undo = vi.fn(async () => {});
    const rename = vi.fn(async () => renamed({ undo }));
    const { show, store } = toastsOf();
    const seen = effects();

    const refused = await renameFile({ rename }, store, "agents/a.yaml", " b.yaml ", seen);

    expect(refused).toBeUndefined();
    expect(rename).toHaveBeenCalledWith("agents/a.yaml", "agents/b.yaml");
    expect(seen.moved).toHaveBeenCalledWith("agents/b.yaml");
    const toast = show.mock.calls[0]?.[0];
    expect(toast).toMatchObject({ tone: "success", title: "Renamed to agents/b.yaml" });
    expect(toast.text).toBeUndefined();
    toast.action.onClick();
    await vi.waitFor(() => expect(seen.movedBack).toHaveBeenCalledWith("agents/a.yaml"));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("names the places that also update", async () => {
    const { show, store } = toastsOf();
    const host = {
      rename: async () => renamed({ places: 3, owners: ["Daily digest", "Support triage"] }),
    };
    await renameFile(host, store, "c.yaml", "d.yaml", effects());
    expect(show.mock.calls[0]?.[0].title).toBe("Renamed to d.yaml.");
    expect(show.mock.calls[0]?.[0].text).toBe(
      "Also updated 3 places: Daily digest, Support triage.",
    );
  });

  it("shows at most three names, then how many more", async () => {
    const { show, store } = toastsOf();
    const host = {
      rename: async () =>
        renamed({ places: 5, owners: ["Support agent", "Billing hub", "Triage", "A", "B"] }),
    };
    await renameFile(host, store, "c.yaml", "d.yaml", effects());
    expect(show.mock.calls[0]?.[0].text).toBe(
      "Also updated 5 places: Support agent, Billing hub, Triage and 2 more.",
    );
  });

  it("gives the host's sentence for a refused name and shows no toast", async () => {
    const { show, store } = toastsOf();
    const rename = async () => {
      throw new FilePathError("b.yaml already exists.");
    };
    expect(await renameFile({ rename }, store, "a.yaml", "b.yaml", effects())).toBe(
      "b.yaml already exists.",
    );
    expect(show).not.toHaveBeenCalled();
  });

  it("refuses an empty name or one with a slash without asking the host", async () => {
    const rename = vi.fn();
    expect(await renameFile({ rename }, null, "a.yaml", "  ", effects())).toContain(
      "Give the file",
    );
    expect(await renameFile({ rename }, null, "a.yaml", "x/y.yaml", effects())).toBe(
      "A name can't contain a slash.",
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("says why Undo can't move the file back", async () => {
    const { show, store } = toastsOf();
    const seen = effects();
    const undo = async () => {
      throw kinded("conflict", "b.yaml can't be moved back, because the workspace changed.");
    };
    await renameFile({ rename: async () => renamed({ undo }) }, store, "a.yaml", "b.yaml", seen);
    show.mock.calls[0]?.[0].action.onClick();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2));
    expect(show.mock.calls[1]?.[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't move b.yaml back",
      text: "b.yaml can't be moved back, because the workspace changed.",
    });
    expect(seen.movedBack).not.toHaveBeenCalled();
  });
});
