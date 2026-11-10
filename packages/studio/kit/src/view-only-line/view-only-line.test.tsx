// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { LineFrame } from "../line-frame/line-frame.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ViewOnlyLine } from "./view-only-line.tsx";

afterEach(() => {
  unmountAll();
});

const workflowLine = "View only on a phone. Edit this workflow on a computer.";

verifies("kit.view-only-line", () => {
  it("shows the eye and the page's sentence in fg-muted small text", () => {
    const { container } = render(<ViewOnlyLine>{workflowLine}</ViewOnlyLine>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-small text-fg-muted");
    expect(line.querySelector("p")?.textContent).toBe(workflowLine);
    const icon = line.firstElementChild as HTMLElement;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.className).toContain("size-icon-sm");
    expect(icon.querySelector("svg circle")).not.toBeNull();
  });

  it("is a plain line: no action, not live, not a callout", () => {
    const { container } = render(<ViewOnlyLine>View only on a phone.</ViewOnlyLine>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.querySelector("button, a")).toBeNull();
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
    expect(line.className).not.toMatch(/\bbg-/);
  });

  it("keeps a long sentence whole and lets it wrap", () => {
    const sentence = "View only on a phone. Change the harness and where it runs on a computer.";
    const { container } = render(<ViewOnlyLine>{sentence}</ViewOnlyLine>);
    const text = container.querySelector("p") as HTMLElement;
    expect(text.textContent).toBe(sentence);
    expect(text.className).toContain("wrap-break-word");
    expect(text.className).not.toContain("truncate");
  });
});

verifies("kit.line-frame", () => {
  it("pads 8px 16px, is at least 48px high, with a border line below and no fill", () => {
    const { container } = render(<LineFrame icon={<svg />}>Shared with your team.</LineFrame>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("min-h-touch");
    expect(line.className).toContain("px-4 py-2");
    expect(line.className).toContain("border-b border-border");
    expect(line.className).not.toMatch(/\bbg-/);
  });

  it("top-aligns the 16px icon with the first line of text", () => {
    const { container } = render(<LineFrame icon={<svg />}>Shared with your team.</LineFrame>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("items-start");
    expect((line.firstElementChild as HTMLElement).className).toContain("mt-0.5");
  });

  it("draws its text in fg unless it's muted", () => {
    const { container } = render(<LineFrame icon={<svg />}>Shared with your team.</LineFrame>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-fg");
    expect(line.className).not.toContain("text-fg-muted");
  });
});
