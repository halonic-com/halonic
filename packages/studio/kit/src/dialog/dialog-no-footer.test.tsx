// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import {
  buttonNamed,
  dialogOf,
  fakeDialogPage,
  fire,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";
import type { FooterlessDialogProps } from "./dialog-props.ts";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

/** A footerless Dialog like Settings: a list of sections and a field. */
function settingsDialog(overrides: Partial<FooterlessDialogProps> = {}) {
  return (
    <Dialog title="Settings" size="lg" height={640} flush onCancel={() => undefined} {...overrides}>
      <button type="button">Appearance</button>
      <label>
        Model <input name="model" />
      </label>
    </Dialog>
  );
}

verifies("kit.dialog-no-footer", () => {
  it("has no footer and no Cancel", () => {
    const { container } = render(settingsDialog());
    const dialog = dialogOf(container);
    expect(dialog.querySelector("footer")).toBeNull();
    expect(() => buttonNamed(dialog, "Cancel")).toThrow();
    expect(buttonNamed(dialog, "Close Settings")).toBeDefined();
  });

  it("starts focus where the screen asks", () => {
    const { container } = render(
      settingsDialog({ initialFocus: () => buttonNamed(document, "Appearance") }),
    );
    expect(document.activeElement).toBe(buttonNamed(container, "Appearance"));
  });

  it("starts focus on the first field without initialFocus", () => {
    const { container } = render(settingsDialog());
    expect(document.activeElement).toBe(dialogOf(container).querySelector("input"));
  });

  it("starts focus on the close button without a field, and keeps it on a phone", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <Dialog title="Settings" onCancel={() => undefined}>
          Nothing to change here.
        </Dialog>
      </PresentationProvider>,
    );
    expect(document.activeElement).toBe(buttonNamed(container, "Close Settings"));
  });

  it("calls onCancel on Escape and on the close button", () => {
    const onCancel = vi.fn();
    const { container } = render(settingsDialog({ onCancel }));
    const dialog = dialogOf(container);
    fire(dialog, new Event("cancel", { cancelable: true }));
    buttonNamed(dialog, "Close Settings").click();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
