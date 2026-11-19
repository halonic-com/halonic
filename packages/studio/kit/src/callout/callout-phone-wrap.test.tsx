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

// jsdom lays nothing out, so these check the classes that let the label fit a 195px line.
verifies("kit.callout-phone-wrap", () => {
  it("wraps the action's label between words on a phone, with ↗ after its last word", () => {
    const { container } = render(proxyCallout);
    const button = container.querySelector("button") as HTMLButtonElement;
    const label = button.firstElementChild as HTMLElement;
    expect(label.className.split(" ")).toEqual(["phone:whitespace-normal", "phone:text-start"]);
    expect(label.textContent).toBe("Model calls through a proxy ↗. Opens GitHub");
    // The button's height is a minimum, so a second line makes it taller.
    expect(button.className).toContain("min-h-control-sm");
    expect(button.className).not.toMatch(/(^| )h-/);
  });

  it("keeps the desktop on one line, and leaves the kit's other buttons as they are", () => {
    const { container } = render(
      <>
        {proxyCallout}
        <Button>Model calls through a proxy</Button>
      </>,
    );
    const [action, other] = [...container.querySelectorAll("button")];
    expect(action?.className).toContain("whitespace-nowrap");
    expect(other?.className).toContain("whitespace-nowrap");
    expect(other?.innerHTML).not.toContain("phone:whitespace-normal");
  });
});
