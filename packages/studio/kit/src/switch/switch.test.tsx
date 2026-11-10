// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Switch } from "./switch.tsx";

afterEach(() => {
  unmountAll();
});

function trackIn(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[role="switch"]') as HTMLInputElement;
}

verifies("kit.switch", () => {
  it("is a native checkbox read as a switch: a 32×18 track with a 14px thumb and the focus ring", () => {
    const { container } = render(
      <Switch label="Turn on Sorter" checked={false} onChange={vi.fn()} />,
    );
    const track = trackIn(container);
    expect(track.type).toBe("checkbox");
    expect(track.getAttribute("aria-label")).toBe("Turn on Sorter");
    expect(track.className).toContain("h-4.5 w-8");
    expect(track.className).toContain("rounded-full");
    expect(track.className).toContain("appearance-none");
    expect(track.className).toContain("border-border-control bg-surface-muted");
    expect(track.className).toContain("focus-ring");
    const thumb = track.nextElementSibling as HTMLElement;
    expect(thumb.getAttribute("aria-hidden")).toBe("true");
    expect(thumb.className).toContain("size-3.5");
    expect(thumb.className).toContain("bg-on-primary");
    expect(thumb.className).toContain("left-0.5");
  });

  it("fills primary and moves the thumb to the end when on, without sliding", () => {
    const { container } = render(<Switch label="Turn on Sorter" checked onChange={vi.fn()} />);
    const track = trackIn(container);
    expect(track.checked).toBe(true);
    expect(track.className).toContain("checked:border-primary checked:bg-primary");
    const thumb = track.nextElementSibling as HTMLElement;
    expect(thumb.className).toContain("peer-checked:left-4");
    expect(thumb.className).not.toContain("transition");
  });

  it("turns the edge fg-muted, or an on track primary-hover, under the pointer", () => {
    const { container } = render(
      <Switch checked={false} onChange={vi.fn()}>
        Send a summary every morning
      </Switch>,
    );
    const track = trackIn(container);
    expect(track.className).toContain("hover:border-fg-muted group-hover/switch:border-fg-muted");
    expect(track.className).toContain("checked:hover:bg-primary-hover");
    expect(track.className).toContain("checked:group-hover/switch:bg-primary-hover");
    expect(container.querySelector("label")?.className).toContain("group/switch");
  });

  it("must have a name: a sentence or a label, never both", () => {
    // @ts-expect-error: neither a sentence nor a label
    const nameless = <Switch checked={false} onChange={vi.fn()} />;
    const twice = (
      // @ts-expect-error: both a sentence and a label
      <Switch label="Send" checked={false} onChange={vi.fn()}>
        Send
      </Switch>
    );
    expect([nameless, twice]).toHaveLength(2);
  });

  it("calls onChange with the new value on a click on the switch or its sentence", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Switch checked={false} onChange={onChange}>
        Send a summary every morning
      </Switch>,
    );
    const sentence = container.querySelector("label > span") as HTMLElement;
    expect(sentence.textContent).toBe("Send a summary every morning");
    await click(sentence);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await click(trackIn(container));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("puts the sentence first in a row of at most 360px, the full width and 48px high on a phone", () => {
    const { container } = render(
      <Switch checked={false} onChange={vi.fn()}>
        Send a summary every morning
      </Switch>,
    );
    const row = container.querySelector("label") as HTMLElement;
    expect(row.firstElementChild?.textContent).toBe("Send a summary every morning");
    expect(row.lastElementChild?.querySelector('[role="switch"]')).not.toBeNull();
    expect(row.className).toContain("justify-between");
    expect(row.className).toContain("max-w-90");
    expect(row.className).toContain("phone:max-w-none");
    expect(row.className).toContain("phone:min-h-touch");
    expect(row.className).toContain("touch:min-h-touch");
  });

  it("is a 48px target without a sentence on a phone or a touch screen, and a tap there turns it on", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Switch label="Turn on Sorter" checked={false} onChange={onChange} />,
    );
    const target = container.querySelector("label") as HTMLElement;
    expect(target.className).toContain("phone:hit-touch touch:hit-touch");
    await click(target);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("stays focusable and on but ignores clicks while unavailable, described by its reason", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <>
        <Switch checked onChange={onChange} unavailable={{ reason: "why" }}>
          Send a summary every morning
        </Switch>
        <p id="why">Finish getting updates first.</p>
      </>,
    );
    const track = trackIn(container);
    expect(track.disabled).toBe(false);
    expect(track.getAttribute("aria-disabled")).toBe("true");
    expect(track.getAttribute("aria-describedby")).toBe("why");
    const switchBox = track.parentElement as HTMLElement;
    expect(switchBox.className).toContain("opacity-45");
    expect(switchBox.className).toContain("contrast-more:opacity-60");
    expect(switchBox.className).toContain("forced-colors:opacity-100");
    expect(track.className).not.toContain("hover:");
    expect(container.querySelector("label")?.className).toContain("text-fg-disabled");
    act(() => track.focus());
    expect(document.activeElement).toBe(track);
    // Space on a focused checkbox arrives as a click too.
    await click(track);
    await click(container.querySelector("label > span") as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(track.checked).toBe(true);
  });

  it("is named by its sentence in a Field and described by the Field's error line", () => {
    const { container } = render(
      <>
        <Field label="Summary" error="Couldn't save. Try again.">
          <Switch checked={false} onChange={vi.fn()}>
            Send a summary every morning
          </Switch>
        </Field>
        <Field label="Sorter">
          <Switch label="Turn on Sorter" checked={false} onChange={vi.fn()} />
        </Field>
      </>,
    );
    const [withSentence, withoutSentence] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[role="switch"]'),
    );
    expect(withSentence?.id).toBe("");
    expect(withSentence?.labels?.[0]?.textContent).toBe("Send a summary every morning");
    const line = document.getElementById(withSentence?.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Couldn't save. Try again.");
    expect(withoutSentence?.labels?.[0]?.textContent).toBe("Sorter");
  });

  it("draws itself in system colours in high contrast", () => {
    const { container } = render(<Switch label="Turn on Sorter" checked onChange={vi.fn()} />);
    expect(trackIn(container).className).toContain("switch-forced");
  });
});
