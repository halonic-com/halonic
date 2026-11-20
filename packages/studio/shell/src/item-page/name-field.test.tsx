// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NameField } from "./name-field.tsx";

let uninstallPopover: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
});

/** "Mail triage" is taken, as another workflow's name would be. */
const taken = (name: string) =>
  name.toLowerCase() === "mail triage" ? `A workflow called ${name} already exists.` : undefined;

function field(onRename: (name: string) => void = () => {}) {
  const container = render(
    <NameField name="Support reply" label="Workflow name" onRename={onRename} check={taken} />,
  );
  return {
    input: container.querySelector("input") as HTMLInputElement,
    problem: () => container.querySelector("[aria-hidden=true][id]")?.textContent ?? undefined,
  };
}

function typeInto(input: HTMLInputElement, text: string): void {
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("shell.item-page-header", () => {
  it("says why a name can't be kept as it is typed, tied to the field", () => {
    const { input, problem } = field();
    typeInto(input, "Mail triage ");
    expect(problem()).toBe("A workflow called Mail triage already exists.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("A workflow called Mail triage already exists.");

    typeInto(input, "Mail triage 2");
    expect(problem()).toBeUndefined();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("doesn't keep a name with a problem on Enter, and leaves it in view to fix", () => {
    const onRename = vi.fn();
    const { input, problem } = field(onRename);
    typeInto(input, "Mail triage");
    press(input, "Enter");
    expect(onRename).not.toHaveBeenCalled();
    expect(input.value).toBe("Mail triage");
    expect(problem()).toBeDefined();
  });

  it("puts the old name back when the field is left with a name that has a problem", () => {
    const onRename = vi.fn();
    const { input, problem } = field(onRename);
    typeInto(input, "Mail triage");
    act(() => input.blur());
    expect(onRename).not.toHaveBeenCalled();
    expect(input.value).toBe("Support reply");
    expect(problem()).toBeUndefined();
  });

  it("doesn't check the name it already has", () => {
    const check = vi.fn(taken);
    const container = render(
      <NameField name="Support reply" label="Workflow name" onRename={() => {}} check={check} />,
    );
    typeInto(container.querySelector("input") as HTMLInputElement, " Support reply ");
    expect(check).not.toHaveBeenCalled();
  });
});
