// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { EmptyState } from "./empty-state.tsx";

afterEach(() => {
  unmountAll();
});

function AgentIcon() {
  return <svg data-testid="agent-icon" viewBox="0 0 20 20" />;
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

verifies("kit.empty-state", () => {
  it("centres a title and a description on the halo wash, in a 360px column", () => {
    const { container } = render(
      <EmptyState title="No agents yet" description="An agent does one job for you." />,
    );
    const area = container.firstElementChild as HTMLElement;
    expect(area.className).toContain("grid min-h-full w-full place-items-center");
    expect(area.className).toContain("bg-halo-wash");
    const column = area.firstElementChild as HTMLElement;
    expect(column.className).toContain("max-w-empty flex-col items-center gap-1.5 text-center");
    const title = container.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("No agents yet");
    expect(title.className).toContain("text-section");
    const description = container.querySelector("p") as HTMLElement;
    expect(description.className).toContain("text-body text-fg-muted");
  });

  it("takes another heading level", () => {
    const { container } = render(<EmptyState title="No steps yet" headingLevel={3} />);
    expect(container.querySelector("h3")?.textContent).toBe("No steps yet");
  });

  it("draws its icon at 20px in accent on a 40px tile hidden from screen readers", () => {
    const { container } = render(<EmptyState icon={<AgentIcon />} title="No agents yet" />);
    const tile = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(tile.className).toContain("size-10 place-items-center rounded-md bg-surface shadow-1");
    expect(tile.className).toContain("text-accent");
    expect(tile.querySelector('[data-testid="agent-icon"]')?.parentElement?.className).toContain(
      "size-icon-md",
    );
  });

  it("has no tile without an icon, and no tile or wash when plain", () => {
    const bare = render(<EmptyState title="No agents yet" />);
    expect(bare.container.querySelector('[aria-hidden="true"]')).toBeNull();

    const { container } = render(
      <EmptyState plain icon={<AgentIcon />} title="No results for “sorter”" />,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toContain("halo");
    expect(container.querySelector('[data-testid="agent-icon"]')).toBeNull();
  });

  it("shows one primary and one secondary button, md so a phone draws them at 40px", async () => {
    const onNew = vi.fn();
    const onTemplate = vi.fn();
    const { container } = render(
      <EmptyState
        title="No agents yet"
        action={{ label: "New agent", onClick: onNew }}
        secondaryAction={{ label: "Start from a template", onClick: onTemplate }}
      />,
    );
    const [primary, secondary] = buttons(container) as [HTMLButtonElement, HTMLButtonElement];
    expect(primary.textContent).toBe("New agent");
    expect(primary.className).toContain("bg-primary");
    expect(primary.className).toContain("min-h-control-md");
    expect(primary.className).toContain("phone:min-h-control-lg");
    expect(secondary.textContent).toBe("Start from a template");
    expect(secondary.className).toContain("border-border-strong bg-surface");
    await click(primary);
    await click(secondary);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onTemplate).toHaveBeenCalledTimes(1);
  });

  it("marks a busy button and ignores its clicks", async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <EmptyState
        tone="error"
        title="Couldn't load agents"
        action={{ label: "Try again", onClick: onRetry, busy: true }}
      />,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-busy")).toBe("true");
    await click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows an error with the danger alert mark on its tile and a secondary Try again", () => {
    const { container } = render(
      <EmptyState
        tone="error"
        title="Couldn't load agents"
        description="The engine stopped answering."
        action={{ label: "Try again", onClick: () => {} }}
      />,
    );
    const tile = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(tile.className).toContain("text-danger");
    expect(tile.querySelector("svg circle")).not.toBeNull();
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("border-border-strong bg-surface");
    expect(button.className).not.toContain("bg-primary");
  });

  it("puts a plain error's alert mark inline with its title", () => {
    const { container } = render(<EmptyState tone="error" plain title="Couldn't load files" />);
    const title = container.querySelector("h2") as HTMLElement;
    const mark = title.firstElementChild as HTMLElement;
    expect(mark.className).toContain("size-icon-md");
    expect(mark.className).toContain("text-danger");
    expect(mark.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(title.textContent).toBe("Couldn't load files");
    expect((container.firstElementChild as HTMLElement).className).not.toContain("halo");
  });

  it("left-aligns a section's error, with no tile or wash, and an lg Try again", async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <EmptyState
        tone="error"
        align="start"
        title="Couldn't load recent runs"
        description="The run log can't be read."
        action={{ label: "Try again", onClick: onRetry }}
      />,
    );
    const block = container.firstElementChild as HTMLElement;
    expect(block.className).toContain("items-start");
    expect(block.className).toContain("px-4");
    expect(block.className).toContain("text-left");
    expect(block.className).not.toContain("halo");
    const title = container.querySelector("h2") as HTMLElement;
    expect(title.className).toContain("text-body-strong");
    expect((title.firstElementChild as HTMLElement).className).toContain("text-danger");
    expect(container.querySelector("p")?.className).toContain("text-small text-fg-muted");
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("min-h-control-lg");
    expect(button.className).toContain("border-border-strong bg-surface");
    await click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("only lets an error be aligned to the start, with no icon or second button", () => {
    const go = { label: "Go", onClick: () => {} };
    // @ts-expect-error Only an error sits at the start of its section.
    const start = <EmptyState align="start" title="No runs yet" />;
    // @ts-expect-error An error draws the alert mark, not its own icon.
    const icon = <EmptyState tone="error" icon={<AgentIcon />} title="Couldn't load" />;
    // @ts-expect-error An error has one button: Try again.
    const second = <EmptyState tone="error" title="Couldn't load" secondaryAction={go} />;
    expect([start, icon, second]).toHaveLength(3);
  });

  it("lets code focus its title, which draws no ring", () => {
    const titleRef = createRef<HTMLHeadingElement>();
    const { container } = render(<EmptyState title="No files to stage" titleRef={titleRef} />);
    const title = container.querySelector("h2") as HTMLElement;
    expect(titleRef.current).toBe(title);
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(title.className).toContain("outline-none");
    act(() => titleRef.current?.focus());
    expect(document.activeElement).toBe(title);
  });

  it("lets code focus a section error's title too", () => {
    const titleRef = createRef<HTMLHeadingElement>();
    render(
      <EmptyState tone="error" align="start" title="Couldn't load runs" titleRef={titleRef} />,
    );
    expect(titleRef.current?.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves out an empty description and an empty button row", () => {
    const { container } = render(<EmptyState title="No agents yet" description="" />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    const column = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
    expect(column.children).toHaveLength(1);
  });
});
