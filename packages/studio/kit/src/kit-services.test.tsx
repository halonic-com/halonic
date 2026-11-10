// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClipboardProvider, useWriteClipboard } from "./copy-button/clipboard.tsx";
import { copyText } from "./copy-button/copy-text.ts";
import { Dialog } from "./dialog/dialog.tsx";
import { type ModalLiveRegion, useModalPolite } from "./dialog/modal-regions.tsx";
import { fakeDialogPage, restoreDialogPage } from "./test/dialogs.tsx";
import { render, unmountAll } from "./test/render.tsx";
import { ToastStoreProvider, useToastStore } from "./toast/toast-provider.tsx";
import { createToastStore, type ToastStore } from "./toast/toast-store.ts";

beforeEach(() => {
  fakeDialogPage();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

/** Reads what a part gets from each service where it renders. */
function Probe({ seen }: { seen: { region?: ModalLiveRegion | null; store?: ToastStore | null } }) {
  seen.region = useModalPolite();
  seen.store = useToastStore();
  return null;
}

function WriterProbe({ seen }: { seen: { writer?: unknown } }) {
  seen.writer = useWriteClipboard();
  return null;
}

verifies("kit.kit-services", () => {
  it("gives a part inside a Dialog the Dialog's polite region", () => {
    const seen: { region?: ModalLiveRegion | null } = {};
    const { container } = render(
      <Dialog
        title="Trust"
        confirm={{ label: "Done", busyLabel: "Saving…" }}
        onConfirm={() => 0}
        onCancel={() => 0}
      >
        <Probe seen={seen} />
      </Dialog>,
    );
    act(() => seen.region?.say("Copied"));
    act(() => vi.advanceTimersToNextFrame());
    const polite = container.querySelector('dialog > [aria-live="polite"]') as HTMLElement;
    expect(polite.textContent).toBe("Copied");
  });

  it("gives a part outside a Dialog no region and, without a provider, no toast store", () => {
    const seen: { region?: ModalLiveRegion | null; store?: ToastStore | null } = {};
    render(<Probe seen={seen} />);
    expect(seen.region).toBeNull();
    expect(seen.store).toBeNull();
  });

  it("gives a part the store the shell provides", () => {
    const store = createToastStore();
    const seen: { store?: ToastStore | null } = {};
    render(
      <ToastStoreProvider store={store}>
        <Probe seen={seen} />
      </ToastStoreProvider>,
    );
    expect(seen.store).toBe(store);
  });

  it("copies through the browser by default and through the shell's writer when it gives one", () => {
    const writer = async () => true;
    const seen: { writer?: unknown } = {};
    render(<WriterProbe seen={seen} />);
    expect(seen.writer).toBe(copyText);
    render(
      <ClipboardProvider writeClipboard={writer}>
        <WriterProbe seen={seen} />
      </ClipboardProvider>,
    );
    expect(seen.writer).toBe(writer);
  });
});
