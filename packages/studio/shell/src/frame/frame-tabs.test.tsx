// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

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

function renderFrame() {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  return render(
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, timers)}
      toasts={createToastStore()}
      language="en"
      titleBar={<button type="button">Back</button>}
      tabs={<div role="tablist" aria-label="Open tabs" />}
    >
      <h1>Home</h1>
    </ShellFrame>,
  );
}

verifies("shell.frame", () => {
  it("puts the window tabs at the top of the framed panel, above the page, not in the title bar", () => {
    const container = renderFrame();
    const panel = container.querySelector("[data-framed-panel]");
    const tabs = container.querySelector('[role="tablist"]');

    expect(container.querySelector("header")?.contains(tabs)).toBe(false);
    expect(panel?.contains(tabs)).toBe(true);
    const main = panel?.querySelector("main") ?? null;
    expect(tabs?.compareDocumentPosition(main as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows no tabs on a phone", () => {
    const container = renderFrame();
    act(() => media.resize(390));

    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });
});
