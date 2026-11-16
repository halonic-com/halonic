// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RenameFileDialog } from "./rename-file-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const from = "library/collections/claims.collection.yaml";

function setup(
  options: {
    rename?: (from: string, to: string) => Promise<void>;
    taken?: string[];
    places?: number;
  } = {},
) {
  const host = {
    read: vi.fn(async (path: string) => (options.taken?.includes(path) ? "text" : null)),
    rename: vi.fn(options.rename ?? (async () => {})),
    renameImpact: vi.fn(async () => options.places ?? 0),
  };
  const onRenamed = vi.fn();
  const onCancel = vi.fn();
  const page = render(
    <RenameFileDialog host={host} path={from} onRenamed={onRenamed} onCancel={onCancel} />,
  );
  return { page, host, onRenamed, onCancel };
}

function field(page: HTMLElement): HTMLInputElement {
  const input = page.ownerDocument.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("no field");
  return input;
}

async function type(page: HTMLElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(field(page), value);
    field(page).dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function rename(page: HTMLElement) {
  const button = [...page.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith("Rename"),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = (page: HTMLElement) => page.ownerDocument.body.textContent ?? "";

verifies("files.ui.rename-file", () => {
  it("starts with the file's own path", () => {
    const { page } = setup();
    expect(field(page).value).toBe(from);
  });

  it("says when the path is the file's own and does not ask the host", async () => {
    const { page, host } = setup();
    await rename(page);
    expect(text(page)).toContain("That is the file's own path.");
    expect(host.rename).not.toHaveBeenCalled();
  });

  it("refuses a path with no name, outside the workspace or in the local data", async () => {
    const { page, host } = setup();
    await type(page, "library/collections/");
    await rename(page);
    expect(text(page)).toContain("Give the file a name");
    await type(page, "../x.yaml");
    await rename(page);
    expect(text(page)).toContain("Files must stay inside the workspace.");
    await type(page, ".studio/x.yaml");
    await rename(page);
    expect(text(page)).toContain('".studio/x.yaml" is not part of the workspace definitions');
    expect(host.rename).not.toHaveBeenCalled();
  });

  it("says a taken path while typing", async () => {
    const taken = "library/collections/orders.collection.yaml";
    const { page } = setup({ taken: [taken] });
    await type(page, taken);
    expect(text(page)).toContain(`${taken} already exists.`);
  });

  it("says how many places it also updates", async () => {
    const { page, host } = setup({ places: 3 });
    await type(page, "library/collections/cases.collection.yaml");
    expect(host.renameImpact).toHaveBeenLastCalledWith(
      from,
      "library/collections/cases.collection.yaml",
    );
    expect(text(page)).toContain("Also updates 3 places");
  });

  it("says place for one", async () => {
    const { page } = setup({ places: 1 });
    await type(page, "library/collections/cases.collection.yaml");
    expect(text(page)).toContain("Also updates 1 place");
    expect(text(page)).not.toContain("1 places");
  });

  it("shows the host's sentence under the field and stays open", async () => {
    const { page, onRenamed } = setup({
      rename: async () => {
        throw new Error("The file is gone.");
      },
    });
    await type(page, "library/collections/cases.collection.yaml");
    await rename(page);
    expect(text(page)).toContain("The file is gone.");
    expect(onRenamed).not.toHaveBeenCalled();
    expect(field(page).disabled).toBe(false);
  });

  it("renames the file and tells the caller", async () => {
    const { page, host, onRenamed } = setup();
    await type(page, " library/collections/cases.collection.yaml ");
    await rename(page);
    expect(host.rename).toHaveBeenCalledWith(from, "library/collections/cases.collection.yaml");
    expect(onRenamed).toHaveBeenCalledWith("library/collections/cases.collection.yaml");
  });
});
