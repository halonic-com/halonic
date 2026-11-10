// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemGone } from "./item-gone.tsx";

afterEach(unmountAll);

verifies("shell.item-gone", () => {
  it("says the item isn't in this workspace any more and offers its place", async () => {
    const onGoTo = vi.fn();
    const container = render(<ItemGone kindName="run" place="Runs" onGoTo={onGoTo} />);
    const title = container.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("This run isn't in this workspace any more.");
    expect(document.activeElement).toBe(title);

    const goTo = container.querySelector("button") as HTMLButtonElement;
    expect(goTo.textContent).toBe("Go to Runs");
    await act(async () => goTo.click());
    expect(onGoTo).toHaveBeenCalledTimes(1);
  });
});
