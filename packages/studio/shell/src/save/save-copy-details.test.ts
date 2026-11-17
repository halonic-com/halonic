import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { SaveState } from "./save-state.ts";

const supportReply = { key: "workflow/acme/support-reply", title: "Support reply" };

function writeError(code: string): Error {
  return Object.assign(new Error(`${code}: write failed`), { code });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

verifies("shell.save-copy-details", () => {
  it("offers Copy details for a reason it can't name, and copies the error", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const toasts = createToastStore();
    await new SaveState(toasts).save(supportReply, () => Promise.reject(writeError("EIO")));

    const [toast] = toasts.list();
    expect(toast?.title).toBe("Couldn't save Support reply.");
    expect(toast?.secondAction).toMatchObject({ label: "Copy details", keepOpen: true });

    toast?.secondAction?.onClick();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("Couldn't save Support reply.");
    expect(copied).toContain("EIO: write failed");
  });

  it("offers no Copy details for a reason it names", async () => {
    const toasts = createToastStore();
    await new SaveState(toasts).save(supportReply, () => Promise.reject(writeError("ENOSPC")));

    expect(toasts.list()[0]?.secondAction).toBeUndefined();
  });
});
