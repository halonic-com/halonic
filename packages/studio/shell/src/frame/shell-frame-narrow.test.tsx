// @vitest-environment jsdom

import { createToastStore, useNarrow, usePresentation } from "@halonicjs/studio-kit";
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
  media = new FakeMediaQueries(1280);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

function ShowLayout() {
  return <p>{`${usePresentation()} ${useNarrow() ? "narrow" : "wide"}`}</p>;
}

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
    >
      <ShowLayout />
    </ShellFrame>,
  );
}

verifies("shell.frame-narrow", () => {
  it("says a window narrower than 900px is narrow, a phone included, and follows the width", () => {
    const container = renderFrame();
    const page = () => container.querySelector("main")?.textContent;
    expect(page()).toBe("desktop wide");
    act(() => media.resize(640));
    expect(page()).toBe("desktop narrow");
    act(() => media.resize(390));
    expect(page()).toBe("phone narrow");
    act(() => media.resize(900));
    expect(page()).toBe("desktop wide");
  });
});
