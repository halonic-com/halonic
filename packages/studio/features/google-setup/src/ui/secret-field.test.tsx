// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SecretReplaceAnswer } from "../api.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SecretField, type SecretFieldHandle, type SecretFieldProps } from "./secret-field.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

// An invented value, shaped like a client secret. Nothing here is real.
const fake = "GOCSPX-fake-0000";

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function show(props: Partial<SecretFieldProps> = {}) {
  const handle = createRef<SecretFieldHandle>();
  const onSave = vi.fn(async () => {});
  const onReplace = vi.fn(
    async (): Promise<SecretReplaceAnswer> => ({ kind: "accepted", usedBy: [] }),
  );
  const container = render(
    <SecretField
      savedAt={null}
      keptOn="this-computer"
      plainHttp={false}
      answering
      handle={handle}
      onSave={onSave}
      onReplace={onReplace}
      beforeFirstSignIn={false}
      startReplacing={false}
      clientsLink={null}
      onTyped={() => {}}
      {...props}
    />,
  );
  return { container, handle, onSave, onReplace };
}

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector("input") as HTMLInputElement;
}

async function type(field: HTMLInputElement, text: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settled();
}

verifies("google-setup.secret-field", () => {
  it("is masked, with no show or copy button and no autofill", () => {
    const { container } = show();
    const field = input(container);
    expect(field.type).toBe("password");
    expect(field.getAttribute("autocomplete")).toBe("new-password");
    expect(field.getAttribute("spellcheck")).toBe("false");
    const names = [...container.querySelectorAll("button")].map(
      (b) => `${b.textContent} ${b.getAttribute("aria-label") ?? ""}`,
    );
    expect(names.join(" ")).not.toMatch(/show|copy|reveal/i);
    expect(container.textContent).toContain("Not saved");
    expect(container.textContent).toContain(
      "Google showed it next to the client ID. Kept encrypted on this computer. Halonic can't show it.",
    );
  });

  it("holds Save secret back with its reason until something is typed", async () => {
    const { container, onSave } = show();
    const save = button(container, "Save secret");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(save.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Paste the client secret to save it.");
    await press(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends the trimmed value on Enter and empties the input", async () => {
    const { container, onSave } = show();
    await type(input(container), `  ${fake}  `);
    await act(async () =>
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    await settled();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = (onSave.mock.calls[0] as unknown as [{ reveal(): string }])[0];
    expect(sent.reveal()).toBe(fake);
    expect(input(container).value).toBe("");
  });

  it("shows the secret as [secret] wherever it is turned into text by accident", async () => {
    const { container, onSave } = show();
    await type(input(container), fake);
    await press(button(container, "Save secret"));
    const sent = (onSave.mock.calls[0] as unknown as [object])[0];
    expect(`${sent}`).toBe("[secret]");
    expect(JSON.stringify(sent)).toBe('"[secret]"');
  });

  it("keeps the typed value and says nothing was saved when the save fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error(`The store refused ${fake}`);
    });
    const { container } = show({ onSave });
    const logged = vi.spyOn(console, "error");
    await type(input(container), fake);
    await press(button(container, "Save secret"));
    expect(input(container).value).toBe(fake);
    expect(container.textContent).toContain("Couldn't save the secret. Nothing was saved.");
    expect(container.textContent).not.toContain(fake);
    expect(container.innerHTML).not.toContain(fake);
    expect(button(container, "Try again")).toBeDefined();
    expect(document.activeElement).toBe(input(container));
    expect(JSON.stringify(logged.mock.calls)).not.toContain(fake);
    logged.mockRestore();
  });

  it("is busy while the save runs, never disabled", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { container } = show({ onSave });
    await type(input(container), fake);
    await act(async () => button(container, "Save secret").click());
    const save = container.querySelector("button[aria-busy]") as HTMLButtonElement;
    expect(save.getAttribute("aria-busy")).toBe("true");
    expect(save.disabled).toBe(false);
    await act(async () => finish());
  });

  it("shows only Saved and the date once the secret is saved, with no input", () => {
    const { container } = show({ savedAt: "2026-11-08T10:41:00.000Z" });
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toMatch(/Saved.*\d{1,2} Nov, \d{2}:\d{2}/);
    expect(container.textContent).toContain(
      "Kept encrypted on this computer. Halonic can't show it.",
    );
  });

  it("names the computer that runs Halonic when another computer keeps the secret", () => {
    const { container } = show({ keptOn: "host-computer", savedAt: "2026-11-08T10:41:00.000Z" });
    expect(container.textContent).toContain(
      "Kept encrypted on the computer that runs Halonic. Halonic can't show it.",
    );
  });

  it("asks first over plain http, with Cancel focused, and sends nothing until confirmed", async () => {
    const { container, onSave } = show({ plainHttp: true });
    await type(input(container), fake);
    await press(button(container, "Save secret"));
    expect(onSave).not.toHaveBeenCalled();
    const dialog = document.querySelector("dialog");
    expect(dialog?.textContent).toContain("plain http");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await press(button(document.body, "Save it anyway"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("asks over plain http on the first save only, not on Try again", async () => {
    const onSave = vi
      .fn<SecretFieldProps["onSave"]>()
      .mockRejectedValueOnce(new Error("The store is locked."))
      .mockResolvedValue(undefined);
    const { container } = show({ plainHttp: true, onSave });
    await type(input(container), fake);
    await press(button(container, "Save secret"));
    await press(button(document.body, "Save it anyway"));
    expect(onSave).toHaveBeenCalledTimes(1);
    await press(button(container, "Try again"));
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("tells its parent whether unsaved text is in the input, and that it is gone on unmount", async () => {
    const onTyped = vi.fn();
    const { container } = show({ onTyped });
    await type(input(container), fake);
    expect(onTyped).toHaveBeenLastCalledWith(true);
    await type(input(container), "");
    expect(onTyped).toHaveBeenLastCalledWith(false);
    await type(input(container), fake);
    unmountAll();
    expect(onTyped).toHaveBeenLastCalledWith(false);
  });

  it("moves focus into the input when asked", () => {
    const { container, handle } = show();
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(input(container));
  });
});

const saved = "2026-11-08T10:41:00.000Z";
const second = "GOCSPX-fake-1111";

verifies("google-setup.secret-replace", () => {
  it("opens an empty field with the staged line after Replace secret, and Cancel closes it", async () => {
    const { container } = show({ savedAt: saved });
    expect(container.querySelector("input")).toBeNull();
    await press(button(container, "Replace secret"));
    expect(document.activeElement).toBe(input(container));
    expect(container.textContent).toContain(
      "The saved secret stays in use until Google accepts the new one.",
    );
    expect(container.textContent).toMatch(/Saved.*\d{1,2} Nov/);
    await type(input(container), second);
    await press(button(container, "Cancel"));
    expect(container.querySelector("input")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Replace secret");
    await press(button(container, "Replace secret"));
    expect(input(container).value).toBe("");
  });

  it("sends the trimmed new secret and says Google accepted it, naming a shared client's accounts", async () => {
    const onReplace = vi.fn(
      async (): Promise<SecretReplaceAnswer> => ({
        kind: "accepted",
        usedBy: ["x@example.com", "y@example.com"],
      }),
    );
    const { container, onSave } = show({ savedAt: saved, onReplace });
    await press(button(container, "Replace secret"));
    await type(input(container), `  ${second} `);
    await press(button(container, "Save new secret"));
    const sent = (onReplace.mock.calls[0] as unknown as [{ reveal(): string }])[0];
    expect(sent.reveal()).toBe(second);
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toContain("Google accepted the new secret.");
    expect(container.textContent).toContain(
      "Used by x@example.com and y@example.com, both now on the new secret.",
    );
    expect(container.textContent).not.toContain(second);
    expect(document.activeElement?.getAttribute("role")).toBe("status");
  });

  it("says the secret replaces the old one now, before the first sign-in", async () => {
    const onReplace = vi.fn(async (): Promise<SecretReplaceAnswer> => ({ kind: "replaced" }));
    const { container } = show({ savedAt: saved, beforeFirstSignIn: true, onReplace });
    await press(button(container, "Replace secret"));
    expect(container.textContent).toContain(
      "Not signed in yet, so the new secret replaces the old one now. Step 7 checks it.",
    );
    expect(container.textContent).not.toContain("stays in use");
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    expect(container.textContent).toContain("Saved the new secret. Step 7 checks it.");
  });

  it("keeps the field open with what was typed when Google refuses the secret", async () => {
    const onReplace = vi.fn(async (): Promise<SecretReplaceAnswer> => ({ kind: "refused" }));
    const { container } = show({ savedAt: saved, onReplace });
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    expect(container.textContent).toContain(
      "Google didn't accept this secret. Your old secret is still saved and in use.",
    );
    expect(input(container).value).toBe(second);
    expect(document.activeElement).toBe(input(container));
    expect(container.innerHTML).not.toContain(second);
  });

  it("says Google couldn't be reached and offers Try again when offline", async () => {
    const onReplace = vi.fn(async (): Promise<SecretReplaceAnswer> => ({ kind: "no-network" }));
    const { container } = show({ savedAt: saved, onReplace });
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    expect(container.textContent).toContain(
      "Couldn't reach Google to check the new secret. The old one is still in use. Try again when you're online.",
    );
    expect(input(container).value).toBe(second);
    expect(button(container, "Try again")).toBeDefined();
  });

  it("keeps the value out of every console method and the screen when the engine rejects", async () => {
    const onReplace = vi.fn(async (): Promise<SecretReplaceAnswer> => {
      throw new Error(`The store refused ${second}`);
    });
    const { container } = show({ savedAt: saved, onReplace });
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method),
    );
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    expect(container.textContent).toContain("Couldn't save the secret. Nothing was saved.");
    expect(container.innerHTML).not.toContain(second);
    expect(JSON.stringify(spies.map((spy) => spy.mock.calls))).not.toContain(second);
    for (const spy of spies) spy.mockRestore();
  });

  it("ignores Cancel while a replacement is being checked, so a late refusal can't leak into the next field", async () => {
    let answer: (value: SecretReplaceAnswer) => void = () => {};
    const onReplace = vi.fn(
      () => new Promise<SecretReplaceAnswer>((resolve) => (answer = resolve)),
    );
    const { container } = show({ savedAt: saved, onReplace });
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await act(async () => button(container, "Save new secret").click());
    await press(button(container, "Cancel"));
    expect(input(container).value).toBe(second);
    await act(async () => answer({ kind: "refused" }));
    expect(container.textContent).toContain("Google didn't accept this secret.");
    await press(button(container, "Cancel"));
    await press(button(container, "Replace secret"));
    expect(input(container).value).toBe("");
    expect(container.textContent).not.toContain("Google didn't accept this secret.");
  });

  it("asks the plain-http question again for a new send after Cancel", async () => {
    const onReplace = vi
      .fn<SecretFieldProps["onReplace"]>()
      .mockRejectedValueOnce(new Error("The store is locked."))
      .mockResolvedValue({ kind: "accepted", usedBy: [] });
    const { container } = show({ savedAt: saved, plainHttp: true, onReplace });
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    await press(button(document.body, "Save it anyway"));
    expect(onReplace).toHaveBeenCalledTimes(1);
    await press(button(container, "Cancel"));
    await press(button(container, "Replace secret"));
    await type(input(container), second);
    await press(button(container, "Save new secret"));
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("opens already in the new-secret field when Google refused the saved secret", () => {
    const { container } = show({ savedAt: saved, startReplacing: true });
    expect(input(container)).not.toBeNull();
    expect(document.activeElement).not.toBe(input(container));
  });
});
