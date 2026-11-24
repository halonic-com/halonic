// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { fakeModal, restoreModal } from "../test/modal.ts";
import { render, unmountAll } from "../test/render.tsx";
import { PanelSheetDialog } from "./panel-sheet-dialog.tsx";

beforeEach(fakeModal);

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  restoreModal();
  for (const each of added.splice(0)) each.remove();
});

const added: HTMLElement[] = [];

/** "See what changes", focused, and its sheet "What changes", which a test can close. */
function openSheet(onClose: () => void = vi.fn(), returnFocus?: () => HTMLElement | null) {
  const opener = document.createElement("button");
  opener.textContent = "See what changes";
  document.body.append(opener);
  added.push(opener);
  opener.focus();
  const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
  const { container, rerender } = render(
    <PresentationProvider presentation="phone">
      <PanelSheetDialog
        title="What changes"
        footer={<button type="button">Accept all</button>}
        onClose={onClose}
        returnFocus={returnFocus}
      >
        <p>Support triage: 2 steps added</p>
      </PanelSheetDialog>
    </PresentationProvider>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  const close = () =>
    rerender(<PresentationProvider presentation="phone">{null}</PresentationProvider>);
  return { opener, showModal, dialog, close };
}

verifies("kit.panel-sheet-dialog", () => {
  it("opens as a modal dialog named once by its title, with focus on the title", () => {
    const { showModal, dialog } = openSheet();

    expect(showModal.mock.contexts).toEqual([dialog]);
    const title = dialog.querySelector("h2");
    expect(dialog.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(title?.textContent).toBe("What changes");
    expect(document.activeElement).toBe(title);
    expect(dialog.textContent).toContain("Accept all");
    expect(dialog.querySelector("aside, header, footer, [role='region']")).toBeNull();
  });

  it("calls onClose on Escape and on Back", () => {
    const onClose = vi.fn();
    const { dialog } = openSheet(onClose);

    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    act(() => dialog.querySelector<HTMLButtonElement>("button[aria-label='Back']")?.click());

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("gives focus back to the opener, or to returnFocus once the opener has gone", () => {
    const first = openSheet();
    first.close();
    expect(document.activeElement).toBe(first.opener);
    unmountAll();

    const line = document.createElement("div");
    line.tabIndex = -1;
    document.body.append(line);
    added.push(line);
    const second = openSheet(vi.fn(), () => line);
    second.opener.remove();
    second.close();
    expect(document.activeElement).toBe(line);
  });
});
