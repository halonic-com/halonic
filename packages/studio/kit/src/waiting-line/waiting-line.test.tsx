// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { useWaitedMs, WaitingLine, waitedTime } from "./waiting-line.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const reason = "It loads the model first, so the start is slow.";

function statusOf(container: HTMLElement): HTMLElement {
  const status = container.querySelector('[role="status"]');
  if (!(status instanceof HTMLElement)) throw new Error("The line has no status region.");
  return status;
}

verifies("kit.waiting-line", () => {
  it("shows nothing before 2 seconds, but its status region is there already", () => {
    const { container } = render(<WaitingLine what="Waiting for Anthropic" waitedMs={1_900} />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toBe("sr-only");
    expect(statusOf(container).textContent).toBe("");
    expect(container.textContent).toBe("");
  });

  it("shows the dot, what it waits for and the time from 2 seconds", () => {
    const { container, rerender } = render(
      <WaitingLine what="Waiting for Anthropic" waitedMs={1_900} />,
    );
    const status = statusOf(container);
    rerender(<WaitingLine what="Waiting for Anthropic" waitedMs={3_000} />);
    // The same node, so screen readers hear the words arrive.
    expect(statusOf(container)).toBe(status);
    expect(status.textContent).toBe("Waiting for Anthropic");
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-small");
    const dot = line.querySelector('[aria-hidden="true"] > span') as HTMLElement;
    expect(dot.className).toContain("bg-running");
    expect(dot.className).not.toMatch(/animate-/);
    expect(line.lastElementChild?.textContent).toBe("3 s");
    expect(line.lastElementChild?.className).toContain("tabular-nums");
  });

  it("keeps the time out of the status region, so it isn't read each second", () => {
    const { container } = render(<WaitingLine what="Waiting for Anthropic" waitedMs={42_000} />);
    expect(statusOf(container).textContent).not.toContain("42");
  });

  it("adds a known reason at 10 seconds, never before", () => {
    const { container, rerender } = render(
      <WaitingLine what="Waiting for Ollama on this computer" reason={reason} waitedMs={9_000} />,
    );
    expect(container.textContent).not.toContain(reason);
    rerender(
      <WaitingLine what="Waiting for Ollama on this computer" reason={reason} waitedMs={10_000} />,
    );
    expect(statusOf(container).textContent).toBe(`Waiting for Ollama on this computer${reason}`);
    expect(statusOf(container).lastElementChild?.className).toContain("text-fg-muted");
  });

  it("offers its actions as text buttons", () => {
    const pick = vi.fn();
    const { container } = render(
      <WaitingLine
        what="Still no answer"
        waitedMs={60_000}
        actions={[{ label: "Pick another model", onClick: pick }]}
      />,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Pick another model");
    expect(button.className).toContain("text-accent-text");
    act(() => button.click());
    expect(pick).toHaveBeenCalledOnce();
  });

  it("keeps room for every reason and action it will show, unseen and unspoken, from 2 seconds", () => {
    const later = "Still starting. The first start unpacks Halonic's files.";
    const { container, rerender } = render(
      <WaitingLine
        what="Starting Halonic…"
        waitedMs={3_000}
        reason="The first start takes longer."
        keepRoomFor={{ reasons: ["The first start takes longer.", later], actions: ["Something wrong?"] }}
      />,
    );
    // jsdom has no layout: the classes that make it. The status region and an unseen copy with
    // each reason share one grid cell, as do the actions and their unseen labels, so each cell is
    // as high as the tallest at any width.
    const unseen = [...container.querySelectorAll('[aria-hidden="true"].invisible')];
    expect(unseen.map((each) => each.textContent)).toEqual([
      "Starting Halonic…The first start takes longer.",
      `Starting Halonic…${later}`,
      "Something wrong?",
    ]);
    for (const each of unseen) {
      expect(each.parentElement?.className).toContain("grid *:col-start-1 *:row-start-1");
    }
    expect(statusOf(container).textContent).toBe("Starting Halonic…");
    expect(container.querySelector("button")).toBeNull();

    rerender(
      <WaitingLine
        what="Starting Halonic…"
        waitedMs={34_000}
        reason={later}
        actions={[{ label: "Something wrong?", onClick: () => undefined }]}
        keepRoomFor={{ reasons: ["The first start takes longer.", later], actions: ["Something wrong?"] }}
      />,
    );
    expect(statusOf(container).textContent).toBe(`Starting Halonic…${later}`);
    expect(container.querySelector("button")?.closest('[aria-hidden="true"]')).toBeNull();
  });

  describe("placements", () => {
    const lineIn = (placement: "inline" | "row" | "banner") =>
      render(<WaitingLine what="Starting Halonic…" waitedMs={5_000} placement={placement} />)
        .container.firstElementChild as HTMLElement;

    it("draws a banner as a box on surface-muted, and the others without a frame", () => {
      expect(lineIn("banner").className).toContain(
        "rounded-md border border-border bg-surface-muted px-4 py-3",
      );
      expect(lineIn("inline").className).not.toMatch(/\b(bg|border)-/);
      expect(lineIn("row").className).not.toMatch(/\b(bg|border)-/);
      expect(lineIn("row").className).toContain("pt-1");
    });
  });

  it("writes the time in seconds, and as m:ss from a minute", () => {
    expect(waitedTime(2_000)).toBe("2 s");
    expect(waitedTime(59_999)).toBe("59 s");
    expect(waitedTime(60_000)).toBe("1:00");
    expect(waitedTime(130_000)).toBe("2:10");
    expect(waitedTime(-5)).toBe("0 s");
  });

  it("counts the time itself with useWaitedMs, drawing again every second", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
    const since = new Date();
    function Counting() {
      return <WaitingLine what="Waiting for Anthropic" waitedMs={useWaitedMs(since)} />;
    }
    const { container } = render(<Counting />);
    expect(container.textContent).toBe("");
    act(() => vi.advanceTimersByTime(3_000));
    expect(container.textContent).toBe("Waiting for Anthropic3 s");
    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe("Waiting for Anthropic4 s");
  });
});
