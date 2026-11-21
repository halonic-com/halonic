// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

function question(alert: boolean) {
  return (
    <Dialog
      title="Allow this address?"
      alert={alert}
      confirm={{ label: "Allow this address", busyLabel: "Saving…" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
    >
      Only allow an address you recognise.
    </Dialog>
  );
}

verifies("kit.dialog-alert", () => {
  it("makes an alert Dialog an alertdialog, still named by its title and described by its body", () => {
    const dialog = dialogOf(render(question(true)).container);
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Allow this address?");
    const body = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(body?.textContent).toContain("Only allow an address you recognise.");
  });

  it("leaves any other Dialog its own dialog role", () => {
    expect(dialogOf(render(question(false)).container).hasAttribute("role")).toBe(false);
  });
});
