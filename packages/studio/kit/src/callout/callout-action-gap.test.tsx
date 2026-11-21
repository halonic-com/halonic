// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Callout } from "./callout.tsx";

afterEach(() => {
  unmountAll();
});

// jsdom has no forced colours, so this checks the classes; the C399 check has the real browser.
verifies("kit.callout-action-gap", () => {
  it("keeps 4px between the actions in high contrast only", () => {
    const { container } = render(
      <Callout
        tone="danger"
        action={[
          { label: "Model calls through a proxy", opens: "Opens GitHub", onClick: vi.fn() },
          { label: "Run again", onClick: vi.fn() },
        ]}
      >
        Halonic couldn't reach Anthropic at api.anthropic.com through your proxy.
      </Callout>,
    );
    const row = container.querySelector("button")?.parentElement?.parentElement as HTMLElement;
    const classes = row.className.split(" ");
    expect(classes).toContain("forced-colors:gap-1");
    expect(classes.filter((name) => name.startsWith("gap-"))).toEqual([]);
  });
});
