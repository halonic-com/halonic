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

const note =
  "Also updates 3 places: Inbox flow (Sort mail), Morning digest (routine), Weekly report (Draft)";

/** "Mail triage" is taken, as another workflow's name would be. */
const taken = (name: string) =>
  name.toLowerCase() === "mail triage" ? `A workflow called ${name} already exists.` : undefined;

function field(shownNote = note) {
  const announced: string[] = [];
  const container = render(
    <FieldAnnounceProvider announce={(text) => announced.push(text)}>
      <NameField
        name="Support reply"
        label="Workflow name"
        onRename={() => {}}
        check={taken}
        note={shownNote}
      />
    </FieldAnnounceProvider>,
  );
  const input = container.querySelector("input") as HTMLInputElement;
  return {
    input,
    line: () => container.querySelector("[aria-hidden=true][id]"),
    description: () =>
      document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent,
    announced,
  };
}

function typeInto(input: HTMLInputElement, text: string): void {
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("shell.item-page-name-note", () => {
  it("shows the note under the field while a new name is typed, as its description, read once", () => {
    const { input, line, description, announced } = field();
    expect(line()).toBeNull();
    typeInto(input, "Mail sorter");
    expect(line()?.textContent).toBe(note);
    expect(line()?.className).toContain("text-fg-subtle");
    expect(description()).toBe(note);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    act(() => vi.advanceTimersByTime(nameCheckPauseMs + 20));
    expect(announced).toEqual([note]);
  });

  it("reads the note once when it first shows, and not again for the next letter", () => {
    const shortNote = "Also updates 2 places: Inbox flow (Sort mail), Daily (routine)";
    const { input, announced } = field(shortNote);
    typeInto(input, "Mail sorte");
    expect(announced).toEqual(["Also updates 2 places: Inbox flow (Sort mail), Daily (routine)"]);
    typeInto(input, "Mail sorter");
    act(() => vi.advanceTimersByTime(nameCheckPauseMs + 20));
    expect(announced).toEqual(["Also updates 2 places: Inbox flow (Sort mail), Daily (routine)"]);
  });

  it("gives the note's place to a problem, and shows none for the name it has or an empty one", () => {
    const { input, line, description } = field();
    typeInto(input, "Mail triage");
    expect(line()).toBeNull();
    act(() => vi.advanceTimersByTime(nameCheckPauseMs));
    expect(description()).toBe("A workflow called Mail triage already exists.");
    typeInto(input, " Support reply ");
    expect(line()).toBeNull();
    typeInto(input, "  ");
    expect(line()).toBeNull();
  });
});
