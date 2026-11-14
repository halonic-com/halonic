// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  ClientIdField,
  type ClientIdFieldProps,
  clientIdShapeError,
  secretInClientId,
} from "./client-id-field.tsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const validId = "1234-abc.apps.googleusercontent.com";

function show(props: Partial<ClientIdFieldProps> = {}) {
  const onSave = vi.fn(async () => {});
  const onSecretPasted = vi.fn();
  const container = render(
    <ClientIdField
      saved={null}
      answering
      onSave={onSave}
      onSecretPasted={onSecretPasted}
      {...props}
    />,
  );
  return { container, onSave, onSecretPasted };
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

function reasonOf(save: HTMLElement): string | undefined {
  return (
    document.getElementById(save.getAttribute("aria-describedby") ?? "")?.textContent ?? undefined
  );
}

verifies("google-setup.client-id-field", () => {
  it("shows no shape error while typing, and the reason once typing pauses", async () => {
    const { container } = show();
    await type(input(container), "1234-abc");
    expect(reasonOf(button(container, "Save client ID"))).toBe("Paste the client ID to save it.");
    await act(async () => vi.advanceTimersByTime(700));
    const save = button(container, "Save client ID");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(save)).toBe(clientIdShapeError);
  });

  it("tells a screen reader about the shape only when the field is left", async () => {
    const { container } = show();
    const status = container.querySelector('[role="status"]') as HTMLElement;
    await type(input(container), "1234-abc");
    await act(async () => vi.advanceTimersByTime(700));
    expect(status.textContent).toBe("");
    await act(async () =>
      input(container).dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(status.textContent).toBe(clientIdShapeError);
  });

  it("empties the field at once for a client secret and moves focus to the secret field", async () => {
    const { container, onSecretPasted } = show();
    await type(input(container), "GOCSPX-fake-0000");
    expect(input(container).value).toBe("");
    expect(container.textContent).toContain(secretInClientId);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(secretInClientId);
    expect(container.innerHTML).not.toContain("GOCSPX-fake-0000");
    expect(onSecretPasted).toHaveBeenCalledTimes(1);
  });

  it("saves a valid client ID, trimmed", async () => {
    const { container, onSave } = show();
    await type(input(container), ` ${validId} `);
    await act(async () => button(container, "Save client ID").click());
    expect(onSave).toHaveBeenCalledWith(validId);
  });

  it("keeps what was typed and says what failed when saving fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("The disk is full.");
    });
    const { container } = show({ onSave });
    await type(input(container), validId);
    await act(async () => button(container, "Save client ID").click());
    expect(container.textContent).toContain("Couldn't save the client ID: the disk is full.");
    expect(input(container).value).toBe(validId);
  });

  it("holds Save back while the engine isn't answering, with the reason shown", async () => {
    const { container, onSave } = show({ answering: false });
    await type(input(container), validId);
    const save = button(container, "Save client ID");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(save)).toBe("Can't save while the engine isn't answering.");
    await act(async () => save.click());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a saved client ID in full, with Copy and a way to change it", async () => {
    const { container, onSave } = show({ saved: validId });
    expect(container.textContent).toContain(validId);
    expect(button(container, "Copy").getAttribute("aria-label")).toBe("Copy the client ID");
    await act(async () => button(container, "Change client ID").click());
    expect(input(container)).not.toBeNull();
    await act(async () => button(container, "Cancel").click());
    expect(container.querySelector("input")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
