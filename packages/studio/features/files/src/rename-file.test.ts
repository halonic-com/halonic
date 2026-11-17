import type { ToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FilePathError, type RenamedFile } from "./files-host.ts";
import { filesWords } from "./files-words.ts";
import { renameFile, typedNameProblem } from "./rename-file.ts";
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

  it("says only the new path in the toast: the places that also update are said under the field", async () => {
    const { show, store } = toastsOf();
    const host = {
      rename: async () => renamed({ places: 3, owners: ["Daily digest", "Support triage"] }),
    };
    await renameFile(host, store, "c.yaml", "d.yaml", effects());
    expect(show.mock.calls[0]?.[0].title).toBe("Renamed to d.yaml");
    expect(show.mock.calls[0]?.[0].text).toBeUndefined();
  });

  it("says the places that also update under the field: up to five names, then four and how many more", () => {
    expect(filesWords.alsoUpdates(3, ["Daily digest (routine)", "Support triage (step 2)"])).toBe(
      "Also updates 3 places: Daily digest (routine), Support triage (step 2)",
    );
    expect(filesWords.alsoUpdates(1, ["A"])).toBe("Also updates 1 place: A");
    expect(filesWords.alsoUpdates(7, ["A", "B", "C", "D", "E", "F"])).toBe(
      "Also updates 7 places: A, B, C, D and 2 more",
    );
  });

  it("checks the typed name: empty, a slash, taken by a file or by a folder, and nothing for its own name", () => {
    const paths = ["agents/a.yaml", "agents/b.yaml", "agents/c/d.yaml"];
    expect(typedNameProblem("agents/a.yaml", "", paths)).toBeDefined();
    expect(typedNameProblem("agents/a.yaml", "x/y.yaml", paths)).toBeDefined();
    expect(typedNameProblem("agents/a.yaml", "b.yaml", paths)).toContain("agents/b.yaml");
    expect(typedNameProblem("agents/a.yaml", "c", paths)).toContain("agents/c");
    expect(typedNameProblem("agents/a.yaml", "a.yaml", paths)).toBeUndefined();
    expect(typedNameProblem("agents/a.yaml", "e.yaml", paths)).toBeUndefined();
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
