// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Callout } from "./callout.tsx";

afterEach(() => {
  unmountAll();
});

const proxyCallout = (
  <Callout
    tone="danger"
    action={{ label: "Model calls through a proxy", opens: "Opens GitHub", onClick: vi.fn() }}
  >
    Halonic couldn't reach Anthropic at api.anthropic.com through your proxy.
  </Callout>
);

// jsdom lays nothing out, so these check the classes that let the label fit a 195px line; the
// PR for HAL-13770 has the real browser at 195px and 1280px.
verifies("kit.callout-phone-wrap", () => {
  it("wraps the action's label between words from the left, with ↗ after its last word", () => {
    const { container } = render(proxyCallout);
    const button = container.querySelector("button") as HTMLButtonElement;
    const label = button.firstElementChild as HTMLElement;
    expect(label.className.split(" ")).toEqual([
      "phone:text-start",
      // With the button's own 2px, 8px above and below, so a wrapped first line doesn't sit on the border.
      "phone:py-1.5",
    ]);
    expect(label.textContent).toBe("Model calls through a proxy ↗. Opens GitHub");
    // The kit's button wraps its label and is never wider than its box (kit.button).
    expect(button.className.split(" ")).toContain("max-w-full");
    expect(button.className).not.toContain("whitespace-nowrap");
    // The button's height is a minimum, so a second line makes it taller.
    expect(button.className).toContain("min-h-control-sm");
    expect(button.className).not.toMatch(/(^| )h-/);
  });

  it("lets the action narrow to the Callout's width on a phone, through the Tooltip's wrapper", () => {
    const { container } = render(proxyCallout);
    const button = container.querySelector("button") as HTMLButtonElement;
    // The button sits in the Tooltip's wrapper, which is the action row's child.
    const row = button.parentElement?.parentElement as HTMLElement;
    expect(row.className.split(" ")).toEqual(
      expect.arrayContaining(["flex-wrap", "phone:*:max-w-full"]),
    );
  });

  it("changes nothing on desktop, and leaves the kit's other buttons as they are", () => {
    const { container } = render(
      <>
        {proxyCallout}
        <Button>Model calls through a proxy</Button>
      </>,
    );
    const [action, other] = [...container.querySelectorAll("button")];
    const row = action?.parentElement?.parentElement as HTMLElement;
    const label = action?.firstElementChild as HTMLElement;
    // Every class the Callout adds is for the phone only.
    expect(label.className.split(" ").every((name) => name.startsWith("phone:"))).toBe(true);
    expect(row.className.split(" ")).not.toContain("max-w-full");
    expect(other?.innerHTML).not.toContain("phone:py-1.5");
  });
});
