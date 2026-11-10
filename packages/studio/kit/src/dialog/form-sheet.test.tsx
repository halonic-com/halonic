// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { useInFormSheet } from "../sheet/in-form-sheet.ts";
import {
  buttonNamed,
  dialogOf,
  fakeDialogPage,
  fire,
  nameOf,
  newAgentDialog,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";
import type { DialogProps } from "./dialog-props.ts";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function onPhone(overrides: Partial<DialogProps> = {}) {
  return render(
    <PresentationProvider presentation="phone">{newAgentDialog(overrides)}</PresentationProvider>,
  );
}

verifies("kit.dialog-form-sheet", () => {
  it("fills the screen as a sheet, still a modal <dialog>", () => {
    const { container } = onPhone();
    const sheet = dialogOf(container);
    expect(sheet.open).toBe(true);
    expect(sheet.className).toContain("h-(--app-height,100dvh)");
    expect(sheet.className).toContain("rounded-none border-0 bg-surface");
    expect(sheet.className).not.toContain("w-dialog-sm");
  });

  it("puts Close at the top left, no ✕ at the right and no Cancel, and focuses the title", () => {
    const { container } = onPhone();
    const bar = container.querySelector("header") as HTMLElement;
    expect((bar.firstElementChild as HTMLElement).getAttribute("aria-label")).toBe("Close");
    const title = bar.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("New agent");
    expect(document.activeElement).toBe(title);
    const names = [...container.querySelectorAll("button")].map(nameOf);
    expect(names).toEqual(["Close", "Create agent"]);
  });

  it("lays the fields out 12px 16px and 16px apart in a body that scrolls", () => {
    const { container } = onPhone();
    const field = container.querySelector("input") as HTMLInputElement;
    const fields = field.closest(".gap-4") as HTMLElement;
    expect(fields.className).toContain("flex flex-col gap-4 px-4 py-3");
    expect((fields.parentElement as HTMLElement).className).toContain("overflow-y-auto");
  });

  it("puts the confirming button full width and 48px in an ActionBar under the body", () => {
    const { container } = onPhone();
    const create = buttonNamed(container, "Create agent");
    expect(create.getAttribute("type")).toBe("submit");
    expect(create.className).toContain("min-h-touch");
    expect(create.className).toContain("w-full");
    expect(create.className).toContain("bg-primary");
    const bar = create.closest(".action-bar") as HTMLElement;
    expect(bar.getAttribute("data-while-typing")).toBe("ride");
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.lastElementChild).toBe(bar);
  });

  it("confirms on the button and on Enter in a field: one form", async () => {
    const onConfirm = vi.fn();
    const { container } = onPhone({ onConfirm });
    await click(buttonNamed(container, "Create agent"));
    const form = container.querySelector("form") as HTMLFormElement;
    fire(form, new Event("submit", { bubbles: true, cancelable: true }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("cancels on Close and on Escape, asking nothing", async () => {
    const onCancel = vi.fn();
    const { container } = onPhone({ onCancel });
    await click(buttonNamed(container, "Close"));
    fire(dialogOf(container), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("while busy, makes Close unavailable with the busy button as its reason, and ignores Escape", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = onPhone({ busy: true, onCancel, onConfirm });
    const create = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(create.getAttribute("aria-busy")).toBe("true");
    const close = buttonNamed(container, "Close");
    expect(close.getAttribute("aria-disabled")).toBe("true");
    expect(close.getAttribute("aria-describedby")).toBe(create.id);
    await click(close);
    fire(dialogOf(container), new Event("cancel", { cancelable: true }));
    fire(
      container.querySelector("form") as HTMLFormElement,
      new Event("submit", { cancelable: true }),
    );
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows a failed submit as the last thing in the body, above the bar, through the alert slot", async () => {
    const { container } = onPhone({ error: "Couldn't create the agent. The folder is read-only." });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const slot = container.querySelector('[role="alert"]') as HTMLElement;
    expect(slot.textContent).toContain("The folder is read-only.");
    const body = slot.closest(".overflow-y-auto") as HTMLElement;
    expect(body.lastElementChild?.contains(slot)).toBe(true);
  });

  it("tells the parts inside that they're in a form sheet", () => {
    function Probe() {
      return <span data-testid="probe">{String(useInFormSheet())}</span>;
    }
    const { container } = render(
      <PresentationProvider presentation="phone">
        <Dialog
          title="New agent"
          form
          confirm={{ label: "Create agent", busyLabel: "Creating…" }}
          onConfirm={() => undefined}
          onCancel={() => undefined}
        >
          <Probe />
        </Dialog>
      </PresentationProvider>,
    );
    expect(container.querySelector('[data-testid="probe"]')?.textContent).toBe("true");
  });

  it("stays a centred box on desktop, and for a confirmation on a phone", () => {
    const desktop = render(newAgentDialog());
    expect(dialogOf(desktop.container).className).toContain("w-dialog-sm");
    expect(desktop.container.querySelector(".action-bar")).toBeNull();
  });
});
