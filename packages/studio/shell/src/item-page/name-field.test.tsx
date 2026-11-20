// @vitest-environment jsdom

import { FieldAnnounceProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NameField, nameCheckPauseMs } from "./name-field.tsx";

let uninstallPopover: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  vi.useRealTimers();
});

/** "Mail triage" is taken, as another workflow's name would be. */
const taken = (name: string) =>
  name.toLowerCase() === "mail triage" ? `A workflow called ${name} already exists.` : undefined;

function field(onRename: (name: string) => void = () => {}) {
  const announced: string[] = [];
  const container = render(
    <FieldAnnounceProvider announce={(text) => announced.push(text)}>
      <NameField name="Support reply" label="Workflow name" onRename={onRename} check={taken} />
    </FieldAnnounceProvider>,
  );
  return {
    input: container.querySelector("input") as HTMLInputElement,
    problem: () => container.querySelector("[aria-hidden=true][id]")?.textContent ?? undefined,
    announced,
  };
}

/** The typing pauses, and the announcement a frame later is read. */
function pause(): void {
  act(() => vi.advanceTimersByTime(nameCheckPauseMs));
  act(() => vi.advanceTimersByTime(20));
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
  it("says why a name can't be kept once the typing pauses, tied to the field", () => {
    const { input, problem } = field();
    typeInto(input, "Mail triage ");
    expect(problem()).toBeUndefined();
    pause();
    expect(problem()).toBe("A workflow called Mail triage already exists.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("A workflow called Mail triage already exists.");

    typeInto(input, "Mail triage 2");
    pause();
    expect(problem()).toBeUndefined();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("reads the problem once when it shows under the focused field", () => {
    const { input, announced } = field();
    typeInto(input, "Mail triag");
    typeInto(input, "Mail triage");
    expect(announced).toEqual([]);
    pause();
    expect(announced).toEqual(["Workflow name: A workflow called Mail triage already exists."]);
    pause();
    expect(announced).toHaveLength(1);
  });

  it("reads the problem again on Enter, and shows it at once before the pause", () => {
    const { input, problem, announced } = field();
    typeInto(input, "Mail triage");
    press(input, "Enter");
    pause();
    expect(problem()).toBe("A workflow called Mail triage already exists.");
    expect(announced).toEqual(["Workflow name: A workflow called Mail triage already exists."]);
    press(input, "Enter");
    expect(announced).toEqual([
      "Workflow name: A workflow called Mail triage already exists.",
      "Workflow name: A workflow called Mail triage already exists.",
    ]);
  });

  it("doesn't keep a name with a problem on Enter, and leaves it in view to fix", () => {
    const onRename = vi.fn();
    const { input, problem } = field(onRename);
    typeInto(input, "Mail triage");
    press(input, "Enter");
    expect(onRename).not.toHaveBeenCalled();
    expect(input.value).toBe("Mail triage");
    expect(problem()).toBe("A workflow called Mail triage already exists.");
  });

  it("puts the old name back when the field is left with a name that has a problem, and says so", () => {
    const onRename = vi.fn();
    const { input, problem, announced } = field(onRename);
    typeInto(input, "Mail triage");
    act(() => input.blur());
    pause();
    expect(onRename).not.toHaveBeenCalled();
    expect(input.value).toBe("Support reply");
    expect(problem()).toBeUndefined();
    expect(announced).toEqual(["Name not changed: A workflow called Mail triage already exists."]);
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
