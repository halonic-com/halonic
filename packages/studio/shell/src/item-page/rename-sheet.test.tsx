// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RenameSheet } from "./rename-sheet.tsx";

let restoreShowModal: () => void;
beforeEach(() => {
  restoreShowModal = fakeShowModal();
});
afterEach(() => {
  unmountAll();
  restoreShowModal();
});

function showSheet() {
  const onRename = vi.fn();
  const onClose = vi.fn();
  render(<RenameSheet kindName="collection" name="Claims" onRename={onRename} onClose={onClose} />);
  const sheet = document.querySelector("dialog") as HTMLDialogElement;
  const input = sheet.querySelector("input") as HTMLInputElement;
  const rename = [...sheet.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith("Rename"),
  ) as HTMLButtonElement;
  return { sheet, input, rename, onRename, onClose };
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("shell.rename-sheet", () => {
  it("asks for the name, starting with the item's", () => {
    const { sheet, input } = showSheet();
    expect(sheet.textContent).toContain("Rename collection");
    expect(sheet.querySelector("label")?.textContent).toContain("Name");
    expect(input.value).toBe("Claims");
    expect(document.activeElement).toBe(input);
  });

  it("refuses an empty name and stays open", async () => {
    const { sheet, input, rename, onRename, onClose } = showSheet();
    await typeInto(input, "   ");
    await act(async () => rename.click());
    expect(sheet.textContent).toContain("Give it a name.");
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes and renames nothing when the name is the same", async () => {
    const { rename, onRename, onClose } = showSheet();
    await act(async () => rename.click());
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renames to the trimmed name once and closes", async () => {
    const { input, rename, onRename, onClose } = showSheet();
    await typeInto(input, " Claims 2024 ");
    await act(async () => rename.click());
    expect(onRename).toHaveBeenCalledExactlyOnceWith("Claims 2024");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
