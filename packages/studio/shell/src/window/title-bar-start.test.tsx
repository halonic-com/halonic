// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { TITLE_BAR_START_PAST_SIDEBAR, TitleBarStart } from "./title-bar-start.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

function start(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-title-bar-start]") as HTMLElement;
}

verifies("shell.frame", () => {
  it("reaches past the sidebar's width, so the tabs start where the framed panel does", () => {
    const container = render(<TitleBarStart sidebarWidth={300}>Halonic Studio</TitleBarStart>);

    expect(TITLE_BAR_START_PAST_SIDEBAR).toBe(2);
    expect(start(container).style.minWidth).toBe("302px");
  });

  it("takes only its own width in a narrow window, where the sidebar is the Places drawer", () => {
    const container = render(<TitleBarStart sidebarWidth={300}>Halonic Studio</TitleBarStart>);
    act(() => media.resize(800));

    expect(start(container).style.minWidth).toBe("");
  });
});
