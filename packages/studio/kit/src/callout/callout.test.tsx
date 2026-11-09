// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { CALLOUT_FILES_SHOWN, Callout, type CalloutHandle } from "./callout.tsx";

afterEach(() => {
  unmountAll();
});

function box(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

function textOf(id: string | null): string {
  return (id ?? "")
    .split(" ")
    .map((part) => document.getElementById(part)?.textContent ?? "")
    .join(" | ");
}

const files = [
  "src/agents/sorter.ts",
  "src/agents/writer.ts",
  "workflows/mail-triage.yaml",
  "README.md",
  "notes/a-very-long-folder-name-without-any-spaces/and-a-file.md",
];

verifies("kit.callout", () => {
  it.each([
    ["info", "bg-accent-soft", "text-accent", "M8 4.75h.01"],
    ["warning", "bg-warning-soft", "text-warning", "M7.13 2.5"],
    ["danger", "bg-danger-soft", "text-danger", "M8 11.25h.01"],
  ] as const)("draws the %s tone as a %s box with its icon in %s", (tone, fill, colour, mark) => {
    const { container } = render(<Callout tone={tone}>Something to know.</Callout>);
    const callout = box(container);
    expect(callout.className).toContain(`rounded-sm border border-transparent p-3 ${fill}`);
    expect(callout.className).not.toContain("shadow");
    const icon = callout.firstElementChild as HTMLElement;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.className).toContain(`mt-0.5 inline-grid size-icon-sm shrink-0`);
    expect(icon.className).toContain(colour);
    expect(icon.innerHTML).toContain(mark);
  });

  it("takes another icon in the tone's colour, on the same fill", () => {
    const { container } = render(
      <Callout tone="info" icon={<svg data-testid="shield" />}>
        This workspace isn't trusted yet.
      </Callout>,
    );
    const icon = box(container).firstElementChild as HTMLElement;
    expect(icon.querySelector('[data-testid="shield"]')).not.toBeNull();
    expect(icon.className).toContain("text-accent");
    expect(box(container).className).toContain("bg-accent-soft");
  });

  it("puts a title over the text, both in fg, in a column that wraps and is never cut", () => {
    const { container } = render(
      <Callout tone="warning" title="Couldn't change 3 files">
        Halonic kept a copy of each.
      </Callout>,
    );
    const content = box(container).lastElementChild as HTMLElement;
    expect(content.className).toContain("min-w-0 flex-1 wrap-break-word text-fg");
    expect(content.className).not.toMatch(/line-clamp|truncate|max-h|overflow-hidden/);
    const [title, text] = [...content.children] as [HTMLElement, HTMLElement];
    expect(title.textContent).toBe("Couldn't change 3 files");
    expect(title.className).toContain("text-body-strong");
    expect(text.className).toContain("text-small");
  });

  it("lists three files in mono that wrap anywhere, then and N more", () => {
    const { container } = render(
      <Callout tone="warning" title="Couldn't change 5 files" files={files}>
        Halonic kept a copy of each.
      </Callout>,
    );
    const items = [...container.querySelectorAll("li")];
    expect(items).toHaveLength(CALLOUT_FILES_SHOWN + 1);
    for (const item of items.slice(0, CALLOUT_FILES_SHOWN)) {
      expect(item.className).toContain("font-mono wrap-anywhere");
    }
    expect(items.at(-1)?.textContent).toBe("and 2 more");
    expect(items.at(-1)?.className).not.toContain("font-mono");
  });

  it("lists exactly three files with no and N more", () => {
    const { container } = render(
      <Callout tone="warning" files={files.slice(0, 3)}>
        Couldn't change these.
      </Callout>,
    );
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(container.textContent).not.toContain("more");
  });

  it("is plain page content without announce: no role and no tabindex", () => {
    const { container } = render(<Callout tone="info">Keys stay on this computer.</Callout>);
    const callout = box(container);
    expect(callout.hasAttribute("role")).toBe(false);
    expect(callout.hasAttribute("tabindex")).toBe(false);
    expect(callout.className).not.toContain("focus-ring");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("is a named group that takes focus with announce, and never an alert", () => {
    const callout = createRef<CalloutHandle>();
    const { container } = render(
      <Callout
        tone="warning"
        title="Couldn't change 3 files"
        files={files.slice(0, 3)}
        announce="focus"
        ref={callout}
      >
        Halonic kept a copy of each.
      </Callout>,
    );
    const group = box(container);
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("tabindex")).toBe("-1");
    expect(group.className).toContain("focus-ring");
    expect(textOf(group.getAttribute("aria-labelledby"))).toBe("Couldn't change 3 files");
    expect(textOf(group.getAttribute("aria-describedby"))).toBe(
      "Halonic kept a copy of each. | src/agents/sorter.tssrc/agents/writer.tsworkflows/mail-triage.yaml",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const focus = vi.spyOn(group, "focus");
    act(() => callout.current?.focus());
    expect(document.activeElement).toBe(group);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("is named by its text when it has no title", () => {
    const { container } = render(
      <Callout tone="danger" announce="focus">
        Couldn't save the key.
      </Callout>,
    );
    const group = box(container);
    expect(textOf(group.getAttribute("aria-labelledby"))).toBe("Couldn't save the key.");
    expect(group.hasAttribute("aria-describedby")).toBe(false);
  });

  it("has its action as a ghost sm button on the tint, lined up with the text", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Callout tone="warning" action={{ label: "Try again", onClick }}>
        Couldn't change 3 files.
      </Callout>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Try again");
    expect(button.className).toContain("text-accent-text");
    expect(button.className).toContain("min-h-control-sm");
    expect(button.parentElement?.className).toContain("mt-2 -ml-2.5 phone:-ml-4 touch:-ml-4");
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps its action busy until the promise it returns settles", async () => {
    let finish = () => {};
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = render(
      <Callout tone="warning" action={{ label: "Try again", onClick }}>
        Couldn't change 3 files.
      </Callout>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    await click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("has no close button", () => {
    const { container } = render(<Callout tone="info">Keys stay on this computer.</Callout>);
    expect(container.querySelector("button")).toBeNull();
  });

  it("takes focus only with announce", () => {
    const callout = createRef<CalloutHandle>();
    // @ts-expect-error Only a Callout that announces by focus gives its screen a handle.
    const quiet = <Callout tone="info" ref={callout} children="…" />;
    expect(quiet).toBeDefined();
  });
});
