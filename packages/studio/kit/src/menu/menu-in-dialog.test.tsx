// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { Dialog } from "../dialog/dialog.tsx";
import { dialogOf, fakeDialogPage, remove, restoreDialogPage } from "../test/dialogs.tsx";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { click, render, unmountAll } from "../test/render.tsx";
import { Menu } from "./menu.tsx";

beforeEach(() => {
  fakeDialogPage();
  fakePopover();
});

afterEach(() => {
  unmountAll();
  restorePopover();
  restoreDialogPage();
});

/** A Dialog whose body has a Menu, opened from the keyboard: focus is on its first item. */
async function openMenuInDialog(onCancel: () => void) {
  const { container } = render(
    <Dialog title="Delete agent?" confirm={remove} onConfirm={vi.fn()} onCancel={onCancel}>
      <Menu
        trigger={(props) => (
          <Button {...props} variant="ghost" icon={<span />} label="More actions for Sorter" />
        )}
        entries={[{ id: "rename", label: "Rename…", onSelect: vi.fn() }]}
      />
    </Dialog>,
  );
  const dialog = dialogOf(container);
  const trigger = dialog.querySelector("[aria-haspopup=menu]") as HTMLButtonElement;
  const menu = dialog.querySelector("[role=menu]") as HTMLElement;
  vi.spyOn(trigger, "matches").mockImplementation((selector) => selector === ":focus-visible");
  trigger.focus();
  await click(trigger);
  return { dialog, trigger, menu };
}

/**
 * Presses Escape where focus is. A browser turns an Escape keydown that nothing prevented into a
 * `cancel` on the open modal, so this does the same: that's the part jsdom leaves out.
 */
async function pressEscape(dialog: HTMLDialogElement): Promise<void> {
  await act(async () => {
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(key);
    if (!key.defaultPrevented) {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    }
  });
}

verifies("kit.menu", () => {
  it("closes only the menu on Escape inside a Dialog; the next Escape cancels the Dialog", async () => {
    const onCancel = vi.fn();
    const { dialog, trigger, menu } = await openMenuInDialog(onCancel);
    expect(isOpen(menu)).toBe(true);

    await pressEscape(dialog);
    expect(isOpen(menu)).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);

    await pressEscape(dialog);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
