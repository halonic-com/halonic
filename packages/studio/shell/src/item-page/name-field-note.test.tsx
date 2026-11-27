// @vitest-environment jsdom

import { FieldAnnounceProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
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

/** What a test changes from outside the field: its name and its note, as the page would. */
interface Props {
  readonly name: string;
  readonly note: string;
}

function field(shownNote = note) {
  const announced: string[] = [];
  let setProps: (props: Props) => void = () => {};
  let props: Props = { name: "Support reply", note: shownNote };
  // Holds the field's props in state, so a test can change them the way the page re-renders it.
  function Host() {
    const [current, setCurrent] = useState(props);
    setProps = setCurrent;
    return (
      <NameField
        name={current.name}
        label="Workflow name"
        onRename={() => {}}
        check={taken}
        note={current.note}
      />
    );
  }
  const container = render(
    <FieldAnnounceProvider announce={(text) => announced.push(text)}>
      <Host />
    </FieldAnnounceProvider>,
  );
  const input = container.querySelector("input") as HTMLInputElement;
  const change = (update: Partial<Props>) => {
    props = { ...props, ...update };
    act(() => setProps(props));
  };
  return {
    input,
    line: () => container.querySelector("[aria-hidden=true][id]"),
    description: () =>
      document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent,
    announced,
    change,
  };
}

function press(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
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

  it("reads the note again when its words change while a new name is typed", () => {
    const twoPlaces = "Also updates 2 places: Inbox flow (Sort mail), Daily (routine)";
    const threePlaces = "Also updates 3 places: Inbox flow (Sort mail), Daily (routine), Digest";
    const { input, announced, change } = field(twoPlaces);
    typeInto(input, "Mail sorte");
    change({ note: threePlaces });
    // A file change, not a key press, changes the words, so they're read right away.
    expect(announced).toEqual([twoPlaces, threePlaces]);
    typeInto(input, "Mail sorter");
    expect(announced).toEqual([twoPlaces, threePlaces]);
  });

  it("doesn't read the same note again when it comes back after a problem in the same edit", () => {
    const { input, line, announced } = field();
    typeInto(input, "Mail sorter");
    typeInto(input, "Mail triage");
    act(() => vi.advanceTimersByTime(nameCheckPauseMs));
    expect(line()?.textContent).toBe("A workflow called Mail triage already exists.");
    typeInto(input, "Mail sorter");
    expect(line()?.textContent).toBe(note);
    expect(announced.filter((text) => text === note)).toEqual([note]);
  });

  it("reads the note again when typing starts after Esc put the old name back", () => {
    const { input, announced } = field();
    typeInto(input, "Mail sorter");
    press(input, "Escape");
    expect(input.value).toBe("Support reply");
    typeInto(input, "Mail sorter");
    expect(announced).toEqual([note, note]);
  });

  it("reads the note again when typing starts after the item was renamed elsewhere", () => {
    const { input, announced, change } = field();
    typeInto(input, "Mail sorter");
    change({ name: "Inbox helper" });
    expect(input.value).toBe("Inbox helper");
    typeInto(input, "Mail sorter");
    expect(announced).toEqual([note, note]);
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
